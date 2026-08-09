/**
 * reextract_landmarks.js
 * Re-extrae landmarks de todos los videos en public/videos/signs/
 * usando MediaPipe HandLandmarker con los parámetros afinados:
 *   - confianza 0.25, 2 manos, suavizado temporal 0.5, persistencia 10 frames
 *   - delegate CPU, modo IMAGE
 * Guarda los JSONs en public/training_data/<categoria>/<SEÑA>_<n>.json
 */

const fs = require("fs");
const path = require("path");
const { HandLandmarker, FilesetResolver } = require("@mediapipe/tasks-vision");
const ffmpeg = require("ffmpeg-static");

// ── Configuración ──
const ROOT = path.resolve(__dirname, "..");
const SIGNS_DIR = path.join(ROOT, "public", "videos", "signs");
const TRAINING_DIR = path.join(ROOT, "public", "training_data");
const MANIFEST = path.join(TRAINING_DIR, "manifest.json");
const TMP_DIR = path.join(ROOT, "tmp_frames");

const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const FRAME_STEP = 1 / 30; // 30fps
const SMOOTH = 0.5;
const MAX_PERSIST = 10;
const CONFIDENCE = 0.25;

function slugify(text) {
  return text.toUpperCase().trim()
    .replace(/[ÁÀÄÂ]/g, "A").replace(/[ÉÈËÊ]/g, "E")
    .replace(/[ÍÌÏÎ]/g, "I").replace(/[ÓÒÖÔ]/g, "O")
    .replace(/[ÚÙÜÛ]/g, "U").replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ── Extraer frames de un video con ffmpeg ──
function extractFrames(videoPath, outDir) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // Limpiar frames anteriores
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".jpg")) fs.unlinkSync(path.join(outDir, f));
  }

  return new Promise((resolve, reject) => {
    const { execFile } = require("child_process");
    const args = [
      "-i", videoPath,
      "-vf", "fps=30",
      "-q:v", "2",
      path.join(outDir, "frame_%05d.jpg"),
      "-y",
    ];
    execFile(ffmpeg, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`ffmpeg error: ${err.message}`));
        return;
      }
      const frames = fs.readdirSync(outDir)
        .filter(f => f.endsWith(".jpg"))
        .sort()
        .map(f => path.join(outDir, f));
      resolve(frames);
    });
  });
}

// ── Cargar imagen como MediaPipe Image ──
async function loadImage(filePath, vision) {
  // Usar canvas de Node para cargar la imagen
  const { createCanvas, loadImage: canvasLoadImage } = require("canvas");
  const img = await canvasLoadImage(filePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const { Image } = require("@mediapipe/tasks-vision");
  return new Image(imageData.data, imageData.width, imageData.height, false);
}

// ── Procesar un video ──
async function processVideo(videoPath, signName, hl, frameDir) {
  const frames = await extractFrames(videoPath, frameDir);
  if (frames.length === 0) {
    console.log(`    ✗ Sin frames extraídos`);
    return null;
  }

  const result = [];
  let prevLms = null;
  let persistCount = 0;

  for (let i = 0; i < frames.length; i++) {
    const t = i * FRAME_STEP;
    let lms = null;

    try {
      const mpImage = await loadImage(frames[i]);
      const res = hl.detect(mpImage);
      const allHands = res?.landmarks || [];
      const handedness = res?.handedness || [];

      if (allHands.length > 0) {
        if (allHands.length === 1) {
          lms = allHands[0];
        } else {
          // Preferir mano "Right" (dominante en LSM)
          const rightIdx = handedness.findIndex(h => h?.[0]?.categoryName === "Right");
          lms = rightIdx >= 0 ? allHands[rightIdx] : allHands[0];
        }
      }
    } catch (e) {
      // Error en detección, saltar frame
    }

    if (lms) {
      // Suavizado temporal
      if (prevLms) {
        lms = lms.map((p, j) => ({
          x: lerp(prevLms[j].x, p.x, SMOOTH),
          y: lerp(prevLms[j].y, p.y, SMOOTH),
          z: lerp(prevLms[j].z || 0, p.z || 0, SMOOTH),
        }));
      }
      prevLms = lms;
      persistCount = 0;

      result.push({
        videoTime: +t.toFixed(4),
        landmarks: lms.map(lm => ({
          x: +lm.x.toFixed(4),
          y: +lm.y.toFixed(4),
          z: +lm.z.toFixed(4),
        })),
      });
    } else {
      // Persistencia: mantener última posición
      if (prevLms && persistCount < MAX_PERSIST) {
        persistCount++;
        result.push({
          videoTime: +t.toFixed(4),
          landmarks: prevLms.map(lm => ({
            x: +lm.x.toFixed(4),
            y: +lm.y.toFixed(4),
            z: +lm.z.toFixed(4),
          })),
        });
      }
    }
  }

  // Limpiar frames temporales
  for (const f of frames) {
    try { fs.unlinkSync(f); } catch {}
  }

  return result;
}

// ── Guardar JSON de entrenamiento ──
function saveTrainingJson(category, signName, frames, source) {
  const catDir = path.join(TRAINING_DIR, category);
  fs.mkdirSync(catDir, { recursive: true });

  // Numeración acumulativa
  let startN = 0;
  for (const f of fs.readdirSync(catDir)) {
    const m = f.match(new RegExp("^" + signName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "_(\\d+)\\.json$"));
    if (m) startN = Math.max(startN, parseInt(m[1], 10));
  }

  const n = startN + 1;
  const outPath = path.join(catDir, `${signName}_${n}.json`);
  const data = frames.map(f => ({
    videoTime: f.videoTime,
    sign: signName,
    source: source,
    landmarks: f.landmarks,
  }));
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  return outPath;
}

// ── Main ──
async function main() {
  console.log("=== Re-extracción de Landmarks ===\n");

  // Cargar manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  console.log(`Manifest cargado: ${Object.values(manifest).flat().length} señas\n`);

  // Inicializar MediaPipe
  console.log("Inicializando MediaPipe HandLandmarker (CPU, IMAGE mode)...");
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const hl = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "CPU" },
    runningMode: "IMAGE",
    numHands: 2,
    minHandDetectionConfidence: CONFIDENCE,
    minHandPresenceConfidence: CONFIDENCE,
    minTrackingConfidence: 0.2,
  });
  console.log("MediaPipe listo.\n");

  // Crear dir temporal
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  let total = 0, ok = 0, fail = 0, skip = 0;
  const startTime = Date.now();

  for (const [category, signs] of Object.entries(manifest)) {
    console.log(`\n--- ${category.toUpperCase()} (${signs.length} señas) ---`);

    for (const sign of signs) {
      total++;
      const slug = slugify(sign);

      // Buscar video en public/videos/signs/
      let videoPath = null;
      for (const ext of [".mp4", ".webm", ".mov", ".avi"]) {
        const candidate = path.join(SIGNS_DIR, slug + ext);
        if (fs.existsSync(candidate)) { videoPath = candidate; break; }
        // Intentar con el nombre original (sin slugify)
        const candidate2 = path.join(SIGNS_DIR, sign + ext);
        if (fs.existsSync(candidate2)) { videoPath = candidate2; break; }
      }

      if (!videoPath) {
        console.log(`  [${total}] ${sign} ⏭️  (sin video)`);
        skip++;
        continue;
      }

      const frameDir = path.join(TMP_DIR, slug);
      process.stdout.write(`  [${total}] ${sign} 📁 ${path.basename(videoPath)}... `);

      try {
        const frames = await processVideo(videoPath, slug, hl, frameDir);
        if (!frames || frames.length < 5) {
          console.log(`✗ (${frames ? frames.length : 0} frames)`);
          fail++;
          continue;
        }

        const outPath = saveTrainingJson(category, slug, frames, path.basename(videoPath));
        console.log(`✓ ${frames.length} frames → ${path.basename(outPath)}`);
        ok++;
      } catch (e) {
        console.log(`✗ ${e.message}`);
        fail++;
      }
    }
  }

  // Limpiar
  hl.close();
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Resumen ===`);
  console.log(`Total: ${total} | OK: ${ok} | Fallidos: ${fail} | Sin video: ${skip}`);
  console.log(`Tiempo: ${elapsed}s`);
}

main().catch(e => { console.error("Error fatal:", e); process.exit(1); });

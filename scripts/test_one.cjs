const { HandLandmarker, FilesetResolver, Image } = require("@mediapipe/tasks-vision");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const ffmpeg = require("ffmpeg-static");

async function main() {
  console.log("Inicializando MediaPipe...");
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
  const hl = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "CPU",
    },
    runningMode: "IMAGE",
    numHands: 2,
    minHandDetectionConfidence: 0.25,
    minHandPresenceConfidence: 0.25,
    minTrackingConfidence: 0.2,
  });
  console.log("MediaPipe listo.");

  // Extraer frames de COMER.mp4
  const outDir = "tmp_test";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  for (const f of fs.readdirSync(outDir)) if (f.endsWith(".jpg")) fs.unlinkSync(path.join(outDir, f));

  console.log("Extrayendo frames con ffmpeg...");
  await new Promise((resolve, reject) => {
    execFile(ffmpeg, ["-i", "public/videos/signs/COMER.mp4", "-vf", "fps=30", "-q:v", "2", path.join(outDir, "frame_%05d.jpg"), "-y"], { maxBuffer: 10 * 1024 * 1024 }, (err) => {
      if (err) reject(err); else resolve();
    });
  });

  const frames = fs.readdirSync(outDir).filter(f => f.endsWith(".jpg")).sort();
  console.log(`Frames extraídos: ${frames.length}`);

  let detected = 0;
  for (let i = 0; i < Math.min(frames.length, 10); i++) {
    const img = await loadImage(path.join(outDir, frames[i]));
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const mpImage = new Image(imageData.data, imageData.width, imageData.height, false);
    const res = hl.detect(mpImage);
    const hands = res.landmarks?.length || 0;
    if (hands > 0) detected++;
    console.log(`  Frame ${i + 1}: ${hands} manos, handedness=${JSON.stringify(res.handedness?.map(h => h.map(x => x.categoryName)))}`);
  }

  console.log(`\nDetectado en ${detected}/10 frames`);
  hl.close();
  fs.rmSync(outDir, { recursive: true, force: true });
}

main().catch(e => console.error("Error:", e));

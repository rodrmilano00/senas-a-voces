// scripts/augment_training_data.js
// Genera ejemplos sintéticos adicionales a partir de los JSON de training_data
// usando augmentación de landmarks: ruido espacial, rotación leve, time-warp y speed variation.
// Esto multiplica los ejemplos por seña para mejorar la separabilidad del DTW.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_ROOT = join(__dirname, "..", "public", "training_data");
const FLUTTER_ROOT = join(__dirname, "..", "flutter_app", "assets", "training_data");
const AUGMENTATIONS_PER_FILE = 5; // genera _2.._6 (5 augmentaciones por seña)

// ── Utilidades ──

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function randn() {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Rota los landmarks alrededor de la muñeca (punto 0) en el plano XY
function rotateLandmarks(landmarks, angleRad) {
  if (!landmarks) return null;
  const wrist = landmarks[0];
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return landmarks.map(lm => {
    const dx = lm.x - wrist.x;
    const dy = lm.y - wrist.y;
    return {
      x: wrist.x + dx * cos - dy * sin,
      y: wrist.y + dx * sin + dy * cos,
      z: lm.z,
    };
  });
}

// Escala los landmarks relativos a la muñeca
function scaleLandmarks(landmarks, factor) {
  if (!landmarks) return null;
  const wrist = landmarks[0];
  return landmarks.map(lm => ({
    x: wrist.x + (lm.x - wrist.x) * factor,
    y: wrist.y + (lm.y - wrist.y) * factor,
    z: lm.z * factor,
  }));
}

// Añade ruido gaussiano a cada coordenada
function jitterLandmarks(landmarks, sigma) {
  if (!landmarks) return null;
  return landmarks.map(lm => ({
    x: clamp(lm.x + randn() * sigma, 0, 1),
    y: clamp(lm.y + randn() * sigma, 0, 1),
    z: clamp(lm.z + randn() * sigma * 0.5, -0.5, 0.5),
  }));
}

// Time warp: remuestrea la secuencia de frames a una nueva longitud
function resampleFrames(frames, targetLen) {
  if (frames.length === 0 || targetLen <= 0) return frames;
  if (frames.length === 1) return Array(targetLen).fill(frames[0]);
  const result = [];
  for (let i = 0; i < targetLen; i++) {
    const t = (i / (targetLen - 1)) * (frames.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(lo + 1, frames.length - 1);
    const frac = t - lo;
    const f0 = frames[lo];
    const f1 = frames[hi];
    const out = {
      videoTime: f0.videoTime + (f1.videoTime - f0.videoTime) * frac,
      sign: f0.sign,
      source: (f0.source || "") + " (aug)",
    };
    // Interpolar landmarksRight
    if (f0.landmarksRight && f1.landmarksRight) {
      out.landmarksRight = f0.landmarksRight.map((lm, idx) => {
        const lm1 = f1.landmarksRight[idx];
        return {
          x: lm.x + (lm1.x - lm.x) * frac,
          y: lm.y + (lm1.y - lm.y) * frac,
          z: lm.z + (lm1.z - lm.z) * frac,
        };
      });
    } else if (f0.landmarks) {
      // Legacy fallback
      out.landmarksRight = f0.landmarks.map((lm, idx) => {
        const lm1 = f1.landmarks ? f1.landmarks[idx] : lm;
        return {
          x: lm.x + (lm1.x - lm.x) * frac,
          y: lm.y + (lm1.y - lm.y) * frac,
          z: lm.z + (lm1.z - lm.z) * frac,
        };
      });
    }
    // Interpolar landmarksLeft
    if (f0.landmarksLeft && f1.landmarksLeft) {
      out.landmarksLeft = f0.landmarksLeft.map((lm, idx) => {
        const lm1 = f1.landmarksLeft[idx];
        return {
          x: lm.x + (lm1.x - lm.x) * frac,
          y: lm.y + (lm1.y - lm.y) * frac,
          z: lm.z + (lm1.z - lm.z) * frac,
        };
      });
    }
    result.push(out);
  }
  return result;
}

// ── Estrategias de augmentación ──

function augmentRotate(frames) {
  const angle = (randn() * 0.03); // ±~1.7 grados
  return frames.map(f => ({
    ...f,
    landmarksRight: rotateLandmarks(f.landmarksRight ?? f.landmarks, angle),
    landmarksLeft: rotateLandmarks(f.landmarksLeft, angle),
  }));
}

function augmentJitter(frames) {
  const sigma = 0.003;
  return frames.map(f => ({
    ...f,
    landmarksRight: jitterLandmarks(f.landmarksRight ?? f.landmarks, sigma),
    landmarksLeft: jitterLandmarks(f.landmarksLeft, sigma),
  }));
}

function augmentScale(frames) {
  const factor = 1 + randn() * 0.03; // ±1.7%
  return frames.map(f => ({
    ...f,
    landmarksRight: scaleLandmarks(f.landmarksRight ?? f.landmarks, factor),
    landmarksLeft: scaleLandmarks(f.landmarksLeft, factor),
  }));
}

function augmentTimeWarp(frames) {
  const ratio = 1 + randn() * 0.08; // ±4.6% length change
  const newLen = Math.max(4, Math.round(frames.length * ratio));
  return resampleFrames(frames, newLen);
}

function augmentCombo(frames) {
  // Rotación leve + jitter leve + escala leve
  const angle = randn() * 0.02;
  const sigma = 0.0015;
  const factor = 1 + randn() * 0.015;
  return frames.map(f => ({
    ...f,
    landmarksRight: jitterLandmarks(scaleLandmarks(rotateLandmarks(f.landmarksRight ?? f.landmarks, angle), factor), sigma),
    landmarksLeft: jitterLandmarks(scaleLandmarks(rotateLandmarks(f.landmarksLeft, angle), factor), sigma),
  }));
}

function augmentSpeedVar(frames) {
  // Variación de velocidad más agresiva: 80%-120% del largo original
  const ratio = 0.8 + Math.random() * 0.4;
  const newLen = Math.max(4, Math.round(frames.length * ratio));
  return resampleFrames(frames, newLen);
}

const AUGMENT_STRATEGIES = [
  augmentRotate,
  augmentJitter,
  augmentScale,
  augmentTimeWarp,
  augmentCombo,
  augmentSpeedVar,
];

// ── Lógica principal ──

function parseFilename(filename) {
  // SIGN_N.json -> { sign: "SIGN", n: N }
  const base = filename.replace(/\.json$/i, "");
  const match = base.match(/^(.+)_(\d+)$/);
  if (!match) return { sign: base, n: 1 };
  return { sign: match[1], n: parseInt(match[2], 10) };
}

function findNextAvailableNumber(dir, sign) {
  let n = 2;
  while (existsSync(join(dir, `${sign}_${n}.json`))) n++;
  return n;
}

function processCategory(categoryDir, flutterCategoryDir) {
  if (!existsSync(categoryDir)) return 0;
  const files = readdirSync(categoryDir).filter(f => f.endsWith(".json") && f !== "manifest.json");
  let generated = 0;

  for (const file of files) {
    const { sign, n } = parseFilename(file);
    if (n !== 1) continue; // Solo augmentar el _1 original (o el primer archivo disponible)

    const filePath = join(categoryDir, file);
    const raw = readFileSync(filePath, "utf-8");
    let frames;
    try {
      frames = JSON.parse(raw);
    } catch {
      console.warn(`  ⚠ No se pudo parsear ${file}`);
      continue;
    }
    if (!Array.isArray(frames) || frames.length < 4) continue;

    const nextN = findNextAvailableNumber(categoryDir, sign);
    const strategies = AUGMENT_STRATEGIES.slice(0, AUGMENTATIONS_PER_FILE);

    for (let i = 0; i < strategies.length; i++) {
      const augFrames = strategies[i](frames);
      const fileNum = nextN + i;
      const outName = `${sign}_${fileNum}.json`;
      const outPath = join(categoryDir, outName);
      writeFileSync(outPath, JSON.stringify(augFrames), "utf-8");
      generated++;

      // Copiar también a Flutter
      if (flutterCategoryDir && existsSync(flutterCategoryDir)) {
        writeFileSync(join(flutterCategoryDir, outName), JSON.stringify(augFrames), "utf-8");
      }
    }
    console.log(`  ${sign}: +${strategies.length} ejemplos (${nextN}..${nextN + strategies.length - 1})`);
  }
  return generated;
}

function rebuildManifest(rootDir) {
  const categories = {};
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const catDir = join(rootDir, entry.name);
    const files = readdirSync(catDir).filter(f => f.endsWith(".json") && f !== "manifest.json");
    const signs = new Set();
    for (const f of files) {
      const { sign } = parseFilename(f);
      signs.add(sign);
    }
    categories[entry.name] = [...signs].sort();
  }
  const manifestPath = join(rootDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(categories, null, 2), "utf-8");
  return categories;
}

// ── Main ──

console.log("🔧 Augmentando training data...\n");

const categories = readdirSync(TRAINING_ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);

let totalGenerated = 0;
for (const cat of categories) {
  console.log(`\n📂 ${cat}`);
  const webDir = join(TRAINING_ROOT, cat);
  const flutterDir = join(FLUTTER_ROOT, cat);
  totalGenerated += processCategory(webDir, flutterDir);
}

console.log(`\n✅ Total archivos generados: ${totalGenerated}`);

// Regenerar manifests
console.log("\n📋 Regenerando manifests...");
const webManifest = rebuildManifest(TRAINING_ROOT);
const flutterManifest = rebuildManifest(FLUTTER_ROOT);

const webCount = Object.values(webManifest).reduce((a, v) => a + v.length, 0);
const flutterCount = Object.values(flutterManifest).reduce((a, v) => a + v.length, 0);
console.log(`  Web: ${webCount} señas en ${Object.keys(webManifest).length} categorías`);
console.log(`  Flutter: ${flutterCount} señas en ${Object.keys(flutterManifest).length} categorías`);

// Contar ejemplos por seña
const exampleCounts = {};
for (const [cat, signs] of Object.entries(webManifest)) {
  for (const sign of signs) {
    const dir = join(TRAINING_ROOT, cat);
    const files = readdirSync(dir).filter(f => f.startsWith(sign + "_") && f.endsWith(".json"));
    exampleCounts[`${cat}/${sign}`] = files.length;
  }
}
const minExamples = Math.min(...Object.values(exampleCounts));
const maxExamples = Math.max(...Object.values(exampleCounts));
const avgExamples = (Object.values(exampleCounts).reduce((a, b) => a + b, 0) / Object.keys(exampleCounts).length).toFixed(1);
console.log(`\n📊 Ejemplos por seña: min=${minExamples}, max=${maxExamples}, promedio=${avgExamples}`);
console.log("✨ Done.");

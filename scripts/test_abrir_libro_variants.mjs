import { DynamicSignDetector, frameInfo } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));
const det = new DynamicSignDetector();

for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    for (let n = 1; n <= 20; n++) {
      try {
        const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_${n}.json`), "utf8"));
        det.loadPattern(sign, frames);
      } catch { break; }
    }
  }
}

// Test each ABRIR_LIBRO variant as input
for (let n = 1; n <= 6; n++) {
  const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, "palabras", `ABRIR_LIBRO_${n}.json`), "utf8"));
  det.clearBuffer();
  for (const f of frames) {
    const info = frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null);
    if (info) det.pushFrameInfo(info);
  }
  const result = det.detect();
  console.log(`ABRIR_LIBRO_${n} (${frames.length} frames): matched=${result.matched}, score=${result.score?.toFixed(4)}, accepted=${result.accepted}, margin=${result.margin?.toFixed(4)}`);
}

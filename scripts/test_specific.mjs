import { DynamicSignDetector, frameInfo, buildSequence } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));
const det = new DynamicSignDetector();

// Load all training data
for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    for (let n = 1; n <= 20; n++) {
      const path = join(TRAINING_ROOT, cat, `${sign}_${n}.json`);
      try {
        const frames = JSON.parse(readFileSync(path, "utf8"));
        det.loadPattern(sign, frames);
      } catch { break; }
    }
  }
}

console.log(`Loaded ${det.patterns.length} patterns`);

// Test specific signs
const testSigns = process.argv.slice(2);
if (testSigns.length === 0) testSigns.push("ABUELA", "ABUELO", "BEBE");

for (const sign of testSigns) {
  const p = det.patterns.find(p => p.name === sign);
  if (!p) { console.log(`${sign}: NOT LOADED`); continue; }
  console.log(`\n=== ${sign} ===`);
  console.log(`  sequences: ${p.sequences.length}, oneHanded: ${p.oneHanded}`);
  
  // Find training file
  let cat = null;
  for (const [c, signs] of Object.entries(manifest)) {
    if (signs.includes(sign)) { cat = c; break; }
  }
  
  // Feed training data into detector and see ranking
  const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_1.json`), "utf8"));
  console.log(`  training frames: ${frames.length}`);
  
  det.clearBuffer();
  for (const f of frames) {
    const info = frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null);
    if (info) det.pushFrameInfo(info);
  }
  
  const result = det.detect();
  console.log(`  detect(): matched=${result.matched}, score=${result.score?.toFixed(4)}, accepted=${result.accepted}, margin=${result.margin?.toFixed(4)}`);
  console.log(`  top 5: ${result.ranking.slice(0, 5).map(r => `${r.name}:${r.score.toFixed(4)}`).join(", ")}`);
}

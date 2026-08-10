import { DynamicSignDetector, frameInfo, buildSequence } from "../src/dynamic_sign_detector.js";
import { loadManifest, loadTrainingFile, loadAllPatterns } from "./load_training.mjs";

const manifest = loadManifest();
const det = new DynamicSignDetector();
loadAllPatterns(det);

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
  const frames = loadTrainingFile(cat, sign, 1);
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

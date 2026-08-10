import { DynamicSignDetector, frameInfo } from "../src/dynamic_sign_detector.js";
import { loadManifest, loadTrainingFile, loadAllPatterns, TRAINING_ROOT } from "./load_training.mjs";

const manifest = loadManifest();
const det = new DynamicSignDetector();
const loaded = loadAllPatterns(det);
console.log(`Loaded ${loaded} sequences`);

let ok = 0, bad = 0;
const failures = [];

for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    const frames = loadTrainingFile(cat, sign, 1);
    if (!frames) continue;
    det.clearBuffer();
    for (const f of frames) {
      const info = frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null);
      if (info) det.pushFrameInfo(info);
    }
    const result = det.detect();
    if (result.matched === sign && result.accepted) {
      ok++;
    } else {
      bad++;
      failures.push(`${sign}: matched=${result.matched}, score=${result.score?.toFixed(4)}, accepted=${result.accepted}`);
    }
  }
}

console.log(`\nResults: ${ok} OK, ${bad} BAD out of ${ok + bad}`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ${f}`);
}

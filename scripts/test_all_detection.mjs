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

let ok = 0, bad = 0;
const failures = [];

for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_1.json`), "utf8"));
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

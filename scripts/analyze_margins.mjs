import { DynamicSignDetector, frameInfo, buildSequence } from "../src/dynamic_sign_detector.js";
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

// For each sign, feed its own training data and check margin
const results = [];
for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_1.json`), "utf8"));
    det.clearBuffer();
    for (const f of frames) {
      const info = frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null);
      if (info) det.pushFrameInfo(info);
    }
    const result = det.detect();
    results.push({
      sign,
      matched: result.matched,
      score: result.score,
      margin: result.margin,
      accepted: result.accepted,
      second: result.ranking[1]?.name || "N/A",
      secondScore: result.ranking[1]?.score || Infinity,
    });
  }
}

// Sort by margin ascending (worst first)
results.sort((a, b) => a.margin - b.margin);

console.log("Worst 30 signs by margin:");
console.log("Sign          | Matched | Score  | Margin | 2nd     | 2ndScore | Accepted");
console.log("--------------|---------|--------|--------|---------|----------|---------");
for (const r of results.slice(0, 30)) {
  console.log(`${r.sign.padEnd(14)}| ${r.matched.padEnd(8)}| ${r.score.toFixed(4)} | ${r.margin.toFixed(4)} | ${r.second.padEnd(8)}| ${r.secondScore.toFixed(4)}   | ${r.accepted}`);
}

console.log(`\nTotal: ${results.length} signs`);
console.log(`Accepted: ${results.filter(r => r.accepted).length}`);
console.log(`Margin < 0.1: ${results.filter(r => r.margin < 0.1).length}`);
console.log(`Margin < 0.3: ${results.filter(r => r.margin < 0.3).length}`);
console.log(`Margin < 0.5: ${results.filter(r => r.margin < 0.5).length}`);
console.log(`Margin >= 0.5: ${results.filter(r => r.margin >= 0.5).length}`);
console.log(`Margin >= 1.0: ${results.filter(r => r.margin >= 1.0).length}`);

// Find confusing pairs
console.log("\n\nMost confusing pairs (margin < 0.3):");
for (const r of results.filter(r => r.margin < 0.3)) {
  console.log(`  ${r.sign} -> ${r.second} (margin=${r.margin.toFixed(4)})`);
}

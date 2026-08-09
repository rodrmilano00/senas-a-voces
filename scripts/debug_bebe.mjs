import { DynamicSignDetector, frameInfo, buildSequence } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));
const det = new DynamicSignDetector();

// Load all
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

const sign = "BEBE";
const cat = "familia";
const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_1.json`), "utf8"));

console.log(`BEBE_1: ${frames.length} frames`);
console.log(`Frame 0: R=${!!frames[0].landmarksRight} L=${!!frames[0].landmarksLeft}`);

// Build sequence manually
const infos = frames.map(f => frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null)).filter(Boolean);
const seq = buildSequence(infos);
console.log(`Built seq: ${seq.length} frames, dim=${seq[0]?.length}`);

// Find BEBE pattern
const p = det.patterns.find(p => p.name === sign);
console.log(`Pattern: ${p.sequences.length} seqs, seq[0] length=${p.sequences[0]?.length}, dim=${p.sequences[0]?.[0]?.length}`);

// Check if dimensions match
console.log(`Manual seq[0] dim: ${seq[0]?.length}, pattern seq[0][0] dim: ${p.sequences[0]?.[0]?.length}`);

// Feed into detector and get full ranking
det.clearBuffer();
for (const f of frames) {
  const info = frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null);
  if (info) det.pushFrameInfo(info);
}

const result = det.detect();
console.log(`\nFull ranking (30):`);
for (const r of result.ranking.slice(0, 30)) {
  console.log(`  ${r.name}: ${r.score.toFixed(4)}`);
}

// Check if BEBE is in ranking at all
const bebeRank = result.ranking.findIndex(r => r.name === sign);
console.log(`\nBEBE rank position: ${bebeRank}`);

// Check pre-filter: get buffer centroid vs pattern centroids
const status = det.getStatus();
console.log(`\nDetector status: ${JSON.stringify(status)}`);

import { DynamicSignDetector, frameInfo, buildSequence } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));
const det = new DynamicSignDetector();

const patternFrames = {};
for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    for (let n = 1; n <= 20; n++) {
      try {
        const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_${n}.json`), "utf8"));
        det.loadPattern(sign, frames);
        if (!patternFrames[sign]) patternFrames[sign] = frames;
      } catch { break; }
    }
  }
}

// Build ABRIR_LIBRO sequence
const target = "ABRIR_LIBRO";
const targetFrames = patternFrames[target];
const targetInfos = targetFrames.map(f => frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null)).filter(Boolean);
const targetSeq = buildSequence(targetInfos);

// DTW against all other patterns
const distances = [];
for (const p of det.patterns) {
  if (p.name === target) continue;
  for (const seq of p.sequences) {
    // Simple DTW
    const n = targetSeq.length, m = seq.length;
    let prev = new Array(m + 1).fill(Infinity);
    let curr = new Array(m + 1).fill(Infinity);
    prev[0] = 0;
    for (let i = 1; i <= n; i++) {
      curr[0] = Infinity;
      for (let j = 1; j <= m; j++) {
        let s = 0;
        const a = targetSeq[i-1], b = seq[j-1];
        const nn = Math.min(a.length, b.length);
        for (let k = 0; k < nn; k++) { const d = a[k]-b[k]; s += d*d; }
        curr[j] = Math.sqrt(s) + Math.min(prev[j], curr[j-1], prev[j-1]);
      }
      [prev, curr] = [curr, prev];
      curr.fill(Infinity);
    }
    const d = prev[m] / (n + m);
    distances.push({ name: p.name, dist: d });
  }
}

distances.sort((a, b) => a.dist - b.dist);
console.log(`ABRIR_LIBRO vs all signs (closest 15):`);
for (const d of distances.slice(0, 15)) {
  console.log(`  ${d.name.padEnd(20)}: ${d.dist.toFixed(4)}`);
}

// Also show the feature vectors for first few frames
console.log(`\nABRIR_LIBRO feature vectors (first 5 frames):`);
for (let i = 0; i < Math.min(5, targetSeq.length); i++) {
  console.log(`  [${i}]: [${targetSeq[i].map(v=>v.toFixed(3)).join(", ")}]`);
}

// Check finger states per frame
console.log(`\nABRIR_LIBRO finger states per frame:`);
import { fingerStates } from "../src/lsm_detector.js";
for (let i = 0; i < targetFrames.length; i++) {
  const f = targetFrames[i];
  const hand = f.landmarksRight || f.landmarks;
  if (!hand) continue;
  const fs = fingerStates(hand);
  console.log(`  [${i}] ang: i=${(fs.ang?.index||0).toFixed(0)} m=${(fs.ang?.middle||0).toFixed(0)} r=${(fs.ang?.ring||0).toFixed(0)} p=${(fs.ang?.pinky||0).toFixed(0)} t=${(fs.ang?.thumb||0).toFixed(0)} | ext: t=${fs.thumb} i=${fs.index} m=${fs.middle} r=${fs.ring} p=${fs.pinky} | palmY=${(fs.palmOriY||0).toFixed(2)} | wrist=(${hand[0].x.toFixed(3)},${hand[0].y.toFixed(3)})`);
}

import { DynamicSignDetector, frameInfo, buildSequence } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const det = new DynamicSignDetector();

// Load just ABRIR_LIBRO
for (let n = 1; n <= 6; n++) {
  const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, "palabras", `ABRIR_LIBRO_${n}.json`), "utf8"));
  det.loadPattern("ABRIR_LIBRO", frames);
}

const p = det.patterns.find(p => p.name === "ABRIR_LIBRO");
console.log(`Sequences: ${p.sequences.length}`);
console.log(`Seq lengths: ${p.sequences.map(s => s.length).join(", ")}`);

// DTW between all pairs
function dtw(seqA, seqB) {
  const n = seqA.length, m = seqB.length;
  let prev = new Array(m + 1).fill(Infinity);
  let curr = new Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      let s = 0;
      const a = seqA[i-1], b = seqB[j-1];
      const nn = Math.min(a.length, b.length);
      for (let k = 0; k < nn; k++) { const d = a[k]-b[k]; s += d*d; }
      curr[j] = Math.sqrt(s) + Math.min(prev[j], curr[j-1], prev[j-1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(Infinity);
  }
  return prev[m] / (n + m);
}

console.log("\nIntra-sign DTW distances:");
for (let i = 0; i < p.sequences.length; i++) {
  for (let j = i + 1; j < p.sequences.length; j++) {
    const d = dtw(p.sequences[i], p.sequences[j]);
    console.log(`  seq[${i}] vs seq[${j}] = ${d.toFixed(4)}`);
  }
}

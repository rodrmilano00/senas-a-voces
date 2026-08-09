import { DynamicSignDetector, frameInfo } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));

// Load ALL patterns to test real scenario
const det = new DynamicSignDetector();
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

function dtw(seqA, seqB) {
  const n = seqA.length, m = seqB.length;
  if (n === 0 || m === 0) return Infinity;
  let prev = new Array(m + 1).fill(Infinity);
  let curr = new Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      let s = 0;
      const a = seqA[i - 1], b = seqB[j - 1];
      const nn = Math.min(a.length, b.length);
      for (let k = 0; k < nn; k++) { const d = a[k] - b[k]; s += d * d; }
      const cost = Math.sqrt(s);
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(Infinity);
  }
  return prev[m] / (n + m);
}

const cunada = det.patterns.find(p => p.name === "CUNADA");
const cunado = det.patterns.find(p => p.name === "CUNADO");

console.log(`CUNADA: ${cunada.sequences.length} seqs, lengths: ${cunada.sequences.map(s=>s.length).join(",")}`);
console.log(`CUNADO: ${cunado.sequences.length} seqs, lengths: ${cunado.sequences.map(s=>s.length).join(",")}`);

// Test: feed CUNADO sequence into detector buffer and see what it matches
console.log("\n--- Feeding CUNADO_1 into detector ---");
const cunadoFrames = JSON.parse(readFileSync(join(TRAINING_ROOT, "familia", "CUNADO_1.json"), "utf8"));
det.clearBuffer();
for (const f of cunadoFrames) {
  const info = frameInfo(f.landmarksRight ?? null, f.landmarksLeft ?? null);
  det.pushFrameInfo(info);
}
const result = det.detect();
console.log("detect():", result);
const ranking = det.detectRanking();
console.log("ranking:", ranking.map(r => `${r.name}:${r.score.toFixed(4)}`).join(", "));

console.log("\n--- Feeding CUNADA_1 into detector ---");
const cunadaFrames = JSON.parse(readFileSync(join(TRAINING_ROOT, "familia", "CUNADA_1.json"), "utf8"));
det.clearBuffer();
for (const f of cunadaFrames) {
  const info = frameInfo(f.landmarksRight ?? null, f.landmarksLeft ?? null);
  det.pushFrameInfo(info);
}
const result2 = det.detect();
console.log("detect():", result2);
const ranking2 = det.detectRanking();
console.log("ranking:", ranking2.map(r => `${r.name}:${r.score.toFixed(4)}`).join(", "));

// Cross DTW between all sequences
console.log("\n--- Cross DTW CUNADA vs CUNADO ---");
let minCross = Infinity;
for (let i = 0; i < cunada.sequences.length; i++) {
  for (let j = 0; j < cunado.sequences.length; j++) {
    const d = dtw(cunada.sequences[i], cunado.sequences[j]);
    if (d < minCross) minCross = d;
  }
}
console.log(`Min cross DTW: ${minCross.toFixed(4)}`);

console.log("\n--- Self DTW CUNADO ---");
for (let i = 0; i < cunado.sequences.length; i++) {
  for (let j = i+1; j < cunado.sequences.length; j++) {
    const d = dtw(cunado.sequences[i], cunado.sequences[j]);
    console.log(`  [${i}] vs [${j}] = ${d.toFixed(4)}`);
  }
}

import { DynamicSignDetector, frameInfo } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";

const det = new DynamicSignDetector();
const sign = process.argv[2] || "YO";
const cat = process.argv[3] || "palabras";

const frames = JSON.parse(readFileSync(`public/training_data/${cat}/${sign}_1.json`, "utf8"));
console.log(`${sign}_1: ${frames.length} frames`);
console.log("Frame 0 keys:", Object.keys(frames[0]));
console.log("Has landmarksRight:", !!frames[0].landmarksRight, "len:", frames[0].landmarksRight?.length);
console.log("Has landmarksLeft:", !!frames[0].landmarksLeft, "len:", frames[0].landmarksLeft?.length);
console.log("Has landmarks:", !!frames[0].landmarks, "len:", frames[0].landmarks?.length);

det.loadPattern(sign, frames);
const pat = det.patterns.find(p => p.name === sign);
console.log(`Sequences: ${pat.sequences.length}, oneHanded: ${pat.oneHanded}`);
console.log(`Seq 0 length: ${pat.sequences[0]?.length}`);
if (pat.sequences[1]) console.log(`Seq 1 (mirror) length: ${pat.sequences[1]?.length}`);

// DTW between seq 0 and seq 1
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

if (pat.sequences.length >= 2) {
  const d = dtw(pat.sequences[0], pat.sequences[1]);
  console.log(`DTW orig vs mirror: ${d.toFixed(4)}`);

  // Show first few feature vectors
  console.log("\nSeq 0 first 3 frames:");
  for (let i = 0; i < Math.min(3, pat.sequences[0].length); i++) {
    console.log(`  [${i}]: [${pat.sequences[0][i].map(v=>v.toFixed(3)).join(", ")}]`);
  }
  console.log("\nSeq 1 (mirror) first 3 frames:");
  for (let i = 0; i < Math.min(3, pat.sequences[1].length); i++) {
    console.log(`  [${i}]: [${pat.sequences[1][i].map(v=>v.toFixed(3)).join(", ")}]`);
  }
}

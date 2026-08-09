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

// Compare ADIOS vs BOMBERO, BOCA, OJOS
const signs = ["ADIOS", "BOMBERO", "BOCA", "OJOS"];
const seqs = {};
for (const s of signs) {
  const p = det.patterns.find(p => p.name === s);
  if (p) seqs[s] = p.sequences[0];
}

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

console.log("Cross-DTW distances:");
for (let i = 0; i < signs.length; i++) {
  for (let j = i+1; j < signs.length; j++) {
    if (!seqs[signs[i]] || !seqs[signs[j]]) continue;
    const d = dtw(seqs[signs[i]], seqs[signs[j]]);
    console.log(`  ${signs[i]} vs ${signs[j]} = ${d.toFixed(4)}`);
  }
}

// Show ADIOS feature vectors
console.log("\nADIOS first 5 frames:");
for (let i = 0; i < Math.min(5, seqs["ADIOS"].length); i++) {
  console.log(`  [${i}]: [${seqs["ADIOS"][i].map(v=>v.toFixed(3)).join(", ")}]`);
}

// Show BOMBERO feature vectors
console.log("\nBOMBERO first 5 frames:");
for (let i = 0; i < Math.min(5, seqs["BOMBERO"].length); i++) {
  console.log(`  [${i}]: [${seqs["BOMBERO"][i].map(v=>v.toFixed(3)).join(", ")}]`);
}

// Show ADIOS finger states
import { fingerStates } from "../src/lsm_detector.js";
const adiosFrames = JSON.parse(readFileSync(join(TRAINING_ROOT, "palabras", "ADIOS_1.json"), "utf8"));
console.log("\nADIOS finger states:");
for (let i = 0; i < adiosFrames.length; i++) {
  const hand = adiosFrames[i].landmarksRight || adiosFrames[i].landmarks;
  if (!hand) continue;
  const fs = fingerStates(hand);
  console.log(`  [${i}] ang: i=${(fs.ang?.index||0).toFixed(0)} m=${(fs.ang?.middle||0).toFixed(0)} r=${(fs.ang?.ring||0).toFixed(0)} p=${(fs.ang?.pinky||0).toFixed(0)} t=${(fs.ang?.thumb||0).toFixed(0)} | ext: t=${fs.thumb} i=${fs.index} m=${fs.middle} r=${fs.ring} p=${fs.pinky} | palmY=${(fs.palmOriY||0).toFixed(2)} | wrist=(${hand[0].x.toFixed(3)},${hand[0].y.toFixed(3)})`);
}

// Show BOMBERO finger states
const bomberoFrames = JSON.parse(readFileSync(join(TRAINING_ROOT, "palabras", "BOMBERO_1.json"), "utf8"));
console.log("\nBOMBERO finger states:");
for (let i = 0; i < bomberoFrames.length; i++) {
  const hand = bomberoFrames[i].landmarksRight || bomberoFrames[i].landmarks;
  if (!hand) continue;
  const fs = fingerStates(hand);
  console.log(`  [${i}] ang: i=${(fs.ang?.index||0).toFixed(0)} m=${(fs.ang?.middle||0).toFixed(0)} r=${(fs.ang?.ring||0).toFixed(0)} p=${(fs.ang?.pinky||0).toFixed(0)} t=${(fs.ang?.thumb||0).toFixed(0)} | ext: t=${fs.thumb} i=${fs.index} m=${fs.middle} r=${fs.ring} p=${fs.pinky} | palmY=${(fs.palmOriY||0).toFixed(2)} | wrist=(${hand[0].x.toFixed(3)},${hand[0].y.toFixed(3)})`);
}

import { DynamicSignDetector } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));
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

// Compare CUNADA vs CUNADO
const cunada = det.patterns.find(p => p.name === "CUNADA");
const cunado = det.patterns.find(p => p.name === "CUNADO");

console.log(`CUNADA: ${cunada.sequences.length} seqs, oneHanded: ${cunada.oneHanded}`);
console.log(`CUNADO: ${cunado.sequences.length} seqs, oneHanded: ${cunado.oneHanded}`);

console.log("\nCUNADA vs CUNADO cross-DTW:");
for (let i = 0; i < Math.min(3, cunada.sequences.length); i++) {
  for (let j = 0; j < Math.min(3, cunado.sequences.length); j++) {
    const d = dtw(cunada.sequences[i], cunado.sequences[j]);
    console.log(`  CUNADA[${i}] vs CUNADO[${j}] = ${d.toFixed(4)}`);
  }
}

console.log("\nCUNADA self-DTW:");
for (let i = 0; i < Math.min(3, cunada.sequences.length); i++) {
  for (let j = i+1; j < Math.min(3, cunada.sequences.length); j++) {
    const d = dtw(cunada.sequences[i], cunada.sequences[j]);
    console.log(`  CUNADA[${i}] vs CUNADA[${j}] = ${d.toFixed(4)}`);
  }
}

console.log("\nCUNADO self-DTW:");
for (let i = 0; i < Math.min(3, cunado.sequences.length); i++) {
  for (let j = i+1; j < Math.min(3, cunado.sequences.length); j++) {
    const d = dtw(cunado.sequences[i], cunado.sequences[j]);
    console.log(`  CUNADO[${i}] vs CUNADO[${j}] = ${d.toFixed(4)}`);
  }
}

// Check what the detector returns for CUNADO sequences
console.log("\nCUNADO detection ranking:");
for (let i = 0; i < Math.min(2, cunado.sequences.length); i++) {
  const ranking = det.detectRanking(cunado.sequences[i], 5);
  console.log(`  CUNADO seq[${i}] top5:`, ranking.map(r => `${r.name}:${r.dist.toFixed(3)}`).join(", "));
}

console.log("\nCUNADA detection ranking:");
for (let i = 0; i < Math.min(2, cunada.sequences.length); i++) {
  const ranking = det.detectRanking(cunada.sequences[i], 5);
  console.log(`  CUNADA seq[${i}] top5:`, ranking.map(r => `${r.name}:${r.dist.toFixed(3)}`).join(", "));
}

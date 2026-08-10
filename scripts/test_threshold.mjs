// test_threshold.mjs
// Barre umbrales para encontrar el optimo: maximo de correctos, minimo de falsos.
import { DynamicSignDetector, frameInfo } from "../src/dynamic_sign_detector.js";
import { loadManifest, loadTrainingFile } from "./load_training.mjs";

const HOLDOUT = 5;
const manifest = loadManifest();

const all = [];
for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    const ex = [];
    for (let n = 1; n <= 20; n++) {
      const fr = loadTrainingFile(cat, sign, n);
      if (!fr) break;
      ex.push(fr);
    }
    if (ex.length) all.push({ sign, ex });
  }
}

const det = new DynamicSignDetector();
for (const { sign, ex } of all) {
  ex.forEach((fr, i) => { if (i !== HOLDOUT) det.loadPattern(sign, fr); });
}

const scores = [];
for (const { sign, ex } of all) {
  const q = ex[HOLDOUT];
  if (!q) continue;
  det.clearBuffer();
  for (const f of q) {
    const info = frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null);
    if (info) det.pushFrameInfo(info);
  }
  const r = det.detect();
  if (!r || !r.ranking?.length) continue;
  const myScore = r.ranking.find(x => x.name === sign)?.score ?? 99;
  const second = r.ranking.find(x => x.name !== sign)?.score ?? 99;
  scores.push({ sign, score: myScore, margin: second - myScore, matched: r.matched });
}

scores.sort((a, b) => b.score - a.score);

console.log(`\nAnalisis de umbral (holdout=${HOLDOUT}, ${scores.length} senas):\n`);

const thresholds = [0.80, 0.85, 0.90, 0.95, 1.0, 1.1, 1.2, 1.3, 1.5, 2.0, 2.5, 3.0];
const margins = [0.04, 0.06, 0.08, 0.10];

for (const mg of margins) {
  console.log(`--- minMargin=${mg} ---`);
  for (const t of thresholds) {
    const pass = scores.filter(s => s.score <= t && s.margin >= mg);
    const correct = pass.filter(s => s.matched === s.sign).length;
    const fp = pass.length - correct;
    const pct = (100 * correct / scores.length).toFixed(1);
    console.log(`  threshold=${t.toFixed(2)}: ${correct}/${scores.length} (${pct}%) FP=${fp}`);
  }
  console.log();
}

// Mostrar los falsos positivos en el mejor punto
console.log("\nSenas con score > 1.5 (potencialmente problematicas):");
for (const s of scores.filter(s => s.score > 1.5)) {
  console.log(`  ${s.sign.padEnd(22)} score=${s.score.toFixed(4)} margin=${s.margin.toFixed(4)} matched=${s.matched}`);
}

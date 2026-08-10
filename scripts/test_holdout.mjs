// test_holdout.mjs
// Validacion honesta: entrena sin el ejemplo que se va a probar.
//
// test_all_detection.mjs alimenta el mismo archivo que ya esta cargado como
// patron, asi que el score siempre es 0 y el resultado no dice nada sobre
// generalizacion. Aqui, para cada sena, se excluye un ejemplo del set de
// entrenamiento y se usa como consulta.
import { DynamicSignDetector, frameInfo } from "../src/dynamic_sign_detector.js";
import { loadManifest, loadTrainingFile } from "./load_training.mjs";

const HOLDOUT_INDEX = Number(process.argv[2] ?? 5);

const manifest = loadManifest();

// Cargar todo en memoria una sola vez.
const all = []; // { sign, cat, examples: frames[][] }
for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    const examples = [];
    for (let n = 1; n <= 20; n++) {
      const fr = loadTrainingFile(cat, sign, n);
      if (!fr) break;
      examples.push(fr);
    }
    if (examples.length) all.push({ sign, cat, examples });
  }
}

console.log(`${all.length} senas, holdout = ejemplo #${HOLDOUT_INDEX}`);

// Detector entrenado con todo MENOS el ejemplo holdout de cada sena.
const det = new DynamicSignDetector();
for (const { sign, examples } of all) {
  examples.forEach((fr, i) => {
    if (i === HOLDOUT_INDEX) return;
    det.loadPattern(sign, fr);
  });
}

let ok = 0, bad = 0, skip = 0;
const failures = [];
const margins = [];

for (const { sign, examples } of all) {
  const query = examples[HOLDOUT_INDEX];
  if (!query) { skip++; continue; }

  det.clearBuffer();
  for (const f of query) {
    const info = frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null);
    if (info) det.pushFrameInfo(info);
  }
  const r = det.detect();

  if (!r) {
    bad++;
    failures.push(`${sign}: detect() = null (buffer insuficiente)`);
    continue;
  }

  if (r.matched === sign && r.accepted) {
    ok++;
    margins.push({ sign, score: r.score, margin: r.margin ?? 0 });
  } else {
    bad++;
    failures.push(
      `${sign}: matched=${r.matched ?? "-"} score=${r.score?.toFixed(4) ?? "-"} accepted=${r.accepted}` +
      (r.ranking?.length ? ` | top3: ${r.ranking.slice(0, 3).map(x => `${x.name}:${x.score.toFixed(3)}`).join(", ")}` : "")
    );
  }
}

const total = ok + bad;
console.log(`\nHoldout: ${ok}/${total} OK (${(100 * ok / total).toFixed(1)}%), ${bad} fallos, ${skip} sin ejemplo`);

if (margins.length) {
  const sorted = margins.slice().sort((a, b) => a.margin - b.margin);
  const avg = margins.reduce((s, m) => s + m.margin, 0) / margins.length;
  console.log(`Margen promedio: ${avg.toFixed(4)}`);
  console.log(`\n10 margenes mas ajustados (riesgo de confusion):`);
  for (const m of sorted.slice(0, 10)) {
    console.log(`  ${m.sign.padEnd(22)} margin=${m.margin.toFixed(4)} score=${m.score.toFixed(4)}`);
  }
}

if (failures.length) {
  console.log(`\nFallos:`);
  for (const f of failures) console.log(`  ${f}`);
}

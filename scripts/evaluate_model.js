// evaluate_model.js
// Evaluacion offline del modelo DTW usando EXACTAMENTE el mismo codigo que el
// navegador (importa src/dynamic_sign_detector.js), para que los numeros que
// reporta sean los mismos que veras en /model-test.
//
// Mide tres cosas:
//   1. Pares confundibles: las senas cuya distancia DTW entre si es tan baja
//      que el detector no puede separarlas.
//   2. Separabilidad: para cada sena, la distancia a su vecina mas cercana.
//   3. Leave-one-out: para las senas con 2+ ejemplos, si un ejemplo clasifica
//      correctamente contra los demas.
//
// Uso:
//   node scripts/evaluate_model.js
//   node scripts/evaluate_model.js --top 40 --json reporte.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fingerStates } from "../src/lsm_detector.js";
import { frameInfo, buildSequence } from "../src/dynamic_sign_detector.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TRAINING_DIR = path.join(REPO_ROOT, "public", "training_data");

// Umbrales de interpretacion (misma escala que DynamicSignDetector.threshold).
const CRITICAL = 0.15; // practicamente indistinguibles
const RISKY = 0.30;    // se confunden con ruido de camara

// ── DTW identico al de dynamic_sign_detector.js ──────────────────────────
function vecDistance(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function dtw(seqA, seqB) {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return Infinity;
  let prev = new Array(m + 1).fill(Infinity);
  let curr = new Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      const cost = vecDistance(seqA[i - 1], seqB[j - 1]);
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(Infinity);
  }
  return prev[m] / (n + m);
}

// ── Carga de patrones ────────────────────────────────────────────────────
function loadSequences() {
  const manifest = JSON.parse(fs.readFileSync(path.join(TRAINING_DIR, "manifest.json"), "utf8"));
  const signs = [];
  let skipped = 0;

  for (const [category, names] of Object.entries(manifest)) {
    if (!Array.isArray(names)) continue;
    for (const name of names) {
      const sequences = [];
      const dir = path.join(TRAINING_DIR, category);
      for (let n = 1; n <= 20; n++) {
        const file = path.join(dir, `${name}_${n}.json`);
        if (!fs.existsSync(file)) break;
        const frames = JSON.parse(fs.readFileSync(file, "utf8"));
        const infos = frames
          .map(f => frameInfo(f.fingerStates ?? fingerStates(f.landmarks), f.landmarks))
          .filter(Boolean);
        const seq = buildSequence(infos);
        if (seq.length > 0) sequences.push(seq);
        else skipped++;
      }
      if (sequences.length > 0) signs.push({ name, category, sequences });
    }
  }
  return { signs, skipped };
}

// Distancia minima entre dos senas (mejor par de ejemplos).
function signDistance(a, b) {
  let best = Infinity;
  for (const sa of a.sequences) {
    for (const sb of b.sequences) {
      const d = dtw(sa, sb);
      if (d < best) best = d;
    }
  }
  return best;
}

function pct(part, whole) {
  return whole === 0 ? "0.0" : ((part / whole) * 100).toFixed(1);
}

function main() {
  const args = process.argv.slice(2);
  const topN = Number(args[args.indexOf("--top") + 1]) || 25;
  const jsonIdx = args.indexOf("--json");
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

  console.log("Cargando patrones…");
  const { signs, skipped } = loadSequences();
  const totalSeqs = signs.reduce((a, s) => a + s.sequences.length, 0);
  console.log(`${signs.length} senas, ${totalSeqs} secuencias${skipped ? `, ${skipped} vacias` : ""}\n`);

  if (signs.length < 2) {
    console.log("Se necesitan al menos 2 senas para evaluar.");
    return;
  }

  // ── 1. Matriz de distancias entre senas ────────────────────────────────
  console.log("Calculando distancias entre pares…");
  const pairs = [];
  const nearest = signs.map(() => ({ dist: Infinity, other: null }));

  for (let i = 0; i < signs.length; i++) {
    for (let j = i + 1; j < signs.length; j++) {
      const d = signDistance(signs[i], signs[j]);
      pairs.push({ a: signs[i].name, b: signs[j].name, dist: d });
      if (d < nearest[i].dist) nearest[i] = { dist: d, other: signs[j].name };
      if (d < nearest[j].dist) nearest[j] = { dist: d, other: signs[i].name };
    }
  }
  pairs.sort((x, y) => x.dist - y.dist);

  const critical = pairs.filter(p => p.dist < CRITICAL);
  const risky = pairs.filter(p => p.dist >= CRITICAL && p.dist < RISKY);

  console.log(`\n${"=".repeat(64)}`);
  console.log("PARES MAS CONFUNDIBLES (distancia DTW, menor = mas parecidas)");
  console.log("=".repeat(64));
  for (const p of pairs.slice(0, topN)) {
    const flag = p.dist < CRITICAL ? "CRITICO" : p.dist < RISKY ? "riesgo " : "       ";
    console.log(`  ${flag}  ${p.dist.toFixed(4)}   ${p.a}  <->  ${p.b}`);
  }

  // ── 2. Senas mas aisladas / mas ambiguas ───────────────────────────────
  const ranked = signs
    .map((s, i) => ({ name: s.name, category: s.category, ...nearest[i] }))
    .sort((a, b) => a.dist - b.dist);

  console.log(`\n${"=".repeat(64)}`);
  console.log("SENAS MAS AMBIGUAS (vecina mas cercana)");
  console.log("=".repeat(64));
  for (const s of ranked.slice(0, 15)) {
    console.log(`  ${s.dist.toFixed(4)}   ${s.name.padEnd(24)} se parece a  ${s.other}`);
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log("SENAS MEJOR SEPARADAS");
  console.log("=".repeat(64));
  for (const s of ranked.slice(-8).reverse()) {
    console.log(`  ${s.dist.toFixed(4)}   ${s.name.padEnd(24)} vecina: ${s.other}`);
  }

  // ── 3. Leave-one-out para senas con varios ejemplos ────────────────────
  const multi = signs.filter(s => s.sequences.length >= 2);
  let looCorrect = 0;
  let looTotal = 0;
  const looFails = [];

  for (const sign of multi) {
    for (let k = 0; k < sign.sequences.length; k++) {
      const held = sign.sequences[k];
      let bestName = null;
      let bestDist = Infinity;

      for (const other of signs) {
        const seqs = other.name === sign.name
          ? other.sequences.filter((_, idx) => idx !== k)
          : other.sequences;
        for (const s of seqs) {
          const d = dtw(held, s);
          if (d < bestDist) { bestDist = d; bestName = other.name; }
        }
      }
      looTotal++;
      if (bestName === sign.name) looCorrect++;
      else looFails.push({ target: sign.name, got: bestName, dist: bestDist });
    }
  }

  // ── 4. Varianza intra-clase vs distancia inter-clase ───────────────────
  // Si dos grabaciones de la MISMA sena estan mas lejos entre si que de otra
  // sena distinta, esa sena es irreconocible por mucho que ajustemos umbrales.
  const intra = [];
  for (const sign of multi) {
    let worst = 0;
    for (let i = 0; i < sign.sequences.length; i++) {
      for (let j = i + 1; j < sign.sequences.length; j++) {
        worst = Math.max(worst, dtw(sign.sequences[i], sign.sequences[j]));
      }
    }
    const idx = signs.findIndex(s => s.name === sign.name);
    intra.push({ name: sign.name, intra: worst, nearest: nearest[idx].dist, other: nearest[idx].other });
  }

  if (intra.length > 0) {
    console.log(`\n${"=".repeat(64)}`);
    console.log("VARIANZA INTRA-CLASE (senas con 2+ ejemplos)");
    console.log("=".repeat(64));
    console.log("  intra = distancia entre grabaciones de la MISMA sena");
    console.log("  inter = distancia a la sena distinta mas cercana");
    console.log("  Si intra > inter, la sena es irreconocible.\n");
    for (const s of intra) {
      const bad = s.intra > s.nearest;
      console.log(
        `  ${bad ? "FALLA" : "  ok "}  ${s.name.padEnd(10)} intra=${s.intra.toFixed(4)}  inter=${s.nearest.toFixed(4)} (${s.other})`
      );
    }
  }

  // ── Resumen ────────────────────────────────────────────────────────────
  const distances = pairs.map(p => p.dist);
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const sorted = [...distances].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  console.log(`\n${"=".repeat(64)}`);
  console.log("RESUMEN");
  console.log("=".repeat(64));
  console.log(`  Senas evaluadas:        ${signs.length}`);
  console.log(`  Secuencias totales:     ${totalSeqs}`);
  console.log(`  Senas con 2+ ejemplos:  ${multi.length}`);
  console.log(`  Pares comparados:       ${pairs.length}`);
  console.log("");
  console.log(`  Distancia media:        ${mean.toFixed(4)}`);
  console.log(`  Distancia mediana:      ${median.toFixed(4)}`);
  console.log(`  Par mas cercano:        ${pairs[0].dist.toFixed(4)}  (${pairs[0].a} / ${pairs[0].b})`);
  console.log("");
  console.log(`  Pares CRITICOS (<${CRITICAL}):  ${critical.length}  (${pct(critical.length, pairs.length)}% de los pares)`);
  console.log(`  Pares en riesgo (<${RISKY}): ${risky.length}  (${pct(risky.length, pairs.length)}%)`);
  console.log("");
  const ambiguous = ranked.filter(s => s.dist < RISKY).length;
  console.log(`  Senas con vecina <${RISKY}:  ${ambiguous} de ${signs.length}  (${pct(ambiguous, signs.length)}%)`);

  if (looTotal > 0) {
    console.log("");
    console.log(`  Leave-one-out:          ${looCorrect}/${looTotal}  (${pct(looCorrect, looTotal)}%)`);
    for (const f of looFails.slice(0, 5)) {
      console.log(`    fallo: ${f.target} -> ${f.got} (${f.dist.toFixed(4)})`);
    }
  }

  if (jsonOut) {
    const report = {
      generatedAt: new Date().toISOString(),
      signs: signs.length,
      sequences: totalSeqs,
      stats: { mean, median, criticalPairs: critical.length, riskyPairs: risky.length },
      closestPairs: pairs.slice(0, 200),
      perSignNearest: ranked,
      leaveOneOut: { correct: looCorrect, total: looTotal, failures: looFails },
    };
    fs.writeFileSync(path.resolve(REPO_ROOT, jsonOut), JSON.stringify(report, null, 2), "utf8");
    console.log(`\nReporte JSON -> ${jsonOut}`);
  }
}

main();

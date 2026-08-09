import fs from "fs";
import path from "path";

const ROOT = "public/training_data";
const cats = fs.readdirSync(ROOT).filter(f => fs.statSync(path.join(ROOT, f)).isDirectory());

function landmarksEqual(a, b) {
  if (!a || !b) return false;
  for (let i = 0; i < 21; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y || a[i].z !== b[i].z) return false;
  }
  return true;
}

const results = [];
for (const cat of cats) {
  const dir = path.join(ROOT, cat);
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  // Solo el archivo más reciente por seña (mayor numero)
  const latest = {};
  for (const f of files) {
    const m = f.match(/^(.+)_(\d+)\.json$/);
    if (!m) continue;
    const sign = m[1], n = +m[2];
    if (!latest[sign] || latest[sign].n < n) latest[sign] = { n, f };
  }
  for (const [sign, { f }] of Object.entries(latest)) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!Array.isArray(data) || data.length === 0) continue;
    let dupCount = 0;
    for (let i = 1; i < data.length; i++) {
      if (landmarksEqual(data[i].landmarks, data[i - 1].landmarks)) dupCount++;
    }
    const dupRatio = dupCount / data.length;
    results.push({ cat, sign, frames: data.length, dupRatio });
  }
}

results.sort((a, b) => b.dupRatio - a.dupRatio);
console.log(`=== TODAS las señas (${results.length}) ordenadas por % frames repetidos (persistencia = mala detección) ===`);
for (const r of results) {
  console.log(`${r.cat}/${r.sign}: ${(r.dupRatio*100).toFixed(1)}% repetidos (${r.frames} frames)`);
}
console.log("\n=== Estadisticas globales ===");
const avg = results.reduce((a,r)=>a+r.dupRatio,0)/results.length;
console.log("Promedio dupRatio:", (avg*100).toFixed(1)+"%");
console.log("Señas con >20% frames repetidos:", results.filter(r=>r.dupRatio>0.2).length, "/", results.length);
console.log("Señas con >10% frames repetidos:", results.filter(r=>r.dupRatio>0.1).length, "/", results.length);
console.log("Señas con 0% (perfectas):", results.filter(r=>r.dupRatio===0).length, "/", results.length);

fs.writeFileSync("scripts/quality_report.json", JSON.stringify(results, null, 2));
console.log("\nReporte completo guardado en scripts/quality_report.json");

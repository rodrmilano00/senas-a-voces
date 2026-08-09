// scripts/clean_conflicts.js
// Elimina señas que causan conflicto (alta varianza intra-clase o confusión crítica)
// y regenera el manifest. También limpia archivos augmentados (_2.._99).

import { readdirSync, unlinkSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_ROOT = join(__dirname, "..", "public", "training_data");
const FLUTTER_ROOT = join(__dirname, "..", "flutter_app", "assets", "training_data");

// Señas a eliminar completamente (datos corruptos / alta varianza intra-clase)
const REMOVE_SIGNS = new Set([
  "CINE",        // intra=4.22 — grabación defectuosa
  "AHORA",       // intra=2.12 — grabación defectuosa
  "16",          // intra=1.61 — se confunde con COMER
  "TRABAJAR",    // intra=1.26 — se confunde con BOCA
  "TIO",         // intra=1.09 — se confunde con SOBRINO
  "28",          // intra=1.10 — se confunde con 22
  "PLAYA",       // intra=1.07 — se confunde con 8
  // Conflicto crítico: meses/días que son el mismo movimiento base
  "ABRIL",       // se confunde con BIEN, MIERCOLES, SABADO, TIEMPO
  "MIERCOLES",   // se confunde con ABRIL
  "SABADO",      // se confunde con ABRIL, BIEN, JULIO
  "JULIO",       // se confunde con SABADO, SEPTIEMBRE
  "SEPTIEMBRE",  // se confunde con JULIO
  "MARZO",       // se confunde con JUNIO
  // Conceptos temporales que colapsan con TIEMPO
  "MIO",         // se confunde con TIEMPO
  "USTEDES",     // se confunde con TIEMPO
  "PREGUNTA",    // se confunde con TIEMPO
  "FEO",         // se confunde con BIEN
  "CUANDO",      // se confunde con SEPTIEMBRE
  // Frutas/objetos que colapsan entre sí
  "NARANJA",     // se confunde con TOMATE
  "TOMATE",      // se confunde con NARANJA
  "MANGO",       // se confunde con OJOS
  "MANZANA",     // se confunde con MANGO
  "OSCURO",      // se confunde con COMER
  // Otros conflictos
  "BOCA",        // se confunde con BOMBERO
  "CAFE",        // se confunde con OJOS
]);

function cleanDir(rootDir) {
  let removed = 0;
  const cats = readdirSync(rootDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const cat of cats) {
    const catDir = join(rootDir, cat);
    const files = readdirSync(catDir).filter(f => f.endsWith(".json") && f !== "manifest.json");
    for (const file of files) {
      const match = file.match(/^(.+)_(\d+)\.json$/);
      if (!match) continue;
      const signName = match[1];
      if (REMOVE_SIGNS.has(signName)) {
        unlinkSync(join(catDir, file));
        removed++;
      }
    }
  }
  return removed;
}

function regenerateManifest(rootDir) {
  const manifest = {};
  const cats = readdirSync(rootDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const cat of cats) {
    const catDir = join(rootDir, cat);
    const files = readdirSync(catDir).filter(f => f.endsWith(".json") && f !== "manifest.json");
    const signs = new Set();
    for (const file of files) {
      const match = file.match(/^(.+)_(\d+)\.json$/);
      if (match) signs.add(match[1]);
    }
    manifest[cat] = [...signs].sort();
  }
  writeFileSync(join(rootDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

const webRemoved = cleanDir(TRAINING_ROOT);
const flutterRemoved = cleanDir(FLUTTER_ROOT);
console.log(`Eliminadas ${webRemoved} archivos web, ${flutterRemoved} flutter`);

const webMan = regenerateManifest(TRAINING_ROOT);
const flutterMan = regenerateManifest(FLUTTER_ROOT);
const total = Object.values(webMan).reduce((a, s) => a + s.length, 0);
console.log(`Manifest regenerado: ${total} señas en ${Object.keys(webMan).length} categorías`);
for (const [cat, signs] of Object.entries(webMan)) {
  console.log(`  ${cat}: ${signs.length} señas`);
}

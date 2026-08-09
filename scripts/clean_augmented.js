// scripts/clean_augmented.js
// Elimina todos los archivos _2.json.._99.json generados por augmentación,
// manteniendo solo los originales (_1.json y cualquier _2 que tuviera 2 ejemplos reales).
// Para usar antes de re-augmentar con parámetros diferentes.

import { readdirSync, unlinkSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_ROOT = join(__dirname, "..", "public", "training_data");
const FLUTTER_ROOT = join(__dirname, "..", "flutter_app", "assets", "training_data");

// Archivos reales (no augmentados) que tenían 2+ ejemplos antes de la augmentación
const REAL_MULTI = new Set([
  "numeros/16_2.json",
  "numeros/28_2.json",
  "palabras/TODOS_2.json",
]);

function cleanDir(rootDir) {
  let removed = 0;
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const catDir = join(rootDir, entry.name);
    const files = readdirSync(catDir).filter(f => f.endsWith(".json") && f !== "manifest.json");
    for (const file of files) {
      const match = file.match(/^(.+)_(\d+)\.json$/);
      if (!match) continue;
      const n = parseInt(match[2], 10);
      if (n >= 2) {
        const relPath = `${entry.name}/${file}`;
        if (REAL_MULTI.has(relPath)) continue;
        unlinkSync(join(catDir, file));
        removed++;
      }
    }
  }
  return removed;
}

const webRemoved = cleanDir(TRAINING_ROOT);
const flutterRemoved = cleanDir(FLUTTER_ROOT);
console.log(`Eliminados: ${webRemoved} web, ${flutterRemoved} flutter`);

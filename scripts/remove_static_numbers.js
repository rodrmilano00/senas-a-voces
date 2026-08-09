// scripts/remove_static_numbers.js
// Elimina números estáticos (1-9) del DTW — se reconocen con templates geométricos.

import { readdirSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_ROOT = join(__dirname, "..", "public", "training_data");
const FLUTTER_ROOT = join(__dirname, "..", "flutter_app", "assets", "training_data");

const STATIC_NUMBERS = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);

function cleanDir(rootDir) {
  let removed = 0;
  const catDir = join(rootDir, "numeros");
  if (!readdirSync(rootDir).includes("numeros")) return 0;
  const files = readdirSync(catDir).filter(f => f.endsWith(".json"));
  for (const file of files) {
    const match = file.match(/^(.+)_(\d+)\.json$/);
    if (match && STATIC_NUMBERS.has(match[1])) {
      unlinkSync(join(catDir, file));
      removed++;
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
    const files = readdirSync(join(rootDir, cat)).filter(f => f.endsWith(".json") && f !== "manifest.json");
    const signs = new Set();
    for (const file of files) {
      const match = file.match(/^(.+)_(\d+)\.json$/);
      if (match) signs.add(match[1]);
    }
    if (signs.size > 0) manifest[cat] = [...signs].sort();
  }
  writeFileSync(join(rootDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

const webRemoved = cleanDir(TRAINING_ROOT);
const flutterRemoved = cleanDir(FLUTTER_ROOT);
console.log(`Eliminados ${webRemoved} archivos web, ${flutterRemoved} flutter`);

const webMan = regenerateManifest(TRAINING_ROOT);
const flutterMan = regenerateManifest(FLUTTER_ROOT);
const total = Object.values(webMan).reduce((a, s) => a + s.length, 0);
console.log(`Manifest: ${total} señas`);
console.log(`numeros: ${webMan.numeros?.length || 0} señas`);
console.log(webMan.numeros?.join(", "));

// load_training.mjs
// Helper para cargar datos de entrenamiento (.npy o .json) en Node.js.
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseNpy, npyToFrames } from "../src/npy_parser.js";

export const TRAINING_ROOT = "public/training_data";

export function loadManifest() {
  return JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));
}

/**
 * Carga un archivo de entrenamiento por signo y número.
 * Intenta .npy primero, luego .json como fallback.
 * Retorna array de frames o null si no existe.
 */
export function loadTrainingFile(cat, sign, n) {
  const npyPath = join(TRAINING_ROOT, cat, `${sign}_${n}.npy`);
  if (existsSync(npyPath)) {
    const buf = readFileSync(npyPath);
    const parsed = parseNpy(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return npyToFrames(parsed);
  }
  const jsonPath = join(TRAINING_ROOT, cat, `${sign}_${n}.json`);
  if (existsSync(jsonPath)) {
    return JSON.parse(readFileSync(jsonPath, "utf8"));
  }
  return null;
}

/**
 * Carga todos los patrones de entrenamiento en un detector.
 * Retorna el número de secuencias cargadas.
 */
export function loadAllPatterns(det) {
  const manifest = loadManifest();
  let count = 0;
  for (const [cat, signs] of Object.entries(manifest)) {
    for (const sign of signs) {
      for (let n = 1; n <= 20; n++) {
        const frames = loadTrainingFile(cat, sign, n);
        if (frames) {
          det.loadPattern(sign, frames);
          count++;
        } else {
          break;
        }
      }
    }
  }
  return count;
}

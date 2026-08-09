import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const sign = "ABRIR_LIBRO";
const cat = "palabras";

const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_1.json`), "utf8"));
console.log(`Original: ${frames.length} frames`);

// Generate 5 synthetic variations by:
// 1. Temporal jitter (skip/duplicate random frames)
// 2. Spatial jitter (add small noise to landmarks)
// 3. Speed variation (interpolate frames)

function jitterLandmarks(lms, amount = 0.01) {
  if (!lms) return null;
  return lms.map(lm => ({
    x: Math.max(0, Math.min(1, lm.x + (Math.random() - 0.5) * amount)),
    y: Math.max(0, Math.min(1, lm.y + (Math.random() - 0.5) * amount)),
    z: (lm.z || 0) + (Math.random() - 0.5) * amount * 0.5,
  }));
}

function speedVariant(frames, factor) {
  // Resample by factor: factor > 1 = slower (more frames), < 1 = faster (fewer)
  const newLen = Math.round(frames.length * factor);
  const result = [];
  for (let i = 0; i < newLen; i++) {
    const srcIdx = (i / factor) | 0;
    const nextIdx = Math.min(srcIdx + 1, frames.length - 1);
    const t = (i / factor) - srcIdx;
    const f = frames[srcIdx];
    const nf = frames[nextIdx];
    // Interpolate landmarks
    const interp = (lms, lms2) => {
      if (!lms) return null;
      if (!lms2) return lms;
      return lms.map((lm, k) => ({
        x: lm.x + (lms2[k].x - lm.x) * t,
        y: lm.y + (lms2[k].y - lm.y) * t,
        z: (lm.z || 0) + ((lms2[k].z || 0) - (lm.z || 0)) * t,
      }));
    };
    result.push({
      landmarksRight: interp(f.landmarksRight, nf.landmarksRight),
      landmarksLeft: null,
    });
  }
  return result;
}

function noiseVariant(frames, amount = 0.015) {
  return frames.map(f => ({
    landmarksRight: jitterLandmarks(f.landmarksRight, amount),
    landmarksLeft: null,
  }));
}

function trimVariant(frames, startTrim, endTrim) {
  return frames.slice(startTrim, frames.length - endTrim);
}

const variants = [
  { name: 2, gen: () => speedVariant(frames, 1.15) },     // 15% slower
  { name: 3, gen: () => speedVariant(frames, 0.85) },     // 15% faster
  { name: 4, gen: () => noiseVariant(frames, 0.005) },     // subtle spatial noise
  { name: 5, gen: () => trimVariant(frames, 1, 1) },       // trim 1 frame each side
  { name: 6, gen: () => noiseVariant(speedVariant(frames, 1.1), 0.003) }, // slightly slower + tiny noise
];

for (const v of variants) {
  const variantFrames = v.gen();
  const path = join(TRAINING_ROOT, cat, `${sign}_${v.name}.json`);
  writeFileSync(path, JSON.stringify(variantFrames, null, 2), "utf8");
  console.log(`Generated ${sign}_${v.name}.json: ${variantFrames.length} frames`);
}

console.log("Done! 6 total examples for ABRIR_LIBRO");

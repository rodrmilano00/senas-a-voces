import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));

function jitterLandmarks(lms, amount = 0.005) {
  if (!lms) return null;
  return lms.map(lm => ({
    x: Math.max(0, Math.min(1, lm.x + (Math.random() - 0.5) * amount)),
    y: Math.max(0, Math.min(1, lm.y + (Math.random() - 0.5) * amount)),
    z: (lm.z || 0) + (Math.random() - 0.5) * amount * 0.5,
  }));
}

function speedVariant(frames, factor) {
  const newLen = Math.max(8, Math.round(frames.length * factor));
  const result = [];
  for (let i = 0; i < newLen; i++) {
    const srcIdx = Math.min((i / factor) | 0, frames.length - 1);
    const nextIdx = Math.min(srcIdx + 1, frames.length - 1);
    const t = (i / factor) - srcIdx;
    const f = frames[srcIdx];
    const nf = frames[nextIdx];
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
      landmarksLeft: f.landmarksLeft ? interp(f.landmarksLeft, nf.landmarksLeft) : null,
    });
  }
  return result;
}

function noiseVariant(frames, amount = 0.005) {
  return frames.map(f => ({
    landmarksRight: jitterLandmarks(f.landmarksRight, amount),
    landmarksLeft: f.landmarksLeft ? jitterLandmarks(f.landmarksLeft, amount) : null,
  }));
}

function trimVariant(frames, startTrim, endTrim) {
  return frames.slice(startTrim, Math.max(startTrim + 5, frames.length - endTrim));
}

let totalGenerated = 0;

for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    // Count existing examples
    let maxN = 0;
    for (let n = 1; n <= 20; n++) {
      if (existsSync(join(TRAINING_ROOT, cat, `${sign}_${n}.json`))) maxN = n;
      else break;
    }
    
    if (maxN === 0) continue;
    
    // Load original
    const frames = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_1.json`), "utf8"));
    
    // Generate up to 6 examples total
    const variants = [
      { speed: 1.15, noise: 0 },
      { speed: 0.85, noise: 0 },
      { speed: 1.0, noise: 0.005 },
      { speed: 1.1, noise: 0.003 },
      { speed: 0.9, noise: 0.003 },
    ];
    
    for (let i = 0; i < variants.length && maxN + i + 1 <= 6; i++) {
      const v = variants[i];
      const n = maxN + i + 1;
      const path = join(TRAINING_ROOT, cat, `${sign}_${n}.json`);
      if (existsSync(path)) continue;
      
      let variant = speedVariant(frames, v.speed);
      if (v.noise > 0) variant = noiseVariant(variant, v.noise);
      
      writeFileSync(path, JSON.stringify(variant, null, 2), "utf8");
      totalGenerated++;
    }
  }
}

console.log(`Generated ${totalGenerated} new training files`);

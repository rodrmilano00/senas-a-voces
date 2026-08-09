import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));

// ── Transformaciones ──

function jitter(lms, amount = 0.005) {
  if (!lms) return null;
  return lms.map(lm => ({
    x: Math.max(0, Math.min(1, lm.x + (Math.random() - 0.5) * amount)),
    y: Math.max(0, Math.min(1, lm.y + (Math.random() - 0.5) * amount)),
    z: (lm.z || 0) + (Math.random() - 0.5) * amount * 0.5,
  }));
}

function rotate(lms, angleDeg) {
  if (!lms) return null;
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // Rotate around wrist (landmark 0)
  const cx = lms[0].x, cy = lms[0].y;
  return lms.map(lm => ({
    x: cx + (lm.x - cx) * cos - (lm.y - cy) * sin,
    y: cy + (lm.x - cx) * sin + (lm.y - cy) * cos,
    z: lm.z || 0,
  }));
}

function scale(lms, factor) {
  if (!lms) return null;
  const cx = lms[0].x, cy = lms[0].y;
  return lms.map(lm => ({
    x: cx + (lm.x - cx) * factor,
    y: cy + (lm.y - cy) * factor,
    z: (lm.z || 0) * factor,
  }));
}

function translate(lms, dx, dy) {
  if (!lms) return null;
  return lms.map(lm => ({
    x: Math.max(0, Math.min(1, lm.x + dx)),
    y: Math.max(0, Math.min(1, lm.y + dy)),
    z: lm.z || 0,
  }));
}

function speedVariant(frames, factor) {
  const newLen = Math.max(10, Math.round(frames.length * factor));
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

function applyTransform(frames, fn) {
  return frames.map(f => ({
    landmarksRight: fn(f.landmarksRight),
    landmarksLeft: f.landmarksLeft ? fn(f.landmarksLeft) : null,
  }));
}

function trimFrames(frames, startPct, endPct) {
  const s = Math.floor(frames.length * startPct);
  const e = Math.ceil(frames.length * (1 - endPct));
  return frames.slice(s, Math.max(s + 8, e));
}

// ── Generar 10 ejemplos por signo ──

const TARGET_COUNT = 10;
let generated = 0, skipped = 0;

for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    // Count existing
    let maxN = 0;
    for (let n = 1; n <= 20; n++) {
      if (existsSync(join(TRAINING_ROOT, cat, `${sign}_${n}.json`))) maxN = n;
      else break;
    }
    if (maxN === 0) continue;

    // Load original
    const orig = JSON.parse(readFileSync(join(TRAINING_ROOT, cat, `${sign}_1.json`), "utf8"));

    // Variant generators: each produces a distinct augmentation
    const variantGens = [
      // 2: slower + slight rotation
      () => applyTransform(speedVariant(orig, 1.2), lms => rotate(lms, 3)),
      // 3: faster + slight rotation other way
      () => applyTransform(speedVariant(orig, 0.8), lms => rotate(lms, -3)),
      // 4: noise
      () => applyTransform(orig, lms => jitter(lms, 0.005)),
      // 5: scale up slightly
      () => applyTransform(speedVariant(orig, 1.1), lms => scale(lms, 1.1)),
      // 6: scale down slightly
      () => applyTransform(speedVariant(orig, 0.9), lms => scale(lms, 0.9)),
      // 7: translate + noise
      () => applyTransform(orig, lms => translate(jitter(lms, 0.004), 0.02, -0.02)),
      // 8: slower + rotate + noise
      () => applyTransform(speedVariant(orig, 1.15), lms => jitter(rotate(lms, 2), 0.003)),
      // 9: faster + scale + noise
      () => applyTransform(speedVariant(orig, 0.85), lms => jitter(scale(lms, 1.05), 0.003)),
      // 10: trim start + slight speed change
      () => speedVariant(trimFrames(orig, 0.08, 0.04), 1.05),
    ];

    for (let i = 0; i < variantGens.length && maxN + i + 1 <= TARGET_COUNT; i++) {
      const n = maxN + i + 1;
      const path = join(TRAINING_ROOT, cat, `${sign}_${n}.json`);
      if (existsSync(path)) { skipped++; continue; }

      const variant = variantGens[i]();
      writeFileSync(path, JSON.stringify(variant, null, 2), "utf8");
      generated++;
    }
  }
}

console.log(`Generated: ${generated}, Skipped (existing): ${skipped}`);

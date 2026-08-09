import { readFileSync } from "fs";
import { join } from "path";

const sign = process.argv[2] || "CUNADO";
const cat = process.argv[3] || "familia";
const dir = join("public/training_data", cat);

for (let n = 1; n <= 20; n++) {
  const p = join(dir, `${sign}_${n}.json`);
  try {
    const frames = JSON.parse(readFileSync(p, "utf8"));
    let r = 0, l = 0, both = 0, neither = 0;
    for (const f of frames) {
      const hasR = f.landmarksRight && f.landmarksRight.length >= 21;
      const hasL = f.landmarksLeft && f.landmarksLeft.length >= 21;
      if (hasR && hasL) both++;
      else if (hasR && !hasL) r++;
      else if (!hasR && hasL) l++;
      else neither++;
    }
    // Movement analysis
    let rMov = 0, lMov = 0, rTotal = 0, lTotal = 0;
    for (let i = 1; i < frames.length; i++) {
      const r0 = frames[i-1].landmarksRight?.[0], r1 = frames[i].landmarksRight?.[0];
      const l0 = frames[i-1].landmarksLeft?.[0], l1 = frames[i].landmarksLeft?.[0];
      if (r0 && r1) { rTotal++; if (Math.hypot(r1.x-r0.x, r1.y-r0.y) > 0.005) rMov++; }
      if (l0 && l1) { lTotal++; if (Math.hypot(l1.x-l0.x, l1.y-l0.y) > 0.005) lMov++; }
    }
    const rRatio = rTotal > 0 ? (rMov/rTotal).toFixed(2) : "N/A";
    const lRatio = lTotal > 0 ? (lMov/lTotal).toFixed(2) : "N/A";
    console.log(`${sign}_${n}: ${frames.length} frames, R:${r} L:${l} both:${both} none:${neither} | rMov=${rRatio} lMov=${lRatio}`);
  } catch { break; }
}

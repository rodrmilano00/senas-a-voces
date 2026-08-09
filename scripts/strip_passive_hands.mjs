import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const TRAINING_DIR = "public/training_data";
const MOVEMENT_THRESHOLD = 0.005; // wrist movement per frame to count as "moving"
const PASSIVE_RATIO = 0.15; // if hand moves in <15% of frames, it's passive

const manifest = JSON.parse(readFileSync(join(TRAINING_DIR, "manifest.json"), "utf8"));

const changes = [];

for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    for (let n = 1; n <= 20; n++) {
      const path = join(TRAINING_DIR, cat, `${sign}_${n}.json`);
      let frames;
      try {
        frames = JSON.parse(readFileSync(path, "utf8"));
      } catch { break; }

      // Count movement for each hand
      let rMov = 0, lMov = 0, rTotal = 0, lTotal = 0;
      for (let i = 1; i < frames.length; i++) {
        const r0 = frames[i-1].landmarksRight?.[0];
        const r1 = frames[i].landmarksRight?.[0];
        const l0 = frames[i-1].landmarksLeft?.[0];
        const l1 = frames[i].landmarksLeft?.[0];
        if (r0 && r1) {
          rTotal++;
          if (Math.hypot(r1.x - r0.x, r1.y - r0.y) > MOVEMENT_THRESHOLD) rMov++;
        }
        if (l0 && l1) {
          lTotal++;
          if (Math.hypot(l1.x - l0.x, l1.y - l0.y) > MOVEMENT_THRESHOLD) lMov++;
        }
      }

      const rRatio = rTotal > 0 ? rMov / rTotal : 0;
      const lRatio = lTotal > 0 ? lMov / lTotal : 0;

      // If both hands present but one is passive, strip the passive hand
      let modified = false;
      const rPresent = frames.filter(f => f.landmarksRight?.length >= 21).length;
      const lPresent = frames.filter(f => f.landmarksLeft?.length >= 21).length;

      if (rPresent > 0 && lPresent > 0) {
        if (lRatio < PASSIVE_RATIO && rRatio >= PASSIVE_RATIO) {
          // Left hand is passive, strip it
          frames = frames.map(f => ({ ...f, landmarksLeft: null }));
          modified = true;
          changes.push(`${sign}_${n}: stripped passive LEFT (rMov=${rRatio.toFixed(2)}, lMov=${lRatio.toFixed(2)})`);
        } else if (rRatio < PASSIVE_RATIO && lRatio >= PASSIVE_RATIO) {
          // Right hand is passive, strip it
          frames = frames.map(f => ({ ...f, landmarksRight: null }));
          modified = true;
          changes.push(`${sign}_${n}: stripped passive RIGHT (rMov=${rRatio.toFixed(2)}, lMov=${lRatio.toFixed(2)})`);
        }
      }

      if (modified) {
        writeFileSync(path, JSON.stringify(frames, null, 2), "utf8");
      }
    }
  }
}

console.log(`Modified ${changes.length} files:`);
for (const c of changes) console.log(`  ${c}`);

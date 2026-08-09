import { readFileSync } from "fs";
import { join } from "path";

const manifest = JSON.parse(readFileSync("public/training_data/manifest.json", "utf8"));
let both = 0, ronly = 0, lonly = 0, neither = 0, total = 0;
const twoHandedSigns = [];

for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    let signBoth = 0, signTotal = 0;
    for (let n = 1; n <= 20; n++) {
      try {
        const frames = JSON.parse(readFileSync(join("public/training_data", cat, `${sign}_${n}.json`), "utf8"));
        for (const f of frames) {
          total++;
          signTotal++;
          const hR = f.landmarksRight && f.landmarksRight.length >= 21;
          const hL = f.landmarksLeft && f.landmarksLeft.length >= 21;
          if (hR && hL) { both++; signBoth++; }
          else if (hR && !hL) ronly++;
          else if (!hR && hL) lonly++;
          else neither++;
        }
      } catch { break; }
    }
    if (signBoth > signTotal * 0.5) twoHandedSigns.push(`${cat}/${sign}`);
  }
}

console.log(`Total frames: ${total}`);
console.log(`R-only: ${ronly}, L-only: ${lonly}, both: ${both}, neither: ${neither}`);
console.log(`Two-handed signs: ${twoHandedSigns.length}`);
console.log(twoHandedSigns.join(", "));

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

const COMMIT = "6bf1de9";
const TRAINING_DIR = "public/training_data";

// Get old manifest
const rawManifest = execSync(`git show ${COMMIT}:public/training_data/manifest.json`, { encoding: "utf8", maxBuffer: 1024 * 1024 });
const oldManifest = JSON.parse(rawManifest.replace(/^\uFEFF/, ""));

// Clean current training data (keep metadata file)
console.log("Cleaning current training data...");
for (const dir of readdirSync(TRAINING_DIR, { withFileTypes: true })) {
  if (dir.isDirectory()) {
    const dirPath = join(TRAINING_DIR, dir.name);
    for (const f of readdirSync(dirPath)) {
      if (f.endsWith(".json")) unlinkSync(join(dirPath, f));
    }
  }
}

let restored = 0;
let converted = 0;

for (const [cat, signs] of Object.entries(oldManifest)) {
  if (!Array.isArray(signs) || signs.length === 0) continue;
  const catDir = join(TRAINING_DIR, cat);
  if (!existsSync(catDir)) mkdirSync(catDir, { recursive: true });

  for (const sign of signs) {
    for (let n = 1; n <= 20; n++) {
      const gitPath = `public/training_data/${cat}/${sign}_${n}.json`;
      try {
        const content = execSync(`git show ${COMMIT}:${gitPath}`, { encoding: "utf8", maxBuffer: 1024 * 1024 });
        const frames = JSON.parse(content.replace(/^\uFEFF/, ""));

        // Convert old format (landmarks) to new format (landmarksRight/landmarksLeft)
        const convertedFrames = frames.map(f => {
          if (f.landmarksRight || f.landmarksLeft) {
            // Already new format
            return f;
          }
          if (f.landmarks && f.landmarks.length >= 21) {
            // Old format: single hand in "landmarks" → treat as right hand
            return {
              landmarksRight: f.landmarks,
              landmarksLeft: null,
            };
          }
          return f;
        });

        writeFileSync(join(catDir, `${sign}_${n}.json`), JSON.stringify(convertedFrames, null, 2), "utf8");
        restored++;
        converted++;
      } catch {
        break; // No more examples for this sign
      }
    }
  }
}

// Write new manifest (only categories with signs)
const newManifest = {};
for (const [cat, signs] of Object.entries(oldManifest)) {
  if (Array.isArray(signs) && signs.length > 0) {
    newManifest[cat] = signs;
  }
}
writeFileSync(join(TRAINING_DIR, "manifest.json"), JSON.stringify(newManifest, null, 2), "utf8");

console.log(`Restored ${restored} files, converted ${converted} to new format`);
console.log(`Manifest: ${Object.entries(newManifest).map(([k,v]) => `${k}:${v.length}`).join(", ")}`);

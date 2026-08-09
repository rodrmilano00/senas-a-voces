import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_ROOT = join(__dirname, "..", "public", "training_data");
const OUT_PATH = join(TRAINING_ROOT, "sign_metadata.json");

function analyzeSign(category, signName) {
  const dir = join(TRAINING_ROOT, category);
  const files = readdirSync(dir).filter(f => f.startsWith(`${signName}_`) && f.endsWith(".json"));
  if (files.length === 0) return null;

  // Analyze all example files for this sign
  const fileStats = files.map(file => {
    const frames = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (!Array.isArray(frames)) return null;

    let rightOnly = 0, leftOnly = 0, both = 0, neither = 0;
    for (const f of frames) {
      const hasR = f.landmarksRight && f.landmarksRight.length >= 21;
      const hasL = f.landmarksLeft && f.landmarksLeft.length >= 21;
      if (hasR && hasL) both++;
      else if (hasR) rightOnly++;
      else if (hasL) leftOnly++;
      else neither++;
    }
    const total = frames.length;
    const anyHand = total - neither;
    const twoHandRatio = anyHand > 0 ? both / anyHand : 0;
    const leftRatio = anyHand > 0 ? (leftOnly + both) / anyHand : 0;
    const rightRatio = anyHand > 0 ? (rightOnly + both) / anyHand : 0;

    return {
      file,
      total,
      rightOnly,
      leftOnly,
      both,
      neither,
      twoHandRatio,
      leftRatio,
      rightRatio,
    };
  }).filter(Boolean);

  // Aggregate across all examples
  let totalFrames = 0, anyHandFrames = 0;
  let rightOnly = 0, leftOnly = 0, both = 0, neither = 0;
  for (const s of fileStats) {
    totalFrames += s.total;
    rightOnly += s.rightOnly;
    leftOnly += s.leftOnly;
    both += s.both;
    neither += s.neither;
    anyHandFrames += s.total - s.neither;
  }

  const twoHandRatio = anyHandFrames > 0 ? both / anyHandFrames : 0;
  const leftDominantRatio = anyHandFrames > 0 ? (leftOnly + both) / anyHandFrames : 0;
  const rightDominantRatio = anyHandFrames > 0 ? (rightOnly + both) / anyHandFrames : 0;

  // Determine if one-handed or two-handed
  // If at least 30% of frames with hand have both hands, it's two-handed
  const isTwoHanded = twoHandRatio >= 0.30;
  const isOneHanded = !isTwoHanded;

  // For one-handed signs, determine which hand the video uses
  // If leftOnly is much higher than rightOnly, it's a left-hand sign in the training data
  let videoHand = "unknown";
  if (isOneHanded) {
    if (leftOnly > rightOnly * 1.5) videoHand = "left";
    else if (rightOnly > leftOnly * 1.5) videoHand = "right";
    else if (leftOnly > 0 && rightOnly === 0) videoHand = "left";
    else if (rightOnly > 0 && leftOnly === 0) videoHand = "right";
    else videoHand = "either";
  }

  // Effective dominant hand for two-handed: which hand is more consistently present
  let dominantHand = "unknown";
  if (isTwoHanded) {
    if (rightOnly + both > leftOnly + both) dominantHand = "right";
    else if (leftOnly + both > rightOnly + both) dominantHand = "left";
    else dominantHand = "both";
  }

  return {
    name: signName,
    category,
    oneHanded: isOneHanded,
    twoHanded: isTwoHanded,
    videoHand,
    dominantHand: isTwoHanded ? dominantHand : videoHand,
    totalFrames,
    anyHandFrames,
    rightOnly,
    leftOnly,
    both,
    neither,
    twoHandRatio: Number(twoHandRatio.toFixed(2)),
    leftDominantRatio: Number(leftDominantRatio.toFixed(2)),
    rightDominantRatio: Number(rightDominantRatio.toFixed(2)),
  };
}

const categories = readdirSync(TRAINING_ROOT, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);

const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));
const metadata = {};

for (const cat of categories) {
  const signs = manifest[cat] || [];
  for (const sign of signs) {
    const meta = analyzeSign(cat, sign);
    if (meta) metadata[sign] = meta;
  }
}

writeFileSync(OUT_PATH, JSON.stringify(metadata, null, 2), "utf8");

// Print summary
const oneHanded = Object.values(metadata).filter(m => m.oneHanded);
const twoHanded = Object.values(metadata).filter(m => m.twoHanded);
const leftTraining = oneHanded.filter(m => m.videoHand === "left");
const rightTraining = oneHanded.filter(m => m.videoHand === "right");

console.log(`\nAnalyzed ${Object.keys(metadata).length} signs in ${categories.length} categories`);
console.log(`One-handed: ${oneHanded.length}`);
console.log(`  - trained with left hand: ${leftTraining.length}`);
console.log(`  - trained with right hand: ${rightTraining.length}`);
console.log(`  - ambiguous: ${oneHanded.length - leftTraining.length - rightTraining.length}`);
console.log(`Two-handed: ${twoHanded.length}`);
console.log(`\nSaved metadata to ${OUT_PATH}`);

// Print one-handed signs trained with left (need mirroring for right-handed users)
console.log("\n--- One-handed signs trained with LEFT hand (need normalization) ---");
for (const sign of leftTraining.map(m => m.name).sort()) {
  const m = metadata[sign];
  console.log(`  ${m.category}/${sign}: L=${m.leftOnly} R=${m.rightOnly} both=${m.both}`);
}

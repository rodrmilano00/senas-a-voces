import { DynamicSignDetector, frameInfo, buildSequence } from "../src/dynamic_sign_detector.js";
import { readFileSync } from "fs";
import { join } from "path";

const TRAINING_ROOT = "public/training_data";
const manifest = JSON.parse(readFileSync(join(TRAINING_ROOT, "manifest.json"), "utf8"));

const det = new DynamicSignDetector();

// Load all training data
const patternFrames = {};
for (const [cat, signs] of Object.entries(manifest)) {
  for (const sign of signs) {
    for (let n = 1; n <= 20; n++) {
      const path = join(TRAINING_ROOT, cat, `${sign}_${n}.json`);
      try {
        const frames = JSON.parse(readFileSync(path, "utf8"));
        det.loadPattern(sign, frames);
        if (!patternFrames[sign]) patternFrames[sign] = frames;
      } catch {
        break;
      }
    }
  }
}

console.log(`Loaded ${det.patterns.length} patterns, ${det.patterns.reduce((s,p)=>s+p.sequences.length,0)} total sequences`);

// Check number patterns
const numbers = manifest.numeros || [];
console.log("\nNumber pattern sequences:");
for (const num of numbers) {
  const p = det.patterns.find(p => p.name === num);
  if (p) {
    console.log(`${num.padStart(3)}: ${p.sequences.length} seqs`);
  } else {
    console.log(`${num.padStart(3)}: NOT LOADED`);
  }
}

// Test self-similarity for a few number signs
function dtw(seqA, seqB) {
  const n = seqA.length, m = seqB.length;
  if (n === 0 || m === 0) return Infinity;
  let prev = new Array(m + 1).fill(Infinity);
  let curr = new Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      let s = 0;
      const a = seqA[i - 1], b = seqB[j - 1];
      const nn = Math.min(a.length, b.length);
      for (let k = 0; k < nn; k++) { const d = a[k] - b[k]; s += d * d; }
      const cost = Math.sqrt(s);
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(Infinity);
  }
  return prev[m] / (n + m);
}

console.log("\nSelf vs mirror test for ALL one-handed signs:");

function buildSeq(frames) {
  const infos = frames
    .map(f => frameInfo(f.landmarksRight ?? f.landmarks ?? null, f.landmarksLeft ?? null))
    .filter(Boolean);
  return buildSequence(infos);
}

console.log("One-handed signs:", det.patterns.filter(p => p.oneHanded).map(p => p.name).join(", "));
console.log("Two-handed signs count:", det.patterns.filter(p => !p.oneHanded).length);
let ok = 0, bad = 0;
for (const p of det.patterns) {
  if (!p.oneHanded) continue;
  if (p.sequences.length < 1) continue;
  // Build a mirrored version of the original training data by flipping x
  // and compare DTW. With abs(vx) and abs(palmNormalZ), the mirror should
  // have DTW ≈ 0 to the original.
  const orig = p.sequences[0];
  // Find the training frames for this sign
  const frames = patternFrames[p.name];
  if (!frames) {
    console.log(`  ${p.name.padEnd(12)}: no frames stored, skip`);
    continue;
  }
  const flippedFrames = frames.map(f => {
    const hand = f.landmarksRight || f.landmarksLeft;
    if (!hand) return f;
    const flipped = hand.map(lm => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));
    return {
      ...f,
      landmarksRight: f.landmarksRight ? flipped : null,
      landmarksLeft: f.landmarksLeft ? flipped : null,
    };
  });
  const mirrorSeq = buildSeq(flippedFrames);
  if (mirrorSeq.length === 0) {
    console.log(`  ${p.name.padEnd(12)}: mirror seq empty, skip`);
    continue;
  }
  const d = dtw(orig, mirrorSeq);
  const status = d < 0.2 ? "OK" : "BAD";
  if (status === "OK") ok++; else bad++;
  console.log(`  ${p.name.padEnd(12)}: orig vs mirror DTW = ${d.toFixed(4)} [${status}]`);
}
console.log(`\nTotal one-handed: ${ok + bad}, OK: ${ok}, BAD: ${bad}`);

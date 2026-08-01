// dynamic_sign_detector.js
// Detector de señas dinámicas usando DTW sobre secuencias de vectores de características.
// El "modelo entrenado" es una colección de secuencias JSON en public/training_data/.

import { fingerStates as computeFingerStates } from "./lsm_detector.js";

export const WRIST_WEIGHT = 4;

// ── Vector de características invariante (forma de mano) ──
export function featureFromFingerStates(fs) {
  if (!fs) return null;
  const ang = fs.ang || {};
  const norm = (v) => {
    if (typeof v !== "number") return 0;
    return v / 180.0;
  };
  return [
    norm(ang.index),
    norm(ang.middle),
    norm(ang.ring),
    norm(ang.pinky),
    norm(ang.thumb),
    fs.thumb  ? 1 : 0,
    fs.index  ? 1 : 0,
    fs.middle ? 1 : 0,
    fs.ring   ? 1 : 0,
    fs.pinky  ? 1 : 0,
    ((fs.palmOriY || 0) + 1) / 2,
    ((fs.fingerOriY || 0) + 1) / 2,
  ];
}

// Extrae información por frame: vector de características, muñeca y escala de la mano.
export function frameInfo(fingerStates, landmarks) {
  const ff = featureFromFingerStates(fingerStates);
  if (!ff || !landmarks || landmarks.length < 21) return null;
  const wrist = landmarks[0];
  const m = landmarks[9];
  const scale = Math.hypot(m.x - wrist.x, m.y - wrist.y) || 1e-9;
  return { ff, wrist, scale };
}

// Construye una secuencia de vectores DTW a partir de infos {ff, wrist, scale}.
// A cada frame le añade la velocidad de la muñeca (dx, dy) normalizada por escala.
export function buildSequence(infos) {
  const seq = [];
  for (let i = 0; i < infos.length; i++) {
    const cur = infos[i];
    if (!cur) continue;
    let vx = 0, vy = 0;
    if (i > 0 && cur.wrist && infos[i - 1] && infos[i - 1].wrist) {
      const prev = infos[i - 1];
      vx = (cur.wrist.x - prev.wrist.x) / cur.scale;
      vy = (cur.wrist.y - prev.wrist.y) / cur.scale;
    }
    seq.push([...cur.ff, vx * WRIST_WEIGHT, vy * WRIST_WEIGHT]);
  }
  return seq;
}

// ── Utilidades ──
function landmarkDistance(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// DTW entre dos secuencias de vectores de características
function dtw(seqA, seqB) {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return Infinity;
  let prev = new Array(m + 1).fill(Infinity);
  let curr = new Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      const cost = landmarkDistance(seqA[i - 1], seqB[j - 1]);
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(Infinity);
  }
  return prev[m] / (n + m);
}

// ── Clase principal ──
export class DynamicSignDetector {
  constructor() {
    this.patterns = [];
    this.buffer = [];
    this.previousInfo = null;
    this.maxBufferSize = 30;
    this.minBufferSize = 4;
    this.threshold = 0.80;
    this.minMargin = 0.08;
  }

  // Cargar un patrón desde JSON de training_data. Acumula ejemplos por nombre.
  // Los patrones generados desde video solo traen `landmarks`; en ese caso
  // recalculamos `fingerStates` igual que hace el loader de Flutter.
  loadPattern(name, frames) {
    const infos = frames
      .map(f => frameInfo(f.fingerStates ?? computeFingerStates(f.landmarks), f.landmarks))
      .filter(Boolean);
    const seq = buildSequence(infos);
    if (seq.length === 0) return;
    let existing = this.patterns.find(p => p.name === name);
    if (!existing) {
      existing = { name, sequences: [] };
      this.patterns.push(existing);
    }
    // Evita ejemplos duplicados que sesgan la clasificación hacia una seña.
    const isDuplicate = existing.sequences.some(s => s.length === seq.length && dtw(s, seq) < 1e-6);
    if (!isDuplicate) existing.sequences.push(seq);
  }

  loadPatterns(patternsObj) {
    for (const [name, frames] of Object.entries(patternsObj)) {
      this.loadPattern(name, frames);
    }
  }

  clearPatterns() {
    this.patterns = [];
  }

  clearBuffer() {
    this.buffer = [];
    this.previousInfo = null;
  }

  pushFrameInfo(info) {
    if (!info) return;
    let vx = 0, vy = 0;
    if (this.previousInfo?.wrist) {
      vx = (info.wrist.x - this.previousInfo.wrist.x) / info.scale;
      vy = (info.wrist.y - this.previousInfo.wrist.y) / info.scale;
    }
    this.previousInfo = info;
    this.pushFrame([...info.ff, vx * WRIST_WEIGHT, vy * WRIST_WEIGHT]);
  }

  pushFrame(featureVector) {
    if (!featureVector) return;
    this.buffer.push(featureVector);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  // Detectar la mejor seña comparando sub-ventanas del buffer.
  detect() {
    if (this.buffer.length < this.minBufferSize) return null;
    let bestMatch = null, bestScore = Infinity, secondScore = Infinity;
    for (const pattern of this.patterns) {
      for (const seq of pattern.sequences) {
        const L = seq.length;
        const minW = Math.max(this.minBufferSize, L - 2);
        const maxW = Math.min(this.buffer.length, L + 8);
        for (let winLen = minW; winLen <= maxW; winLen++) {
          for (let start = 0; start + winLen <= this.buffer.length; start++) {
            const window = this.buffer.slice(start, start + winLen);
            const score = dtw(window, seq);
            if (score < bestScore) {
              secondScore = bestScore;
              bestScore = score;
              bestMatch = pattern.name;
            } else if (score < secondScore) {
              secondScore = score;
            }
          }
        }
      }
    }
    const margin = secondScore - bestScore;
    const confidence = Math.max(0, Math.min(100, Math.round((1 - bestScore) * 100)));
    return {
      matched: bestMatch,
      score: bestScore,
      confidence,
      margin,
      accepted: bestScore <= this.threshold && margin >= this.minMargin,
    };
  }

  // Clasifica una o varias secuencias completas (por ejemplo, los segmentos de un video)
  // comparándolas contra cada seña entrenada. Usa el PROMEDIO por seña de la mejor
  // distancia por secuencia, para que ninguna gane solo por tener más ejemplos.
  classifySequences(sequences) {
    const seqs = (sequences || []).filter(s => Array.isArray(s) && s.length > 0);
    if (seqs.length === 0 || this.patterns.length === 0) return null;
    const ranking = [];
    for (const pattern of this.patterns) {
      let best = Infinity;
      for (const ps of pattern.sequences) {
        for (const seq of seqs) best = Math.min(best, dtw(seq, ps));
      }
      if (best !== Infinity) ranking.push({ name: pattern.name, score: best });
    }
    if (ranking.length === 0) return null;
    ranking.sort((a, b) => a.score - b.score);
    const best = ranking[0];
    const margin = ranking.length > 1 ? ranking[1].score - best.score : Infinity;
    const accepted = ranking.length === 1 || margin >= Math.max(0.01, best.score * 0.02);
    return { matched: best.name, score: best.score, margin, accepted, ranking };
  }

  getStatus() {
    return {
      patternsLoaded: this.patterns.map(p => p.name),
      totalSequences: this.patterns.reduce((a, p) => a + p.sequences.length, 0),
      bufferSize: this.buffer.length,
    };
  }
}

export const dynamicDetector = new DynamicSignDetector();

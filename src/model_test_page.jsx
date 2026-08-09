// model_test_page.jsx
// Banco de pruebas del modelo DTW entrenado desde video.
//
// A diferencia de /practice (que usa los templates geometricos estaticos de
// lsm_detector.js), esta pagina evalua EXCLUSIVAMENTE los patrones DTW de
// public/training_data/. Sirve para medir si el modelo realmente separa las
// senas entre si, viendo el ranking completo en vivo.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fingerStates } from "./lsm_detector.js";
import { dynamicDetector, frameInfo } from "./dynamic_sign_detector.js";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const CATEGORY_LABELS = {
  numeros: "Números",
  palabras: "Palabras",
  familia: "Familia",
  colores: "Colores",
  salud: "Salud",
  tecnologia: "Tecnología",
  expresiones: "Expresiones",
};

// Cuantos frames sin mano antes de dar por terminado el intento.
const IDLE_FRAMES_TO_STOP = 12;
// Minimo de frames con mano para considerar que hubo un intento real.
const MIN_FRAMES_FOR_ATTEMPT = 6;

function pickRandom(list, exclude) {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  let choice = exclude;
  while (choice === exclude) {
    choice = list[Math.floor(Math.random() * list.length)];
  }
  return choice;
}

export default function ModelTestPage({ isDark, navigate, useCameraMediaPipe, reloadDynamicPatterns }) {
  const [manifest, setManifest] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("Cargando patrones entrenados…");

  const [activeCats, setActiveCats] = useState(() => new Set(["numeros", "palabras", "familia", "colores"]));
  const [target, setTarget] = useState(null);

  const [ranking, setRanking] = useState([]);
  const [handDetected, setHandDetected] = useState(false);
  const [bufferSize, setBufferSize] = useState(0);
  const [lastResult, setLastResult] = useState(null); // { correct, guess, score, margin, target }
  const [stats, setStats] = useState({ correct: 0, total: 0, top3: 0 });
  const [history, setHistory] = useState([]);

  const idleRef = useRef(0);
  const activeFramesRef = useRef(0);
  const targetRef = useRef(null);
  const evaluatingRef = useRef(false);
  targetRef.current = target;

  // ── Carga de patrones ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/training-data/manifest?t=${Date.now()}`);
        if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
        const man = await res.json();
        if (cancelled) return;
        setManifest(man);
        setLoadingMsg("Cargando secuencias DTW…");
        const loaded = await reloadDynamicPatterns();
        if (cancelled) return;
        setLoadingMsg(null);
        if (!loaded || loaded.length === 0) {
          setLoadError("No se cargó ningún patrón. Revisa public/training_data/.");
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadDynamicPatterns]);

  // Señas disponibles segun las categorias activas.
  const pool = useMemo(() => {
    if (!manifest) return [];
    const out = [];
    for (const [cat, signs] of Object.entries(manifest)) {
      if (!activeCats.has(cat) || !Array.isArray(signs)) continue;
      for (const s of signs) out.push({ name: s, category: cat });
    }
    return out;
  }, [manifest, activeCats]);

  const nextTarget = useCallback(() => {
    setRanking([]);
    setLastResult(null);
    dynamicDetector.clearBuffer();
    idleRef.current = 0;
    activeFramesRef.current = 0;
    evaluatingRef.current = false;
    setTarget(prev => pickRandom(pool, prev?.name ? pool.find(p => p.name === prev.name) : null));
  }, [pool]);

  // Primera seña en cuanto haya pool.
  useEffect(() => {
    if (pool.length > 0 && !target) setTarget(pickRandom(pool, null));
  }, [pool, target]);

  // ── Evaluacion de un intento ─────────────────────────────────────────
  const evaluateAttempt = useCallback(() => {
    const tgt = targetRef.current;
    if (!tgt || evaluatingRef.current) return;
    evaluatingRef.current = true;

    const full = dynamicDetector.detectRanking();
    dynamicDetector.clearBuffer();
    activeFramesRef.current = 0;

    if (full.length === 0) { evaluatingRef.current = false; return; }

    const guess = full[0];
    const margin = full.length > 1 ? full[1].score - guess.score : Infinity;
    const position = full.findIndex(r => r.name === tgt.name);
    const correct = guess.name === tgt.name;
    const inTop3 = position >= 0 && position < 3;

    const result = {
      target: tgt.name,
      guess: guess.name,
      score: guess.score,
      margin,
      correct,
      inTop3,
      position: position >= 0 ? position + 1 : null,
      targetScore: position >= 0 ? full[position].score : null,
    };

    setLastResult(result);
    setStats(s => ({
      correct: s.correct + (correct ? 1 : 0),
      total: s.total + 1,
      top3: s.top3 + (inTop3 ? 1 : 0),
    }));
    setHistory(h => [result, ...h].slice(0, 12));
  }, []);

  // ── Loop de MediaPipe ────────────────────────────────────────────────
  const handleResults = useCallback(({ handRes }) => {
    const lms = handRes?.landmarks?.[0] ?? null;
    setHandDetected(!!lms);

    if (!lms) {
      idleRef.current += 1;
      // Al soltar la mano tras un intento valido, evaluamos.
      if (idleRef.current === IDLE_FRAMES_TO_STOP && activeFramesRef.current >= MIN_FRAMES_FOR_ATTEMPT) {
        evaluateAttempt();
      }
      return;
    }

    // Mano de vuelta: empieza un intento nuevo.
    if (idleRef.current >= IDLE_FRAMES_TO_STOP) {
      evaluatingRef.current = false;
      setLastResult(null);
    }
    idleRef.current = 0;
    activeFramesRef.current += 1;

    const fs = fingerStates(lms);
    dynamicDetector.pushFrameInfo(frameInfo(fs, lms));
    setBufferSize(dynamicDetector.buffer.length);
    setRanking(dynamicDetector.detectRanking().slice(0, 5));
  }, [evaluateAttempt]);

  const { videoRef, canvasRef, camReady, camError } = useCameraMediaPipe({ onResults: handleResults });

  const toggleCat = (cat) => {
    setActiveCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      // Nunca dejar el pool vacio.
      return next.size === 0 ? prev : next;
    });
    setTarget(null);
  };

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const top3Acc = stats.total > 0 ? Math.round((stats.top3 / stats.total) * 100) : 0;

  const panel = isDark ? "bg-[#101E24] border-[#1E3038]" : "bg-white border-[#D9E4E7]";
  const textMain = isDark ? "text-[#E6F1F3]" : "text-[#12303A]";
  const textSoft = isDark ? "text-[#8AA8B0]" : "text-[#5B7883]";

  return (
    <div className={cx("min-h-screen", isDark ? "bg-[#08151A]" : "bg-[#F4F8F9]")}>
      {/* ── Barra superior ── */}
      <header className={cx("flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3", panel)}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className={cx("rounded-lg px-3 py-1.5 text-xs font-bold", isDark ? "bg-[#1A2C33] text-[#8AA8B0]" : "bg-[#EDF3F4] text-[#5B7883]")}
          >
            ← Volver
          </button>
          <h1 className={cx("text-sm font-bold", textMain)}>Banco de pruebas · Modelo DTW</h1>
          <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-bold", isDark ? "bg-[#14323B] text-[#2AABB8]" : "bg-[#E0F2F4] text-[#127C88]")}>
            {pool.length} señas
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={cx("text-[10px] font-semibold uppercase tracking-wide", textSoft)}>Top-1</div>
            <div className={cx("text-lg font-bold leading-none", accuracy >= 70 ? "text-[#2E9E6B]" : accuracy >= 40 ? "text-[#D98E36]" : "text-[#D96B6B]")}>
              {accuracy}%
            </div>
          </div>
          <div className="text-right">
            <div className={cx("text-[10px] font-semibold uppercase tracking-wide", textSoft)}>Top-3</div>
            <div className={cx("text-lg font-bold leading-none", textMain)}>{top3Acc}%</div>
          </div>
          <div className="text-right">
            <div className={cx("text-[10px] font-semibold uppercase tracking-wide", textSoft)}>Intentos</div>
            <div className={cx("text-lg font-bold leading-none", textMain)}>{stats.total}</div>
          </div>
        </div>
      </header>

      {/* ── Filtros de categoria ── */}
      <div className={cx("flex flex-wrap items-center gap-2 border-b px-6 py-2", panel)}>
        <span className={cx("text-[11px] font-semibold", textSoft)}>Categorías:</span>
        {manifest && Object.entries(manifest).map(([cat, signs]) => {
          if (!Array.isArray(signs) || signs.length === 0) return null;
          const on = activeCats.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className={cx(
                "rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                on
                  ? "bg-[#2AABB8] text-white"
                  : isDark ? "bg-[#1A2C33] text-[#5B7883]" : "bg-[#EDF3F4] text-[#8AA8B0]"
              )}
            >
              {CATEGORY_LABELS[cat] || cat} ({signs.length})
            </button>
          );
        })}
      </div>

      {loadError && (
        <div className="mx-6 mt-4 rounded-lg bg-[#3A1B1B] px-4 py-3 text-sm font-semibold text-[#F5C9C9]">
          Error cargando el modelo: {loadError}
        </div>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
        {/* ── Camara + video de referencia ── */}
        <div className="relative overflow-hidden rounded-xl bg-black" style={{ minHeight: 420 }}>
          <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />

          {loadingMsg && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2AABB8] border-t-transparent" />
              <p className="text-sm font-semibold text-white">{loadingMsg}</p>
            </div>
          )}

          {!camReady && !camError && !loadingMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2AABB8] border-t-transparent" />
              <p className="text-sm font-semibold text-white">Iniciando cámara…</p>
            </div>
          )}

          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-sm font-semibold text-[#D96B6B]">{camError}</p>
              <p className="text-xs text-[#8AA8B0]">Permite el acceso a la cámara y recarga.</p>
            </div>
          )}

          {/* Seña objetivo */}
          {target && (
            <div className="absolute left-4 top-4 z-10 rounded-xl bg-black/70 px-4 py-2 backdrop-blur-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8AA8B0]">
                Haz esta seña
              </div>
              <div className="text-2xl font-bold leading-tight text-white">{target.name}</div>
              <div className="text-[10px] font-semibold text-[#2AABB8]">
                {CATEGORY_LABELS[target.category] || target.category}
              </div>
            </div>
          )}

          {/* Estado del buffer */}
          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
            <span className={cx(
              "rounded-full px-3 py-1 text-[11px] font-bold backdrop-blur-sm",
              handDetected ? "bg-[#1A6B4A]/90 text-[#D4F5E4]" : "bg-black/60 text-[#8AA8B0]"
            )}>
              {handDetected ? `Capturando · ${bufferSize} frames` : "Sin mano"}
            </span>
            {!handDetected && activeFramesRef.current === 0 && (
              <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-[#8AA8B0]">
                Haz la seña y baja la mano para evaluar
              </span>
            )}
          </div>

          {/* Video de referencia en la esquina */}
          {target && (
            <div className="absolute bottom-4 right-4 z-10 w-44 overflow-hidden rounded-xl border-2 border-white/25 bg-black shadow-2xl">
              <div className="bg-black/80 px-2 py-1 text-[10px] font-bold text-[#2AABB8]">
                Referencia · {target.name}
              </div>
              <video
                key={target.name}
                src={`/videos/signs/${encodeURIComponent(target.name)}.mp4`}
                className="block h-auto w-full"
                autoPlay
                loop
                muted
                playsInline
                onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
              />
            </div>
          )}

          {/* Veredicto del intento */}
          {lastResult && (
            <div className={cx(
              "absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-6 py-4 text-center backdrop-blur-md",
              lastResult.correct ? "bg-[#1A6B4A]/90" : "bg-[#7A2B2B]/90"
            )}>
              <div className="text-3xl font-bold text-white">
                {lastResult.correct ? "✓ Correcto" : "✗ Confundido"}
              </div>
              {!lastResult.correct && (
                <div className="mt-1 text-sm font-semibold text-white/90">
                  Detectó <b>{lastResult.guess}</b> en vez de <b>{lastResult.target}</b>
                </div>
              )}
              <div className="mt-1 text-xs font-semibold text-white/70">
                dist {lastResult.score.toFixed(3)}
                {lastResult.position && ` · objetivo en #${lastResult.position}`}
              </div>
            </div>
          )}
        </div>

        {/* ── Panel lateral ── */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              onClick={nextTarget}
              className="flex-1 rounded-xl bg-[#2AABB8] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#238E99]"
            >
              Siguiente seña →
            </button>
            <button
              onClick={() => { dynamicDetector.clearBuffer(); setRanking([]); setLastResult(null); activeFramesRef.current = 0; evaluatingRef.current = false; }}
              className={cx("rounded-xl px-4 py-2.5 text-sm font-bold", isDark ? "bg-[#1A2C33] text-[#8AA8B0]" : "bg-[#EDF3F4] text-[#5B7883]")}
            >
              Reiniciar
            </button>
          </div>

          {/* Ranking en vivo */}
          <div className={cx("rounded-xl border p-3", panel)}>
            <div className={cx("mb-2 text-[11px] font-bold uppercase tracking-wide", textSoft)}>
              Ranking DTW en vivo (menor = mejor)
            </div>
            {ranking.length === 0 ? (
              <p className={cx("py-3 text-center text-xs", textSoft)}>
                Mueve la mano frente a la cámara…
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {ranking.map((r, i) => {
                  const isTarget = target && r.name === target.name;
                  return (
                    <div
                      key={r.name}
                      className={cx(
                        "flex items-center justify-between rounded-lg px-2.5 py-1.5",
                        isTarget
                          ? "bg-[#2AABB8]/20 ring-1 ring-[#2AABB8]"
                          : isDark ? "bg-[#16272E]" : "bg-[#F4F8F9]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cx("w-4 text-[10px] font-bold", textSoft)}>{i + 1}</span>
                        <span className={cx("text-xs font-bold", isTarget ? "text-[#2AABB8]" : textMain)}>
                          {r.name}
                        </span>
                      </div>
                      <span className={cx("font-mono text-[11px] font-semibold", textSoft)}>
                        {r.score.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Historial */}
          <div className={cx("rounded-xl border p-3", panel)}>
            <div className={cx("mb-2 text-[11px] font-bold uppercase tracking-wide", textSoft)}>
              Últimos intentos
            </div>
            {history.length === 0 ? (
              <p className={cx("py-3 text-center text-xs", textSoft)}>Sin intentos todavía.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className={cx("font-semibold", h.correct ? "text-[#2E9E6B]" : "text-[#D96B6B]")}>
                      {h.correct ? "✓" : "✗"} {h.target}
                    </span>
                    {!h.correct && (
                      <span className={cx("font-mono", textSoft)}>
                        → {h.guess} {h.position ? `(#${h.position})` : "(fuera)"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

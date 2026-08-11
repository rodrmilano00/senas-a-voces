import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { HandLandmarker, PoseLandmarker, FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { createRoot } from "react-dom/client";
import "./styles/styles.css";
import { GLOSARIO_LESSONS, ALPHABET_LESSON } from "./data/lessons_glosario.js";
import { fingerStates, scoreTarget, detectBestLetter, MATCH_THR } from "./utils/lsm_detector.js";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AuthPage from "./components/AuthPage";
import EmailConfirmationPage from "./components/EmailConfirmationPage";
import { updateSignProgress, updateModuleProgress, updateStreak, recordVideoView, updateWeeklyActivity, updatePracticeDays, getRecommendations } from "./services/progressService";
import { Analytics } from "@vercel/analytics/react";
import { supabase } from "./lib/supabaseClient";

const navItems = [
  { path: "/", label: "Acceso", icon: "lock" },
  { path: "/dashboard", label: "Dashboard", icon: "trophy" },
  { path: "/learn", label: "Progreso", icon: "sparkles" },
  { path: "/lesson", label: "Lecciones", icon: "book" },
  { path: "/practice", label: "Práctica", icon: "camera" }
];

const modules = [ALPHABET_LESSON, ...GLOSARIO_LESSONS].map((lesson, i) => ({
  id: lesson.id,
  title: lesson.title,
  desc: `${lesson.items.length} señas · Nivel ${lesson.level}`,
  signs: lesson.items.length,
  status: i === 0 ? "current" : i < 3 ? "completed" : "locked",
  items: lesson.items,
  level: lesson.level,
  icon: getModuleIcon(lesson.title),
}));

function getModuleIcon(title) {
  const iconMap = {
    "Abecedario LSM (A–Z + Ñ)": "abc",
    "Números (todos)": "numbers",
    "Expresiones cotidianas": "expressions",
    "Colores (todos)": "colors",
    "Familia (todos)": "family",
    "Salud (todos)": "health",
    "Tecnología (todos)": "technology",
  };
  return iconMap[title] || "book";
}

function getSignIcon(name) {
  const iconMap = {
    // Números
    "1": "number-1",
    "2": "number-2",
    "3": "number-3",
    "4": "number-4",
    "5": "number-5",
    "6": "number-6",
    "7": "number-7",
    "8": "number-8",
    "9": "number-9",
    "10": "number-10",
    "20": "number-20",
    "100": "number-100",
    // Expresiones
    "DISCULPA": "sorry",
    "POR FAVOR": "please",
    "¿CÓMO ESTÁS?": "how-are-you",
    "¿CÓMO TE LLAMAS?": "what-name",
    "¡SORPRESA!": "surprise",
    "¡QUÉ MILAGRO!": "miracle",
    // Colores
    "ROJO": "red",
    "AZUL": "blue",
    "VERDE": "green",
    "AMARILLO": "yellow",
    "BLANCO": "white",
    "NEGRO": "black",
    "NARANJA": "orange",
    "MORADO": "purple",
    "ROSA": "pink",
    "CAFÉ": "brown",
    // Familia
    "MAMÁ": "mom",
    "PAPÁ": "dad",
    "HERMANO": "brother",
    "ABUELO": "grandpa",
    "ABUELA": "grandma",
    "TÍO": "uncle",
    "ESPOSO": "spouse",
    // Salud
    "DOCTOR": "doctor",
    "HOSPITAL": "hospital",
    "MEDICINA": "medicine",
    "ENFERMEDAD": "disease",
    "EMERGENCIA": "emergency",
    // Tecnología
    "INTERNET": "internet",
    "TELÉFONO": "phone",
    "COMPUTADORA": "computer",
    "INSTAGRAM": "instagram",
    "YOUTUBE": "youtube",
  };
  return iconMap[name] || "sparkles";
}

// signsQueue generado desde ALPHABET_LESSON + currículum del lsm_teacher.py
// Orden: Abecedario (G0) → Números (G1) → Expresiones → Colores → Familia → Salud → Tecnología
const signsQueue = [
  // ── G0: Abecedario LSM (orden del build_curriculum de lsm_teacher.py) ──
  ...ALPHABET_LESSON.items.map((it) => ({
    name:       it.label,
    difficulty: it.mov ? "Media" : "Fácil",
    module:     "Abecedario",
    hint:       it.hint,
    template:   it.template,
    mov:        it.mov,
    video_ref:  it.video_ref,
    thumbnail:  it.thumbnail,
  })),
  // ── G1: Números 1-10 (geométricos, fáciles) ──
  { name:"1",  difficulty:"Fácil",   module:"Números", hint:"Índice extendido hacia arriba; resto del puño cerrado.",          template:"CECCC", mov:false },
  { name:"2",  difficulty:"Fácil",   module:"Números", hint:"Índice y medio extendidos en V. Mano quieta.",                    template:"CEECC", mov:false },
  { name:"3",  difficulty:"Fácil",   module:"Números", hint:"Índice, medio y anular extendidos (como la W).",                  template:"CEEEC", mov:false },
  { name:"4",  difficulty:"Fácil",   module:"Números", hint:"Cuatro dedos extendidos, pulgar cerrado.",                        template:"CEEEE", mov:false },
  { name:"5",  difficulty:"Fácil",   module:"Números", hint:"Mano abierta, los cinco dedos extendidos.",                      template:"EEEEE", mov:false },
  { name:"6",  difficulty:"Media",   module:"Números", hint:"4 dedos extendidos + pulgar doblado tocando la palma (no el costado).", template:"CEEEE", mov:false },
  { name:"7",  difficulty:"Media",   module:"Números", hint:"Índice+medio+meñique extendidos; anular doblado hacia el pulgar.", template:"CEEEC", mov:false },
  { name:"8",  difficulty:"Media",   module:"Números", hint:"Índice+anular+meñique extendidos; medio doblado al pulgar.",       template:"CEECE", mov:false },
  { name:"9",  difficulty:"Media",   module:"Números", hint:"Medio+anular+meñique extendidos; índice doblado al pulgar.",       template:"CECEE", mov:false },
  { name:"10", difficulty:"Difícil", module:"Números", hint:"Pulgar e índice extendidos — mueve la mano de lado a lado.",       template:null,    mov:true  },
  { name:"20", difficulty:"Difícil", module:"Números", hint:"Pulgar e índice en círculo — mueve la mano en círculos pequeños.", template:null,    mov:true  },
  { name:"100",difficulty:"Difícil", module:"Números", hint:"Seña LSM de cien — usa el botón Saltar si no tienes template.",    template:null,    mov:false },
  // ── G2: Expresiones cotidianas ──
  { name:"DISCULPA",         difficulty:"Fácil",   module:"Expresiones", hint:"Mano en el pecho, movimiento hacia afuera." },
  { name:"POR FAVOR",        difficulty:"Fácil",   module:"Expresiones", hint:"Palma hacia arriba, movimiento circular." },
  { name:"¿CÓMO ESTÁS?",     difficulty:"Media",   module:"Expresiones", hint:"Expresión facial + seña combinada." },
  { name:"¿CÓMO TE LLAMAS?", difficulty:"Media",   module:"Expresiones", hint:"Pregunta con cejas arriba." },
  { name:"¡SORPRESA!",       difficulty:"Media",   module:"Expresiones", hint:"Ojos abiertos + manos abiertas.", },
  { name:"¡QUÉ MILAGRO!",    difficulty:"Difícil", module:"Expresiones", hint:"Expresión facial enfatizada." },
  // ── G3: Colores ──
  { name:"ROJO",    difficulty:"Fácil",   module:"Colores", hint:"Índice rozando el labio hacia abajo." },
  { name:"AZUL",    difficulty:"Fácil",   module:"Colores", hint:"Mano en 'A' moviéndose hacia el lado." },
  { name:"VERDE",   difficulty:"Fácil",   module:"Colores", hint:"Mano en 'V' con movimiento." },
  { name:"AMARILLO",difficulty:"Fácil",   module:"Colores", hint:"Mano en 'Y' con movimiento." },
  { name:"BLANCO",  difficulty:"Media",   module:"Colores", hint:"Mano abierta sobre el pecho, cierra al separar." },
  { name:"NEGRO",   difficulty:"Media",   module:"Colores", hint:"Índice cruza la frente." },
  { name:"NARANJA", difficulty:"Media",   module:"Colores", hint:"Mano en 'C' abriendo y cerrando." },
  { name:"MORADO",  difficulty:"Media",   module:"Colores", hint:"Mano en 'M' moviéndose." },
  { name:"ROSA",    difficulty:"Difícil", module:"Colores", hint:"Dedo medio rozando los labios hacia abajo." },
  { name:"CAFÉ",    difficulty:"Difícil", module:"Colores", hint:"Mano en 'C' sobre la otra mano." },
  // ── G4: Familia ──
  { name:"MAMÁ",    difficulty:"Fácil",   module:"Familia", hint:"Mano abierta, pulgar toca la barbilla." },
  { name:"PAPÁ",    difficulty:"Fácil",   module:"Familia", hint:"Mano abierta, pulgar toca la frente." },
  { name:"HERMANO", difficulty:"Fácil",   module:"Familia", hint:"Índices juntos moviéndose en paralelo." },
  { name:"ABUELO",  difficulty:"Media",   module:"Familia", hint:"Mano en 'A' desde la barbilla hacia afuera." },
  { name:"ABUELA",  difficulty:"Media",   module:"Familia", hint:"Mano en 'A' desde la barbilla, dos movimientos." },
  { name:"TÍO",     difficulty:"Media",   module:"Familia", hint:"Mano en 'T' moviéndose." },
  { name:"ESPOSO",  difficulty:"Difícil", module:"Familia", hint:"Seña de hombre + anillo." },
  // ── G5: Salud ──
  { name:"DOCTOR",     difficulty:"Media",   module:"Salud", hint:"Dedos en 'D' tocando la muñeca." },
  { name:"HOSPITAL",   difficulty:"Media",   module:"Salud", hint:"Cruz dibujada en el brazo." },
  { name:"MEDICINA",   difficulty:"Media",   module:"Salud", hint:"Pastilla entre dedos índice y pulgar." },
  { name:"ENFERMEDAD", difficulty:"Difícil", module:"Salud", hint:"Dedos en la frente y el estómago." },
  { name:"EMERGENCIA", difficulty:"Difícil", module:"Salud", hint:"Manos en movimiento urgente." },
  // ── G7: Tecnología ──
  { name:"INTERNET",    difficulty:"Media",   module:"Tecnología", hint:"Dedos en 'W' moviéndose en círculo." },
  { name:"TELÉFONO",    difficulty:"Media",   module:"Tecnología", hint:"Mano en 'Y' en la oreja." },
  { name:"COMPUTADORA", difficulty:"Media",   module:"Tecnología", hint:"Dedos sobre teclado imaginario." },
  { name:"INSTAGRAM",   difficulty:"Difícil", module:"Tecnología", hint:"Seña compuesta." },
  { name:"YOUTUBE",     difficulty:"Difícil", module:"Tecnología", hint:"Seña compuesta." },
];

const learningMoments = [
  { label: "Memoria visual", value: "Alta", detail: "Reconoces patrones de mano con buena precisión." },
  { label: "Ritmo", value: "12 días", detail: "Tu constancia desbloquea práctica avanzada." },
  { label: "Siguiente foco", value: "Familia", detail: "Practica parentescos antes de pasar a comida." }
];

const dailyQuest = [
  { task: "Completa 3 señas de Familia", done: true },
  { task: "Repite una seña difícil", done: true },
  { task: "Graba una práctica corta", done: false }
];

const accountActions = [
  { label: "Mi perfil", helper: "Datos y preferencias", icon: "user", path: "/dashboard" },
  { label: "Progreso", helper: "Racha y módulos", icon: "trophy", path: "/learn" },
  { label: "Práctica", helper: "Abrir cámara", icon: "camera", path: "/practice" },
  { label: "Cerrar sesión", helper: "Volver al acceso", icon: "lock", path: "/" }
];

const LOGO_SRC = "/logo-senas-a-voces-crop.png";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [state, setState] = useState(null);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, options = {}) => {
    window.history.pushState(options.state || {}, "", to);
    setPath(to);
    setState(options.state || null);
  }, []);

  return [path, navigate, state];
}

function Icon({ name, className = "h-5 w-5" }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", className };
  const filled = { viewBox: "0 0 20 20", fill: "currentColor", className };
  const icons = {
    moon: <svg {...filled}><path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8 8 0 1 0 10.586 10.586z" /></svg>,
    sun: <svg {...common} viewBox="-2 -2 28 28"><circle cx="12" cy="12" r="4" /><path d="M12 1v3" /><path d="M12 20v3" /><path d="M4.22 4.22 6.34 6.34" /><path d="m17.66 17.66 2.12 2.12" /><path d="M1 12h3" /><path d="M20 12h3" /><path d="m4.22 19.78 2.12-2.12" /><path d="m17.66 6.34 2.12-2.12" /></svg>,
    mail: <svg {...filled}><path d="M3 4a2 2 0 0 0-2 2v1.16l8.44 4.22a1.25 1.25 0 0 0 1.12 0L19 7.16V6a2 2 0 0 0-2-2H3Z" /><path d="m19 8.84-7.77 3.88a2.75 2.75 0 0 1-2.46 0L1 8.84V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.84Z" /></svg>,
    lock: <svg {...filled}><path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" /></svg>,
    user: <svg {...filled}><path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493A7.002 7.002 0 0 1 16.54 14.49c.196.507.022 1.077-.408 1.41A9.957 9.957 0 0 1 10 18a9.957 9.957 0 0 1-6.125-2.095 1.23 1.23 0 0 1-.41-1.412Z" /></svg>,
    eye: <svg {...filled}><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" /></svg>,
    play: <svg {...common}><polygon points="5 3 19 12 5 21 5 3" /></svg>,
    camera: <svg {...common}><path d="m23 7-7 5 7 5V7Z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>,
    book: <svg {...common}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
    refresh: <svg {...common}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
    check: <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>,
    arrow: <svg {...filled}><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" /></svg>,
    flame: <svg {...common}><path fill="currentColor" fillOpacity="0.26" d="M8.5 14.5A4.5 4.5 0 0 0 13 19a5 5 0 0 0 5-5c0-3.5-2.5-5.8-5.4-8.7-.5 2.9-2 4.3-4.1 5.7C7 12 6 13.2 6 15a5 5 0 0 0 10 0c0-1.2-.4-2.2-1.1-3.1-.2 2.2-1.4 3.6-3 3.6-1.2 0-2.3-.7-3.4-1Z" /><path d="M8.5 14.5A4.5 4.5 0 0 0 13 19a5 5 0 0 0 5-5c0-3.5-2.5-5.8-5.4-8.7-.5 2.9-2 4.3-4.1 5.7C7 12 6 13.2 6 15a5 5 0 0 0 10 0c0-1.2-.4-2.2-1.1-3.1-.2 2.2-1.4 3.6-3 3.6-1.2 0-2.3-.7-3.4-1Z" /></svg>,
    sparkles: <svg {...common}><path d="m12 3 1.3 4.1L17 9l-3.7 1.9L12 15l-1.3-4.1L7 9l3.7-1.9L12 3Z" /><path d="m19 14 .7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9L19 14Z" /><path d="m5 13 .7 2.1L8 16l-2.3.9L5 19l-.7-2.1L2 16l2.3-.9L5 13Z" /></svg>,
    trophy: <svg {...common}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M5 5H3v2a4 4 0 0 0 4 4" /><path d="M19 5h2v2a4 4 0 0 1-4 4" /></svg>,
    x: <svg {...filled}><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" /></svg>,
    // Iconos específicos para módulos
    abc: <svg {...common} viewBox="0 0 24 24"><text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor">Aa</text></svg>,
    numbers: <svg {...common} viewBox="0 0 24 24"><text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="currentColor">123</text></svg>,
    expressions: <svg {...common}><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="9" r="1.5" fill="currentColor"/><path d="M12 14c-1.5 0-2.8.8-3.5 2h7c-.7-1.2-2-2-3.5-2z" /></svg>,
    colors: <svg {...common}><circle cx="6" cy="12" r="4" fill="currentColor" fillOpacity="0.6"/><circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.8"/><circle cx="18" cy="12" r="4" fill="currentColor" /></svg>,
    family: <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8z" /><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path d="M12 14a3 3 0 0 0 0 6 3 3 0 0 0 0-6z" /></svg>,
    health: <svg {...common}><path d="M19 12c0 1.1-.9 2-2 2-7 0-3.3-2.7-6-6-6s-6 2.7-6 6c0 1.1-.9 2-2 2-2 4.4 0 8 3.6 8 8 0 0 0 8-8 0-3.6-3.6-8-8-8z" /><path d="M12 4c.28 0 .5.22.5.5s-.22.5-.5.5-.5-.22-.5-.5.5s.22.5.5.5zM12 6c.28 0 .5.22.5.5s-.22.5-.5.5-.22-.5-.5.5s.22.5.5.5zM12 8c.28 0 .5.22.5.5s-.22.5-.5.5-.22-.5-.5.5s.22.5.5.5z" /></svg>,
    technology: <svg {...common}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M6 7h12M6 11h12M6 15h8" /><circle cx="16" cy="17" r="2" /></svg>,
    // Iconos específicos para señas individuales
    "number-1": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">1</text></svg>,
    "number-2": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">2</text></svg>,
    "number-3": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">3</text></svg>,
    "number-4": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">4</text></svg>,
    "number-5": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">5</text></svg>,
    "number-6": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">6</text></svg>,
    "number-7": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">7</text></svg>,
    "number-8": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">8</text></svg>,
    "number-9": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="16" fontWeight="bold" fill="currentColor">9</text></svg>,
    "number-10": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor">10</text></svg>,
    "number-20": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor">20</text></svg>,
    "number-100": <svg {...common}><text x="12" y="17" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">100</text></svg>,
    "sorry": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>,
    "please": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>,
    "how-are-you": <svg {...common}><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="9" r="1.5" fill="currentColor"/><path d="M12 14c-1.5 0-2.8.8-3.5 2h7c-.7-1.2-2-2-3.5-2z" /></svg>,
    "what-name": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2 15h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z" /></svg>,
    "surprise": <svg {...common}><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="9" r="1.5" fill="currentColor"/><path d="M12 14c-2 0-3.7 1.3-4.5 3h9c-.8-1.7-2.5-3-4.5-3z" /></svg>,
    "miracle": <svg {...common}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
    "red": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" /></svg>,
    "blue": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.7"/></svg>,
    "green": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.5"/></svg>,
    "yellow": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.9"/></svg>,
    "white": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.3"/></svg>,
    "black": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" /></svg>,
    "orange": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.8"/></svg>,
    "purple": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.6"/></svg>,
    "pink": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.7"/></svg>,
    "brown": <svg {...common}><circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.5"/></svg>,
    "mom": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>,
    "dad": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2 15h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V7h4v2z" /></svg>,
    "brother": <svg {...common}><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>,
    "grandpa": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>,
    "grandma": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>,
    "uncle": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>,
    "spouse": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>,
    "doctor": <svg {...common}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z" /></svg>,
    "hospital": <svg {...common}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z" /></svg>,
    "medicine": <svg {...common}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" /></svg>,
    "disease": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>,
    "emergency": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>,
    "internet": <svg {...common}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>,
    "phone": <svg {...common}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>,
    "computer": <svg {...common}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M6 17h12M12 17v4" /></svg>,
    "instagram": <svg {...common}><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="3" /><circle cx="18" cy="6" r="1" /></svg>,
    "youtube": <svg {...common}><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" /><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" /></svg>
  };
  return icons[name] || icons.play;
}

function Logo({ isDark, compact = false }) {
  return (
    <img
      src={LOGO_SRC}
      alt="Señas a Voces Academy"
      className={cx("h-auto object-contain", compact ? "w-40 sm:w-48 md:w-56" : "w-56 sm:w-72", isDark && "logo-on-dark")}
    />
  );
}

function ThemeToggle({ isDark, setIsDark }) {
  return (
    <button onClick={() => setIsDark(!isDark)} className={cx("btn-press rounded-xl p-2", isDark ? "text-brand-orange hover:bg-brand-card" : "text-brand-teal hover:bg-white")} aria-label="Cambiar tema">
      <Icon name={isDark ? "sun" : "moon"} />
    </button>
  );
}

function AppHeader({ isDark, setIsDark, navigate, path }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef(null);
  const mobileNavRef = useRef(null);
  const { profile, signOut } = useAuth();

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeFromOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeFromOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeFromOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeFromOutside = (event) => {
      if (mobileNavRef.current && !mobileNavRef.current.contains(event.target)) setMobileNavOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("mousedown", closeFromOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeFromOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  const selectAccountAction = (to) => {
    if (to === "/") {
      signOut();
    } else {
      navigate(to);
    }
    setMenuOpen(false);
  };

  const userInitials = profile?.avatar_initials || profile?.full_name?.substring(0, 2).toUpperCase() || "US";
  const userName = profile?.full_name || "Usuario";
  const userEmail = profile?.email || "";

  return (
    <header className={cx("sticky top-0 z-40 transition-colors bg-white backdrop-blur-xl border-b border-gray-200")}>
      <div className="mx-auto px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/dashboard")} className="btn-press flex items-center gap-3">
            <Logo isDark={isDark} compact />
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.slice(1).map((item, index) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cx(
                  "group relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 active:scale-95",
                  path === item.path
                    ? (isDark ? "bg-brand-cyan text-brand-deep" : "bg-brand-teal text-white")
                    : (isDark ? "text-brand-soft hover:bg-brand-card/50" : "text-brand-muted hover:bg-brand-cream/50")
                )}
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>

            <div className="flex items-center gap-3">
              {/* Mobile Navigation Button - Toggle */}
              <button 
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                className={cx("md:hidden btn-press relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 active:scale-95", isDark ? "bg-brand-orange text-white" : "bg-brand-orange text-white")}
                aria-label={mobileNavOpen ? "Cerrar menú" : "Abrir menú"}
              >
                {mobileNavOpen ? (
                  <Icon name="x" className="h-5 w-5" />
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              {/* Desktop Actions */}
              <div className="hidden items-center gap-3 md:flex">
                <ThemeToggle isDark={isDark} setIsDark={setIsDark} />
                <div ref={menuRef} className="relative">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                    className={cx(
                      "profile-trigger btn-press relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all duration-200 active:scale-95",
                      isDark ? "bg-brand-cyan text-brand-deep hover:bg-brand-cyan/80" : "bg-brand-teal text-white hover:bg-brand-teal/80"
                    )}
                  >
                    {userInitials}
                    {menuOpen && (
                      <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-brand-orange" />
                    )}
                  </button>
                  {menuOpen && (
                    <div className={cx("account-menu", isDark ? "account-menu-dark" : "account-menu-light")} role="menu">
                      <div className="account-menu-head">
                        <span className={cx("flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold", isDark ? "bg-brand-card text-brand-cyan" : "bg-brand-teal text-white")}>{userInitials}</span>
                        <span>
                          <strong className={cx("block text-sm", isDark ? "text-white" : "text-brand-ink")}>{userName}</strong>
                          <small className={cx("block text-xs", isDark ? "text-brand-soft" : "text-brand-muted")}>{userEmail}</small>
                        </span>
                      </div>
                      <div className="mt-2">
                        {accountActions.map((action) => (
                          <button key={action.label} type="button" role="menuitem" className="account-menu-item text-left" onClick={() => selectAccountAction(action.path)}>
                            <span className={cx("account-menu-icon", isDark ? "text-brand-cyan" : "text-brand-teal")}><Icon name={action.icon} className="h-4 w-4" /></span>
                            <span>
                              <strong className={cx("block text-xs", isDark ? "text-white" : "text-brand-ink")}>{action.label}</strong>
                              <small className={cx("block text-[10px]", isDark ? "text-brand-soft" : "text-brand-muted")}>{action.helper}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* Mobile Navigation Menu - Full Screen Overlay */}
      {mobileNavOpen && (
        <div 
          ref={mobileNavRef} 
          className={cx("fixed inset-0 z-50 md:hidden", isDark ? "bg-brand-deep/98" : "bg-brand-cream/98")}
          style={{ animation: 'fadeIn 200ms ease-out' }}
        >
          <div className="flex h-full flex-col">
            <nav className="flex-1 px-6 py-8">
              <div className="space-y-2">
                {navItems.slice(1).map((item, index) => (
                  <button 
                    key={item.path} 
                    onClick={() => { navigate(item.path); setMobileNavOpen(false); }}
                    className={cx(
                      "btn-press flex w-full items-center gap-4 rounded-2xl px-6 py-4 text-left text-sm font-bold transition-all duration-200 active:scale-98",
                      path === item.path 
                        ? (isDark ? "bg-brand-cyan text-brand-deep" : "bg-brand-teal text-white") 
                        : (isDark ? "text-brand-soft hover:bg-brand-card/50" : "text-brand-muted hover:bg-brand-cream/50")
                    )}
                    style={{ 
                      animationDelay: `${index * 50}ms`,
                      animation: 'slideUp 200ms ease-out'
                    }}
                  >
                    <Icon name={item.icon} className="h-5 w-5" />
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>
            
            <div className="border-t px-6 py-6" style={{ borderColor: isDark ? "#1A5C6A" : "#E8EEEF" }}>
              <div className="flex items-center justify-between mb-4">
                <span className={cx("text-sm font-semibold", isDark ? "text-white" : "text-gray-900")}>{userName}</span>
                <button 
                  onClick={() => setIsDark(!isDark)}
                  className={cx("btn-press rounded-xl px-3 py-2 text-xs font-bold", isDark ? "bg-brand-card text-brand-orange" : "bg-white text-brand-orange shadow-sm")}
                >
                  {isDark ? "☀️ Claro" : "🌙 Oscuro"}
                </button>
              </div>
              <button 
                onClick={() => { signOut(); setMobileNavOpen(false); }}
                className={cx("btn-press w-full rounded-2xl px-6 py-3 text-sm font-bold transition-all duration-200 active:scale-98", isDark ? "bg-brand-card text-brand-orange" : "bg-white text-brand-orange shadow-sm")}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function WaveBackground({ isDark }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className={cx("animate-wave-drift absolute -left-20 -top-20 h-[400px] w-[600px]", isDark ? "text-brand-card" : "text-brand-teal")} viewBox="0 0 600 400" fill="currentColor" opacity="0.06">
        <path d="M0 200C100 100 200 300 300 200C400 100 500 300 600 200V0H0V200Z" />
      </svg>
      <svg className={cx("animate-wave-drift absolute -bottom-16 -right-16 h-[350px] w-[500px]", isDark ? "text-brand-cyan" : "text-brand-orange")} viewBox="0 0 500 350" fill="currentColor" opacity="0.05" style={{ animationDelay: "2s" }}>
        <path d="M0 150C80 50 160 250 240 150C320 50 400 250 500 150V350H0V150Z" />
      </svg>
    </div>
  );
}


function Card({ isDark, className = "", children }) {
  return (
    <div className={cx(
      "surface-card overflow-hidden rounded-3xl transition-all duration-300",
      isDark 
        ? "border border-brand-line/50 bg-brand-card shadow-sm" 
        : "border border-gray-200/50 bg-white shadow-sm",
      className
    )}>
      <div className={cx("p-6 sm:p-8", isDark ? "relative" : "relative")}>
        {children}
      </div>
    </div>
  );
}

function LearningPulse({ isDark }) {
  return (
    <Card isDark={isDark} className="learning-pulse mb-6 relative overflow-hidden">
      <div className="relative">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between sm:gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-4">
              <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
                Brújula de aprendizaje
              </span>
            </div>
            <h2 className={cx("text-2xl font-extrabold sm:text-3xl", isDark ? "text-white" : "text-brand-ink")}>
              Hoy conviene practicar <span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>Familia</span>
            </h2>
            <p className={cx("mt-3 max-w-2xl text-sm leading-7", isDark ? "text-brand-soft" : "text-brand-muted")}>
              Tu ruta detecta buena memoria visual. Mantén sesiones cortas y repite las señas que mezclan parentesco y saludo.
            </p>
          </div>
          <div className={cx(
            "hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl sm:flex",
            isDark ? "bg-brand-cyan/15 text-brand-cyan" : "bg-brand-teal/15 text-brand-teal"
          )}>
            <Icon name="sparkles" className="h-8 w-8" />
          </div>
        </div>
        
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {learningMoments.map((item, index) => (
            <div 
              key={item.label} 
              className={cx(
                "group relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:scale-[1.02]",
                isDark 
                  ? "border-brand-line/30 bg-brand-deep/40 hover:border-brand-cyan/50 hover:bg-brand-deep/60" 
                  : "border-gray-200 bg-gray-50 hover:border-brand-teal/50 hover:bg-gray-100"
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="relative">
                <span className={cx("text-[10px] font-bold uppercase tracking-wider", isDark ? "text-brand-soft" : "text-gray-600")}>
                  {item.label}
                </span>
                <strong className={cx("mt-2 block text-xl font-extrabold sm:text-2xl", isDark ? "text-white" : "text-gray-900")}>
                  {item.value}
                </strong>
                <p className={cx("mt-2 text-xs leading-relaxed", isDark ? "text-brand-soft" : "text-gray-600")}>
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function QuestList({ isDark }) {
  const completedCount = dailyQuest.filter(q => q.done).length;
  const totalCount = dailyQuest.length;
  
  return (
    <Card isDark={isDark}>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-orange/20 text-brand-orange" : "bg-brand-orange/20 text-brand-teal")}>
            Reto de hoy
          </span>
        </div>
        <div className={cx("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold", isDark ? "bg-brand-deep/50 text-brand-soft" : "bg-gray-100 text-gray-600")}>
          <span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>{completedCount}</span>
          <span className="text-gray-400">/</span>
          <span>{totalCount}</span>
        </div>
      </div>
      
      <div className="space-y-3">
        {dailyQuest.map((quest, index) => (
          <div 
            key={quest.task} 
            className={cx(
              "group flex items-center gap-4 rounded-2xl p-4 transition-all duration-300",
              quest.done 
                ? (isDark ? "bg-brand-deep/30 opacity-70" : "bg-gray-100 opacity-70") 
                : (isDark ? "bg-brand-deep/50 hover:bg-brand-deep/70" : "bg-gray-50 hover:bg-gray-100")
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className={cx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-300",
              quest.done 
                ? "bg-brand-teal text-white" 
                : (isDark ? "border-2 border-brand-line text-brand-soft" : "border-2 border-gray-300 text-gray-600")
            )}>
              <Icon name={quest.done ? "check" : "sparkles"} className="h-4 w-4" />
            </div>
            <p className={cx(
              "flex-1 text-sm font-semibold transition-all duration-300",
              quest.done 
                ? (isDark ? "text-brand-soft line-through" : "text-gray-500 line-through") 
                : (isDark ? "text-white" : "text-gray-900")
            )}>
              {quest.task}
            </p>
            {!quest.done && (
              <span className={cx(
                "h-2 w-2 rounded-full animate-pulse",
                isDark ? "bg-brand-orange" : "bg-brand-teal"
              )} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PageTitle({ isDark, title, accent, subtitle }) {
  const parts = title.split(accent);
  return (
    <div className="animate-fade mb-8">
      <h1 className={cx("text-2xl font-extrabold md:text-3xl lg:text-4xl", isDark ? "text-white" : "text-brand-ink")} role="heading" aria-level="1">
        {parts[0]}<span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>{accent}</span>{parts[1]}
      </h1>
      <p className={cx("mt-2 text-sm md:text-base", isDark ? "text-brand-soft" : "text-brand-muted")} role="doc-subtitle">
        {subtitle}
      </p>
    </div>
  );
}

function SectionLabel({ isDark, children }) {
  return <h3 className={cx("text-sm font-bold uppercase tracking-wider", isDark ? "text-brand-soft" : "text-brand-muted")}>{children}</h3>;
}

function ProgressCard({ isDark, currentLevel, currentLesson, totalSignsLearned, totalPracticeTime, averageAccuracy, moduleProgressPercent, practiceDays }) {
  const stats = [
    [totalSignsLearned, "Señas aprendidas", "sparkles"],
    [`${totalPracticeTime} min`, "Tiempo total", "clock"],
    [`${Math.round(averageAccuracy)}%`, "Precisión", "trophy"],
    [practiceDays, "Días practicados", "flame"]
  ];
  
  return (
    <Card isDark={isDark}>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
            Progreso actual
          </span>
        </div>
        <div className={cx("rounded-full px-3 py-1.5 text-xs font-bold", isDark ? "bg-brand-deep/50 text-brand-cyan" : "bg-gray-100 text-brand-teal")}>
          Nivel {currentLevel}
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className={cx("text-2xl font-extrabold sm:text-3xl", isDark ? "text-white" : "text-gray-900")}>
          Lección {currentLesson}
        </h3>
        <p className={cx("mt-1 text-sm font-medium", isDark ? "text-brand-soft" : "text-gray-600")}>
          Progreso del módulo
        </p>
      </div>
      
      {/* Simplified Progress Bar */}
      <div className="mb-8">
        <div className={cx("relative h-3 overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-gray-200")}>
          <div 
            className={cx(
              "absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out",
              "bg-brand-teal"
            )}
            style={{ width: `${moduleProgressPercent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between">
          <span className={cx("text-xs font-medium", isDark ? "text-brand-soft" : "text-gray-600")}>
            {moduleProgressPercent}% completado
          </span>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 border-t border-dashed pt-6 sm:grid-cols-4" style={{ borderColor: isDark ? "#1A5C6A" : "#E8EEEF" }}>
        {stats.map(([value, label, icon], index) => (
          <div 
            key={label} 
            className="text-center transition-all duration-300 hover:scale-105"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className={cx("flex items-center justify-center gap-1 mb-1", isDark ? "text-brand-cyan" : "text-brand-teal")}>
              <Icon name={icon} className="h-3 w-3" />
            </div>
            <div className={cx("text-xl font-extrabold sm:text-2xl", isDark ? "text-white" : "text-gray-900")}>
              {value}
            </div>
            <div className={cx("mt-1 text-[10px] font-medium uppercase tracking-wider", isDark ? "text-[#5A8A94]" : "text-gray-600")}>
              {label}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BarRow({ label, value, isDark }) {
  return <div className="flex items-center gap-3"><span className={cx("w-8 text-xs font-semibold", isDark ? "text-brand-soft" : "text-brand-muted")}>{label}</span><div className={cx("h-2 flex-1 overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-[#E8EEEF]")}><div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.min(100, (value / 60) * 100)}%` }} /></div><span className={cx("w-10 text-right text-xs font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{value ? `${value}m` : "-"}</span></div>;
}

function QuickAction({ isDark, icon, title, desc, onClick, accent }) {
  return (
    <button 
      onClick={onClick} 
      className={cx(
        "btn-press group flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg",
        isDark 
          ? "border-brand-line/30 bg-brand-card hover:border-brand-cyan/50 hover:bg-brand-deep/50" 
          : "border-gray-200/50 bg-white hover:border-brand-teal/50 hover:shadow-brand-teal/10"
      )}
    >
      <div className={cx(
        "flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110",
        accent 
          ? "bg-brand-orange/20 text-brand-orange" 
          : isDark 
            ? "bg-brand-teal/20 text-brand-cyan" 
            : "bg-brand-teal/10 text-brand-teal"
      )}>
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <span className={cx("block text-sm font-bold", isDark ? "text-white" : "text-brand-ink")}>{title}</span>
        <span className={cx("block text-xs mt-1", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{desc}</span>
      </div>
      <div className={cx(
        "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1",
        isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal"
      )}>
        <Icon name="arrow" className="h-4 w-4" />
      </div>
    </button>
  );
}

function DashboardPage({ isDark, navigate }) {
  const { profile, userProgress, moduleProgress } = useAuth();
  
  const completedSigns = moduleProgress?.reduce((sum, mp) => sum + (mp.signs_completed || 0), 0) || 0;
  const totalSigns = modules.reduce((sum, m) => sum + m.signs, 0);
  const progress = Math.round((completedSigns / totalSigns) * 100);
  const streakDays = userProgress?.streak_days || 0;
  const practiceTime = userProgress?.total_practice_time || 0;
  const averageAccuracy = userProgress?.average_accuracy || 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Welcome Section */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
            Bienvenido de nuevo
          </span>
        </div>
        <h1 className={cx("text-3xl font-extrabold sm:text-4xl", isDark ? "text-white" : "text-brand-ink")}>
          Hola, <span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>{profile?.full_name || "Usuario"}</span>
        </h1>
        <p className={cx("mt-2 text-sm", isDark ? "text-brand-soft" : "text-brand-muted")}>
          Continúa tu aprendizaje de lengua de señas mexicana
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {/* Learning Pulse */}
          <LearningPulse isDark={isDark} />
          
          {/* Quick Stats */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ProgressCard 
              isDark={isDark}
              currentLevel={userProgress?.current_level || 1}
              currentLesson={userProgress?.current_lesson || 1}
              totalSignsLearned={completedSigns}
              totalPracticeTime={practiceTime}
              averageAccuracy={averageAccuracy}
              moduleProgressPercent={progress}
              practiceDays={streakDays}
            />
            <QuestList isDark={isDark} />
          </div>
        </div>
        
        {/* Sidebar */}
        <div className="space-y-6 lg:col-span-4">
          <Card isDark={isDark}>
            <div className="flex items-center gap-2 mb-6">
              <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
                Acciones rápidas
              </span>
            </div>
            
            <div className="space-y-3">
              <QuickAction
                isDark={isDark}
                icon="book"
                title="Continuar lección"
                desc="Retoma donde lo dejaste"
                onClick={() => navigate("/lesson")}
                accent
              />
              <QuickAction
                isDark={isDark}
                icon="camera"
                title="Practicar"
                desc="Mejora tu técnica"
                onClick={() => navigate("/practice")}
              />
              <QuickAction
                isDark={isDark}
                icon="trophy"
                title="Ver progreso"
                desc="Estadísticas detalladas"
                onClick={() => navigate("/learn")}
              />
            </div>
          </Card>
          
          {/* User Info Card */}
          <Card isDark={isDark}>
            <div className="flex items-center gap-2 mb-6">
              <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
                Tu perfil
              </span>
            </div>
            
            <div className="flex items-center gap-4 mb-4">
              <div className={cx("flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold", isDark ? "bg-brand-cyan text-brand-deep" : "bg-brand-teal text-white")}>
                {profile?.avatar_initials || profile?.full_name?.substring(0, 2).toUpperCase() || "US"}
              </div>
              <div>
                <h3 className={cx("text-lg font-bold", isDark ? "text-white" : "text-brand-ink")}>
                  {profile?.full_name || "Usuario"}
                </h3>
                <p className={cx("text-sm", isDark ? "text-brand-soft" : "text-brand-muted")}>
                  {profile?.email || ""}
                </p>
              </div>
            </div>
            
            <div className="border-t pt-4" style={{ borderColor: isDark ? "#1A5C6A" : "#E8EEEF" }}>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className={cx("text-2xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{streakDays}</div>
                  <div className={cx("text-xs", isDark ? "text-brand-soft" : "text-brand-muted")}>Días de racha</div>
                </div>
                <div>
                  <div className={cx("text-2xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{progress}%</div>
                  <div className={cx("text-xs", isDark ? "text-brand-soft" : "text-brand-muted")}>Progreso total</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function LearnPage({ isDark }) {
  const { userProgress, moduleProgress } = useAuth();
  const [selected, setSelected] = useState(modules[0]);
  const [activeSign, setActiveSign] = useState(null);
  const [search, setSearch] = useState("");

  // Auto-advance to next sign in current module
  const handleNextSign = () => {
    if (!selected || !activeSign) return;
    const currentIndex = selected.items.findIndex(item => item.label === activeSign.label);
    if (currentIndex !== -1 && currentIndex < selected.items.length - 1) {
      setActiveSign(selected.items[currentIndex + 1]);
    }
  };

  // Merge module data with progress from database
  const modulesWithProgress = useMemo(() => {
    return modules.map((module, index) => {
      const progressData = moduleProgress?.find(mp => mp.module_id === module.id);
      const signsCompleted = progressData?.signs_completed || 0;
      const isCompleted = signsCompleted >= module.signs;
      
      // Lógica de desbloqueo progresivo
      let status = 'locked';
      if (index === 0) {
        // Primer módulo siempre desbloqueado
        status = isCompleted ? 'completed' : 'current';
      } else {
        // Verificar si el módulo anterior está completado
        const prevModule = modules[index - 1];
        const prevProgressData = moduleProgress?.find(mp => mp.module_id === prevModule.id);
        const prevCompleted = (prevProgressData?.signs_completed || 0) >= prevModule.signs;
        
        if (prevCompleted) {
          status = isCompleted ? 'completed' : 'current';
        } else {
          status = 'locked';
        }
      }
      
      return {
        ...module,
        status: progressData?.status || status,
        signs_completed: signsCompleted,
      };
    });
  }, [moduleProgress]);

  const completedSigns = modulesWithProgress.filter((m) => m.status === "completed").reduce((sum, m) => sum + (m.signs_completed || m.signs), 0);
  const totalSigns = modulesWithProgress.reduce((sum, m) => sum + m.signs, 0);
  const progress = Math.round((completedSigns / totalSigns) * 100);
  const streakDays = userProgress?.streak_days || 0;

  const filteredItems = useMemo(() => {
    if (!selected) return [];
    if (!search.trim()) return selected.items;
    return selected.items.filter((item) =>
      item.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [selected, search]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Enhanced Page Title */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
            Tu Progreso
          </span>
        </div>
        <h1 className={cx("text-3xl font-extrabold sm:text-4xl", isDark ? "text-white" : "text-brand-ink")}>
          Avance en <span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>módulos</span> y señas aprendidas
        </h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {/* Enhanced Modules Card */}
          <Card isDark={isDark}>
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
                  Módulos
                </span>
              </div>
              <div className={cx("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold", isDark ? "bg-brand-deep/50 text-brand-soft" : "bg-brand-cream/50 text-brand-muted")}>
                <span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>{completedSigns}</span>
                <span className="text-brand-muted">/</span>
                <span>{totalSigns}</span>
                <span className="ml-1">señas</span>
              </div>
            </div>
            
            <div className="space-y-4">
              {modulesWithProgress.map((module, index) => (
                <SkillNode
                  key={module.id}
                  module={module}
                  index={index}
                  isDark={isDark}
                  selected={selected?.id === module.id}
                  onClick={() => setSelected(module)}
                />
              ))}
            </div>
          </Card>
          
          {/* Enhanced Selected Module Card */}
          {selected && (
            <Card isDark={isDark}>
              <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className={cx("flex h-12 w-12 items-center justify-center rounded-2xl", isDark ? "bg-brand-orange/20 text-brand-orange" : "bg-brand-orange/20 text-brand-orange")}>
                    <Icon name={selected.icon || "book"} className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className={cx("text-lg font-bold", isDark ? "text-white" : "text-gray-900")}>{selected.title}</h3>
                    <p className={cx("text-xs", isDark ? "text-[#5A8A94]" : "text-gray-600")}>{selected.signs} señas · Nivel {selected.level}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Icon name="sparkles" className={cx("absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4", isDark ? "text-brand-soft" : "text-brand-muted")} />
                    <input
                      type="text"
                      placeholder="Buscar seña..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className={cx(
                        "pl-10 pr-4 py-2.5 rounded-xl text-sm w-48 sm:w-64 transition-all duration-200 focus:ring-2 focus:ring-brand-cyan/50",
                        isDark ? "bg-brand-deep text-white border border-brand-line placeholder:text-[#5A8A94]" : "bg-white text-brand-ink border border-gray-200 placeholder:text-[#8AA8B0]"
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {filteredItems.map((item, index) => (
                  <button
                    key={item.label}
                    className={cx(
                      "group flex flex-col items-center gap-3 rounded-2xl p-4 transition-all duration-300 hover:scale-105",
                      isDark 
                        ? "bg-brand-deep/40 hover:bg-brand-deep/60 border border-brand-line/30 hover:border-brand-cyan/50" 
                        : "bg-gray-100 hover:bg-gray-200 border border-gray-300 hover:border-brand-teal/50 shadow-sm"
                    )}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="relative h-20 w-20 overflow-hidden rounded-xl shadow-md">
                      <img 
                        src={item.thumbnail} 
                        alt={item.label} 
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" 
                        loading="lazy" 
                      />
                      <div className="absolute inset-0 bg-black/10" />
                      {/* Icon overlay */}
                      <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white/90 flex items-center justify-center shadow-sm">
                        <Icon name={getSignIcon(item.label)} className="h-3 w-3 text-gray-800" />
                      </div>
                    </div>
                    <span className={cx("text-xs font-semibold text-center leading-tight", isDark ? "text-brand-soft" : "text-gray-700")}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
        
        {/* Enhanced Sidebar */}
        <div className="space-y-6 lg:col-span-4">
          {/* Stats Card */}
          <Card isDark={isDark}>
            <div className="flex items-center gap-2 mb-6">
              <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
                Estadísticas
              </span>
            </div>
            
            <div className="space-y-6">
              {/* Overall Progress */}
              <div>
                <div className={cx("flex items-center justify-between mb-2", isDark ? "text-brand-soft" : "text-brand-muted")}>
                  <span className="text-xs font-medium">Progreso total</span>
                  <span className="text-xs font-bold">{progress}%</span>
                </div>
                <div className={cx("relative h-3 overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-[#E8EEEF]")}>
                  <div
                    className={cx(
                      "absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-out",
                      "bg-brand-teal"
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              {/* Streak */}
              {streakDays > 0 && (
                <div className={cx(
                  "flex items-center gap-4 rounded-2xl p-4 transition-all duration-300",
                  isDark ? "bg-brand-deep/50" : "bg-brand-cream/50"
                )}>
                  <div className={cx("flex h-12 w-12 items-center justify-center rounded-xl", isDark ? "bg-brand-orange/20 text-brand-orange" : "bg-brand-orange/20 text-brand-teal")}>
                    <Icon name="flame" className="h-6 w-6" />
                  </div>
                  <div>
                    <div className={cx("text-xs font-medium mb-1", isDark ? "text-brand-soft" : "text-brand-muted")}>Racha actual</div>
                    <div className={cx("text-2xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{streakDays} días</div>
                  </div>
                </div>
              )}
            </div>
          </Card>
          
          {/* Actions Card */}
          <Card isDark={isDark}>
            <div className="flex items-center gap-2 mb-6">
              <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
                Acciones
              </span>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => window.location.href = "/lesson"}
                className={cx(
                  "group btn-press w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-bold transition-all duration-200 active:scale-95",
                  isDark
                    ? "bg-brand-teal text-white hover:shadow-lg hover:shadow-brand-teal/20"
                    : "bg-brand-teal text-white hover:shadow-lg hover:shadow-brand-teal/20"
                )}
              >
                <Icon name="book" className="h-5 w-5 transition-transform group-hover:scale-110" />
                Comenzar Lección
              </button>
              <button
                onClick={() => window.location.href = "/practice"}
                className={cx(
                  "group btn-press w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-bold transition-all duration-200 active:scale-95",
                  isDark 
                    ? "bg-brand-deep text-brand-soft hover:bg-brand-card border border-brand-line" 
                    : "bg-white text-brand-muted hover:bg-brand-cream border border-gray-200"
                )}
              >
                <Icon name="camera" className="h-5 w-5 transition-transform group-hover:scale-110" />
                Ir a Práctica
              </button>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function SkillNode({ module, index, isDark, selected, onClick }) {
  const completed = module.status === "completed";
  const current = module.status === "current";
  const locked = module.status === "locked";
  
  return (
    <div className="relative">
      <button 
        onClick={onClick} 
        className={cx(
          "group btn-press relative flex w-full items-center gap-4 text-left transition-all duration-300",
          locked && "cursor-default opacity-50",
          !locked && "hover:scale-[1.01]"
        )}
        style={{ animationDelay: `${index * 50}ms` }}
        disabled={locked}
        aria-pressed={selected}
        aria-label={`${module.title} - ${module.desc} - ${locked ? 'Bloqueado' : completed ? 'Completado' : 'En progreso'}`}
        role="button"
      >
        {/* Module Icon with Status Overlay */}
        <div className="relative">
          <div className={cx(
            "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-all duration-300 sm:h-16 sm:w-16",
            isDark 
              ? "border-2 border-brand-line bg-brand-card text-brand-orange" 
              : "border-2 border-gray-300 bg-gray-100 text-brand-orange"
          )} aria-hidden="true">
            <Icon name={module.icon || "book"} className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          
          {/* Status Badge */}
          <div className={cx(
            "absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-300 sm:h-7 sm:w-7",
            isDark ? "border-brand-deep bg-brand-card" : "border-white bg-white",
            completed 
              ? "text-brand-teal" 
              : current 
                ? "text-brand-orange" 
                : "text-gray-400"
          )}>
            {completed ? (
              <Icon name="check" className="h-3 w-3 sm:h-4 sm:w-4" />
            ) : current ? (
              <Icon name="play" className="h-3 w-3 sm:h-4 sm:w-4" />
            ) : (
              <Icon name="lock" className="h-3 w-3 sm:h-3 sm:w-3" />
            )}
          </div>
        </div>
        
        {/* Content */}
        <div className={cx(
          "flex-1 rounded-2xl p-4 transition-all duration-300 sm:p-5",
          selected 
            ? (isDark 
                ? "border-2 border-brand-cyan/50 bg-brand-card shadow-md" 
                : "border-2 border-brand-teal/50 bg-white shadow-md") 
            : (isDark 
                ? "border border-brand-line/30 bg-brand-deep/30 hover:bg-brand-deep/50" 
                : "border border-gray-300 bg-gray-50 hover:bg-gray-100")
        )}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <span className={cx("block text-sm font-bold sm:text-base", isDark ? "text-white" : "text-gray-900")}>
                {module.title}
              </span>
              <span className={cx("block text-xs mt-1", isDark ? "text-[#5A8A94]" : "text-gray-600")}>
                {module.desc}
              </span>
            </div>
            
            {/* Progress indicator */}
            {module.signs_completed !== undefined && (
              <div className={cx(
                "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold",
                isDark ? "bg-brand-deep/50 text-brand-soft" : "bg-gray-100 text-gray-600"
              )} aria-label={`Progreso: ${module.signs_completed} de ${module.signs} señas`}>
                <span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>{module.signs_completed}</span>
                <span aria-hidden="true">/</span>
                <span>{module.signs}</span>
              </div>
            )}
          </div>
          
          {/* Mini progress bar */}
          {module.signs_completed !== undefined && (
            <div className="mt-3" role="progressbar" aria-valuenow={module.signs_completed} aria-valuemin={0} aria-valuemax={module.signs} aria-label={`Progreso del módulo: ${Math.round((module.signs_completed / module.signs) * 100)}%`}>
              <div className={cx("h-1.5 w-full overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-gray-200")}>
                <div 
                  className={cx(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    completed 
                      ? "bg-brand-teal" 
                      : current 
                        ? "bg-brand-orange" 
                        : "bg-gray-400"
                  )}
                  style={{ width: `${(module.signs_completed / module.signs) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Arrow indicator */}
        {!locked && (
          <div className={cx(
            "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100",
            isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal"
          )} aria-hidden="true">
            <Icon name="arrow" className="h-4 w-4" />
          </div>
        )}
      </button>
      
      {/* Connector line */}
      {index < modules.length - 1 && (
        <div className="flex justify-center py-3" aria-hidden="true">
          <div className={cx("h-8 w-px rounded-full sm:h-10", isDark ? "bg-brand-line/50" : "bg-gray-300")} />
        </div>
      )}
    </div>
  );
}

function ModuleDetail({ module, isDark, items, search, onSearch, onSelect }) {
  if (!module) return null;
  return (
    <Card isDark={isDark}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange"><Icon name="book" /></span>
        <div className="flex-1 min-w-0">
          <h3 className={cx("text-base font-bold truncate", isDark ? "text-white" : "text-brand-ink")}>{module.title}</h3>
          <p className={cx("text-xs", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{module.signs} señas · Nivel {module.level}</p>
        </div>
        <span className={cx("rounded-full px-2 py-1 text-[10px] font-bold", isDark ? "bg-brand-teal/20 text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}>{items.length}</span>
      </div>
      <input
        value={search} onChange={(e) => onSearch(e.target.value)}
        placeholder="Buscar seña..."
        className={cx("mb-4 w-full rounded-lg border px-3 py-2 text-sm", isDark ? "border-brand-line bg-brand-deep text-white placeholder:text-[#5A8A94]" : "border-brand-mist bg-brand-cream text-brand-ink placeholder:text-[#8AA8B0]")}
      />
      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto sm:max-h-72 sm:grid-cols-3">
        {items.map((item) => (
          <button
            key={item.label} 
            onClick={() => onSelect(item)}
            className={cx("btn-press group flex flex-col items-center gap-2 rounded-xl border p-2 sm:p-3 text-center transition",
              isDark ? "border-brand-line bg-brand-deep/40 hover:border-brand-cyan/40 hover:bg-brand-card" : "border-brand-mist bg-brand-cream hover:border-brand-teal/30 hover:bg-white hover:shadow-sm"
            )}
          >
            <div className="relative">
              <img src={item.thumbnail} alt={item.label} className="h-12 w-full rounded-lg object-cover sm:h-14" loading="lazy" />
              {/* Icon overlay */}
              <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white/90 flex items-center justify-center shadow-sm">
                <Icon name={getSignIcon(item.label)} className="h-2.5 w-2.5 text-gray-800" />
              </div>
            </div>
            <span className={cx("text-[10px] font-semibold leading-tight sm:text-[11px]", isDark ? "text-brand-soft" : "text-gray-600")}>{item.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function LessonPage({ isDark, navigate }) {
  const { userProgress, moduleProgress } = useAuth();
  const [selected, setSelected] = useState(modules[0]);
  const [activeSign, setActiveSign] = useState(null);
  const [search, setSearch] = useState("");

  // Auto-advance to next sign in current module
  const handleNextSign = () => {
    if (!selected || !activeSign) return;
    const currentIndex = selected.items.findIndex(item => item.label === activeSign.label);
    if (currentIndex !== -1 && currentIndex < selected.items.length - 1) {
      setActiveSign(selected.items[currentIndex + 1]);
    }
  };

  // Merge module data with progress from database
  const modulesWithProgress = useMemo(() => {
    return modules.map((module, index) => {
      const progressData = moduleProgress?.find(mp => mp.module_id === module.id);
      const signsCompleted = progressData?.signs_completed || 0;
      const isCompleted = signsCompleted >= module.signs;
      
      let status = 'locked';
      if (index === 0) {
        status = isCompleted ? 'completed' : 'current';
      } else {
        const prevModule = modules[index - 1];
        const prevProgressData = moduleProgress?.find(mp => mp.module_id === prevModule.id);
        const prevCompleted = (prevProgressData?.signs_completed || 0) >= prevModule.signs;
        
        if (prevCompleted) {
          status = isCompleted ? 'completed' : 'current';
        } else {
          status = 'locked';
        }
      }
      
      return {
        ...module,
        status: progressData?.status || status,
        signs_completed: signsCompleted,
      };
    });
  }, [moduleProgress]);

  const filteredItems = useMemo(() => {
    if (!selected) return [];
    if (!search.trim()) return selected.items;
    return selected.items.filter((item) =>
      item.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [selected, search]);

  return (
    <div className={cx("min-h-screen transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
      <AppHeader isDark={isDark} setIsDark={() => {}} navigate={navigate} path="/lesson" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Enhanced Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate("/learn")}
            className={cx(
              "btn-press group flex items-center gap-2 text-sm font-medium transition-all duration-200",
              isDark ? "text-brand-soft hover:text-white" : "text-brand-muted hover:text-brand-ink"
            )}
          >
            <Icon name="arrow" className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-1" />
            Volver a Progreso
          </button>
          
          <div className="mt-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
                  Lecciones
                </span>
              </div>
              <h1 className={cx("text-3xl font-extrabold sm:text-4xl", isDark ? "text-white" : "text-brand-ink")}>
                Explora y <span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>aprende</span>
              </h1>
            </div>
            <div className="w-20" />
          </div>
        </div>

        {!activeSign ? (
          <div className="grid gap-8 lg:grid-cols-12">
            {/* Enhanced Module List */}
            <section className="space-y-4 lg:col-span-4">
              <div className={cx(
                "rounded-3xl border p-6 backdrop-blur-xl",
                isDark ? "border-brand-line/30 bg-brand-card/50" : "border-brand-mist/30 bg-white/50"
              )}>
                <div className="flex items-center gap-2 mb-4">
                  <span className={cx("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>
                    Módulos
                  </span>
                </div>
                
                <div className="space-y-3 max-h-[60vh] lg:max-h-[80vh] overflow-y-auto pr-2">
                  {modulesWithProgress.map((module, index) => (
                    <SkillNode
                      key={module.id} 
                      module={module} 
                      index={index} 
                      isDark={isDark}
                      selected={selected?.id === module.id}
                      onClick={() => { setSelected(module); setSearch(""); }}
                    />
                  ))}
                </div>
              </div>
            </section>
            
            {/* Enhanced Sign Grid */}
            <section className="space-y-6 lg:col-span-8">
              {selected && (
                <Card isDark={isDark}>
                  <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <div className={cx("flex h-14 w-14 items-center justify-center rounded-2xl", isDark ? "bg-brand-orange/20 text-brand-orange" : "bg-brand-orange/20 text-brand-orange")}>
                        <Icon name={selected.icon || "book"} className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className={cx("text-xl font-bold", isDark ? "text-white" : "text-gray-900")}>{selected.title}</h3>
                        <p className={cx("text-sm", isDark ? "text-[#5A8A94]" : "text-gray-600")}>{selected.signs} señas · Nivel {selected.level}</p>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <Icon name="sparkles" className={cx("absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4", isDark ? "text-brand-soft" : "text-brand-muted")} />
                      <input
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar seña..."
                        className={cx(
                          "pl-11 pr-4 py-3 rounded-xl text-sm w-48 sm:w-64 transition-all duration-200 focus:ring-2 focus:ring-brand-cyan/50",
                          isDark ? "bg-brand-deep text-white border border-brand-line placeholder:text-[#5A8A94]" : "bg-white text-brand-ink border border-gray-200 placeholder:text-[#8AA8B0]"
                        )}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 max-h-96 overflow-y-auto pr-2">
                    {filteredItems.map((item, index) => (
                      <button
                        key={item.label} 
                        onClick={() => setActiveSign(item)}
                        className={cx(
                          "btn-press group flex flex-col items-center gap-3 rounded-2xl p-4 text-center transition-all duration-300 hover:scale-105",
                          isDark 
                            ? "bg-brand-deep/40 hover:bg-brand-deep/60 border border-brand-line/30 hover:border-brand-cyan/50" 
                            : "bg-gray-100 hover:bg-gray-200 border border-gray-300 hover:border-brand-teal/50 shadow-sm"
                        )}
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        <div className="relative h-24 w-full overflow-hidden rounded-xl shadow-md">
                          <img 
                            src={item.thumbnail} 
                            alt={item.label} 
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" 
                            loading="lazy" 
                          />
                          <div className="absolute inset-0 bg-black/10" />
                          {/* Icon overlay */}
                          <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white/90 flex items-center justify-center shadow-sm">
                            <Icon name={getSignIcon(item.label)} className="h-3 w-3 text-gray-800" />
                          </div>
                        </div>
                        <span className={cx("text-xs font-semibold leading-tight", isDark ? "text-brand-soft" : "text-gray-700")}>
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </section>
          </div>
        ) : (
          <LessonView
            sign={activeSign}
            isDark={isDark}
            onClose={() => setActiveSign(null)}
            moduleId={selected.id}
            onNextSign={handleNextSign}
          />
        )}
      </main>
    </div>
  );
}

function SignVideoPanel({ sign, isDark, onClose, moduleId }) {
  const { user } = useAuth();
  const [viewRecorded, setViewRecorded] = useState(false);

  useEffect(() => {
    if (!viewRecorded && user && sign) {
      recordVideoView(user.id, sign.label || sign.name, moduleId, sign.lessonId || moduleId);
      setViewRecorded(true);
    }
  }, [user, sign, moduleId, viewRecorded]);

  return (
    <Card isDark={isDark}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className={cx("text-lg font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{sign.label}</h3>
          <p className={cx("text-xs", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{sign.hint || sign.desc}</p>
        </div>
        <button onClick={onClose} className={cx("btn-press rounded-lg p-2", isDark ? "bg-brand-deep text-brand-soft hover:text-white" : "bg-brand-cream text-brand-muted hover:text-brand-ink")}>
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="overflow-hidden rounded-xl" style={{ paddingBottom: "56.25%", position: "relative" }}>
        <iframe
          src={sign.video_ref}
          title={sign.label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full rounded-xl border-0"
        />
      </div>
    </Card>
  );
}

function LessonView({ sign, isDark, onClose, moduleId, onNextSign }) {
  const { user } = useAuth();
  const [viewRecorded, setViewRecorded] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [gestureState, setGestureState] = useState("waiting");
  const [matchScore, setMatchScore] = useState(0);
  const [practiceSuccess, setPracticeSuccess] = useState(false);
  const holdStartRef = useRef(null);
  const HOLD_MS = 600;

  // Extract YouTube video ID from URL
  const getYouTubeVideoId = (url) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url?.match(regex);
    return match ? match[1] : null;
  };

  const videoId = getYouTubeVideoId(sign?.video_ref || sign?.video_ref);

  // Record video view once on open
  useEffect(() => {
    if (!viewRecorded && user && sign) {
      recordVideoView(user.id, sign.label || sign.name, moduleId, sign.lessonId || moduleId);
      setViewRecorded(true);
    }
  }, [user, sign, moduleId, viewRecorded]);

  // Simplified practice handler for lesson view
  const handlePracticeResults = useCallback(({ handRes }) => {
    const lms = handRes?.landmarks?.[0] ?? null;
    setHandDetected(!!lms);

    if (!lms || practiceSuccess) {
      holdStartRef.current = null;
      if (!practiceSuccess) setGestureState("waiting");
      setMatchScore(0);
      return;
    }

    const states = fingerStates(lms);
    const sc = sign.template
      ? scoreTarget(states, sign.label || sign.name, sign.template)
      : 0;

    setMatchScore(sc);

    if (sc >= MATCH_THR) {
      if (!holdStartRef.current) holdStartRef.current = performance.now();
      const held = performance.now() - holdStartRef.current;
      const pct = Math.min(1, held / HOLD_MS);
      setGestureState(pct >= 1 ? "match" : "partial");

      if (held >= HOLD_MS) {
        setPracticeSuccess(true);
        setGestureState("confirmed");
        
        // Save progress
        if (user) {
          updateSignProgress(user.id, sign.label || sign.name, moduleId, sc, 0);
          updateStreak(user.id);
        }
        
        setTimeout(() => {
          setPracticeSuccess(false);
          holdStartRef.current = null;
          setGestureState("waiting");
          setMatchScore(0);
          // Auto-advance to next sign
          if (onNextSign) onNextSign();
        }, 800);
      }
    } else {
      holdStartRef.current = null;
      setGestureState(sc > 0.45 ? "partial" : "waiting");
    }
  }, [sign, user, moduleId, practiceSuccess]);

  const { videoRef, canvasRef, camReady, camError } = useSimpleCamera({ 
    onResults: handlePracticeResults 
  });

  if (!sign || !videoId) return null;

  // Use autoplay with mute to prevent freezing, loop enabled for continuous playback
  // Added showinfo=0 and iv_load_policy=3 to minimize YouTube title/annotations
  const iframeSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          className={cx("btn-press flex items-center gap-2 text-sm font-medium", isDark ? "text-brand-soft hover:text-white" : "text-brand-muted hover:text-brand-ink")}
        >
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Volver a lecciones
        </button>
        <div className="text-center">
          <h2 className={cx("text-xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>
            {sign.label || sign.name}
          </h2>
          <p className={cx("text-sm", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>
            {sign.hint || sign.desc}
          </p>
        </div>
        <div className="w-24" />
      </div>

      {/* Split view: Video on left (larger), Camera on right (smaller) */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl p-4 sm:grid-cols-3">
        {/* YouTube Video - 2 columns wide */}
        <div className="relative overflow-hidden rounded-2xl bg-black sm:col-span-2" style={{ paddingBottom: "56.25%" }}>
          <iframe
            key={videoId}
            src={iframeSrc}
            title={sign.label || sign.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
          {/* Success animation overlay */}
          {practiceSuccess && (
            <div className="absolute inset-0 flex items-center justify-center bg-brand-teal/90 animate-fade-in">
              <div className="text-center animate-success-bounce">
                <div className="text-7xl mb-4">✓</div>
                <div className="text-3xl font-bold text-white">¡Excelente!</div>
                <div className="text-base text-white/90 mt-2">Seña aprendida</div>
              </div>
            </div>
          )}
        </div>
        
        {/* Camera with hand detection - 1 column wide */}
        <div className="relative overflow-hidden rounded-2xl bg-black" style={{ paddingBottom: "56.25%", position: "relative" }}>
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            muted
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {!camReady && !camError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-sm font-semibold text-white">
                Iniciando cámara...
              </div>
            </div>
          )}
          {camError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center">
                <div className="text-sm font-semibold text-red-400">{camError}</div>
              </div>
            </div>
          )}
          {camReady && (
            <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
              <div className={cx("rounded-lg px-3 py-2 text-sm font-bold transition-all duration-300 transform",
                gestureState === "confirmed" ? "bg-brand-teal text-white scale-110 shadow-lg shadow-brand-teal/30" :
                gestureState === "match" ? "bg-brand-teal/80 text-white scale-105" :
                gestureState === "partial" ? "bg-brand-orange/60 text-white scale-105" :
                "bg-brand-deep/80 text-brand-soft"
              )}>
                {gestureState === "confirmed" ? "✓ Correcto" :
                 gestureState === "match" ? "Mantén la pose..." :
                 gestureState === "partial" ? "Casi..." :
                 handDetected ? "Detectando..." : "Muestra tu mano"}
              </div>
              {sign.template && (
                <div className={cx("rounded-lg px-3 py-2 text-sm font-bold transition-all duration-300", isDark ? "bg-brand-deep/80 text-brand-cyan" : "bg-white/80 text-brand-teal")}>
                  Precisión: {Math.round(matchScore * 100)}%
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignVideoModal({ sign, isDark, onClose, moduleId, onNextSign }) {
  const { user } = useAuth();
  const [viewRecorded, setViewRecorded] = useState(false);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousActiveElementRef = useRef(null);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [handDetected, setHandDetected] = useState(false);
  const [gestureState, setGestureState] = useState("waiting");
  const [matchScore, setMatchScore] = useState(0);
  const [practiceSuccess, setPracticeSuccess] = useState(false);
  const holdStartRef = useRef(null);
  const HOLD_MS = 600;

  // Extract YouTube video ID from URL
  const getYouTubeVideoId = (url) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url?.match(regex);
    return match ? match[1] : null;
  };

  const videoId = getYouTubeVideoId(sign?.video_ref || sign?.video_ref);

  // Record video view once on open
  useEffect(() => {
    if (!viewRecorded && user && sign) {
      recordVideoView(user.id, sign.label || sign.name, moduleId, sign.lessonId || moduleId);
      setViewRecorded(true);
    }
  }, [user, sign, moduleId, viewRecorded]);

  // Block body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Focus management: capture previous active element and focus close button
  useEffect(() => {
    previousActiveElementRef.current = document.activeElement;
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
    return () => {
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    };
  }, []);

  // Focus trap within modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Simplified practice handler for modal
  const handlePracticeResults = useCallback(({ handRes }) => {
    const lms = handRes?.landmarks?.[0] ?? null;
    setHandDetected(!!lms);

    if (!lms || practiceSuccess) {
      holdStartRef.current = null;
      if (!practiceSuccess) setGestureState("waiting");
      setMatchScore(0);
      return;
    }

    const states = fingerStates(lms);
    const sc = sign.template
      ? scoreTarget(states, sign.label || sign.name, sign.template)
      : 0;

    setMatchScore(sc);

    if (sc >= MATCH_THR) {
      if (!holdStartRef.current) holdStartRef.current = performance.now();
      const held = performance.now() - holdStartRef.current;
      const pct = Math.min(1, held / HOLD_MS);
      setGestureState(pct >= 1 ? "match" : "partial");

      if (held >= HOLD_MS) {
        setPracticeSuccess(true);
        setGestureState("confirmed");
        
        // Save progress
        if (user) {
          updateSignProgress(user.id, sign.label || sign.name, moduleId, sc, 0);
          updateStreak(user.id);
        }
        
        setTimeout(() => {
          setPracticeSuccess(false);
          holdStartRef.current = null;
          setGestureState("waiting");
          setMatchScore(0);
          // Auto-advance to next sign
          if (onNextSign) onNextSign();
        }, 800);
      }
    } else {
      holdStartRef.current = null;
      setGestureState(sc > 0.45 ? "partial" : "waiting");
    }
  }, [sign, user, moduleId, practiceSuccess]);

  const { videoRef, canvasRef, camReady, camError } = useSimpleCamera({ 
    onResults: handlePracticeResults 
  });

  if (!sign || !videoId) return null;

  // Use autoplay with mute to prevent freezing, loop enabled for continuous playback
  // Added showinfo=0 and iv_load_policy=3 to minimize YouTube title/annotations
  const iframeSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Video de seña: ${sign.label || sign.name}`}
      className={cx(
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50",
        prefersReducedMotion ? "" : "animate-fade"
      )}
      onClick={handleOverlayClick}
    >
      <div
        className={cx(
          "relative w-full max-w-7xl rounded-2xl shadow-2xl",
          isDark ? "bg-brand-card border border-brand-line" : "bg-white border border-gray-200"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between p-4 sm:p-6">
          <div>
            <h3 className={cx("text-lg font-extrabold sm:text-xl", isDark ? "text-white" : "text-brand-ink")}>
              {sign.label || sign.name}
            </h3>
            <p className={cx("text-xs sm:text-sm", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>
              {sign.hint || sign.desc}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className={cx(
              "btn-press rounded-lg p-2 transition",
              isDark ? "bg-brand-deep text-brand-soft hover:text-white" : "bg-brand-cream text-brand-muted hover:text-brand-ink"
            )}
            aria-label="Cerrar video"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        
        {/* Split view: Video on left (larger), Camera on right */}
        <div className="grid grid-cols-1 gap-4 rounded-b-2xl p-4 sm:grid-cols-3">
          {/* YouTube Video - 2 columns wide */}
          <div className="relative overflow-hidden rounded-2xl bg-black sm:col-span-2" style={{ paddingBottom: "56.25%" }}>
            <iframe
              key={videoId}
              src={iframeSrc}
              title={sign.label || sign.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
            {/* Success animation overlay */}
            {practiceSuccess && (
              <div className="absolute inset-0 flex items-center justify-center bg-brand-teal/90 animate-fade-in">
                <div className="text-center animate-success-bounce">
                  <div className="text-7xl mb-4">✓</div>
                  <div className="text-3xl font-bold text-white">¡Excelente!</div>
                  <div className="text-base text-white/90 mt-2">Seña aprendida</div>
                </div>
              </div>
            )}
          </div>
          
          {/* Camera with hand detection - 1 column */}
          <div className="relative overflow-hidden rounded-2xl bg-black" style={{ paddingBottom: "56.25%", position: "relative" }}>
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              muted
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {!camReady && !camError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-sm font-semibold text-white">
                  Iniciando cámara...
                </div>
              </div>
            )}
            {camError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center">
                  <div className="text-sm font-semibold text-red-400">{camError}</div>
                </div>
              </div>
            )}
            {camReady && (
              <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
                <div className={cx("rounded-lg px-3 py-2 text-sm font-bold transition-all duration-300 transform",
                  gestureState === "confirmed" ? "bg-brand-teal text-white scale-110 shadow-lg shadow-brand-teal/30" :
                  gestureState === "match" ? "bg-brand-teal/80 text-white scale-105" :
                  gestureState === "partial" ? "bg-brand-orange/60 text-white scale-105" :
                  "bg-brand-deep/80 text-brand-soft"
                )}>
                  {gestureState === "confirmed" ? "✓ Correcto" :
                   gestureState === "match" ? "Mantén la pose..." :
                   gestureState === "partial" ? "Casi..." :
                   handDetected ? "Detectando..." : "Muestra tu mano"}
                </div>
                {sign.template && (
                  <div className={cx("rounded-lg px-3 py-2 text-sm font-bold transition-all duration-300", isDark ? "bg-brand-deep/80 text-brand-cyan" : "bg-white/80 text-brand-teal")}>
                    Precisión: {Math.round(matchScore * 100)}%
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Puntos faciales clave para expresión LSM (cejas, boca, ojos)
const FACE_KEY_IDXS = [
  70, 63, 105, 66, 107,          // ceja izq
  336, 296, 334, 293, 300,       // ceja der
  13, 14, 78, 308, 61, 291,      // boca
  159, 145, 386, 374,            // ojos
];

function mirror(lm) { return { ...lm, x: 1 - lm.x }; }

// Simplified camera hook for modal - only hands, faster startup, better FPS
function useSimpleCamera({ onResults }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const hlRef        = useRef(null);
  const rafRef       = useRef(null);
  const streamRef    = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Start camera first for faster feedback
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" }, // Lower resolution for better performance
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCamReady(true);

        // Load hand model after camera is ready
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        const hl = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2, // Detect both hands
          minHandDetectionConfidence: 0.5, // Lower confidence for better detection
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (cancelled) { hl.close(); stream.getTracks().forEach((t) => t.stop()); return; }
        hlRef.current = hl;

        function detect() {
          if (cancelled) return;
          const canvas = canvasRef.current;
          const vid = videoRef.current;
          if (!canvas || !vid || vid.readyState < 2) {
            rafRef.current = requestAnimationFrame(detect);
            return;
          }

          const w = vid.videoWidth || 320;
          const h = vid.videoHeight || 240;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          const now = performance.now();

          // Video espejado
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-w, 0);
          ctx.drawImage(vid, 0, 0, w, h);
          ctx.restore();

          const draw = new DrawingUtils(ctx);

          // Only detect hands
          const handRes = hlRef.current.detectForVideo(vid, now);
          for (const lms of (handRes.landmarks || [])) {
            const m = lms.map(mirror);
            draw.drawConnectors(m, HandLandmarker.HAND_CONNECTIONS, { color: "#2AABB8", lineWidth: 2 });
            draw.drawLandmarks(m, { color: "#EC9960", lineWidth: 1, radius: 3 });
          }

          if (onResults) onResults({ handRes });
          rafRef.current = requestAnimationFrame(detect);
        }
        rafRef.current = requestAnimationFrame(detect);

      } catch (err) {
        if (!cancelled) setCamError("Error de cámara: " + err.message);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      hlRef.current?.close();
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [onResults]);

  return { videoRef, canvasRef, camReady, camError };
}

// Full camera hook for PracticePage - hands, pose, face
function useCameraMediaPipe({ onResults }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const hlRef        = useRef(null);
  const plRef        = useRef(null);
  const flRef        = useRef(null);
  const rafRef       = useRef(null);
  const slowFrameRef = useRef(-1);
  const lastPoseRef  = useRef({ landmarks: [] });
  const lastFaceRef  = useRef({ landmarks: [] });
  const streamRef    = useRef(null); // Store stream reference for cleanup
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
        if (cancelled) return;

        // Crear los 3 landmarkers en paralelo
        const [hl, pl, fl] = await Promise.all([
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
        ]);
        if (cancelled) { hl.close(); pl.close(); fl.close(); return; }
        hlRef.current = hl;
        plRef.current = pl;
        flRef.current = fl;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        
        streamRef.current = stream; // Store stream reference

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCamReady(true);

        function detect() {
          if (cancelled) return;
          const canvas = canvasRef.current;
          const vid = videoRef.current;
          if (!canvas || !vid || vid.readyState < 2) {
            rafRef.current = requestAnimationFrame(detect);
            return;
          }

          const w = vid.videoWidth || 640;
          const h = vid.videoHeight || 480;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          const now = performance.now();

          // Video espejado
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-w, 0);
          ctx.drawImage(vid, 0, 0, w, h);
          ctx.restore();

          const draw = new DrawingUtils(ctx);

          // --- Manos cada frame (alta prioridad) ---
          const handRes = hlRef.current.detectForVideo(vid, now);
          for (const lms of (handRes.landmarks || [])) {
            const m = lms.map(mirror);
            draw.drawConnectors(m, HandLandmarker.HAND_CONNECTIONS, { color: "#2AABB8", lineWidth: 2 });
            draw.drawLandmarks(m, { color: "#EC9960", lineWidth: 1, radius: 3 });
          }

          // --- Pose y cara a 8 fps (throttle) para no bloquear el hilo ---
          const slowFrame = Math.floor(now / 125); // cambia cada 125ms = 8fps
          if (slowFrame !== slowFrameRef.current) {
            slowFrameRef.current = slowFrame;

            const poseRes = plRef.current.detectForVideo(vid, now);
            lastPoseRef.current = poseRes;
            for (const lms of (poseRes.landmarks || [])) {
              const m = lms.map(mirror);
              const armConns = PoseLandmarker.POSE_CONNECTIONS.filter(
                ({ start, end }) => [11,12,13,14,15,16].includes(start) && [11,12,13,14,15,16].includes(end)
              );
              draw.drawConnectors(m, armConns, { color: "#A855F7", lineWidth: 3 });
              [11,12,13,14,15,16].forEach((i) => {
                if (m[i]) draw.drawLandmarks([m[i]], { color: "#D946EF", lineWidth: 1, radius: 5 });
              });
            }

            const faceRes = flRef.current.detectForVideo(vid, now);
            lastFaceRef.current = faceRes;
            for (const lms of (faceRes.landmarks || [])) {
              const m = lms.map(mirror);
              const keyPts = FACE_KEY_IDXS.filter((i) => m[i]).map((i) => m[i]);
              draw.drawLandmarks(keyPts, { color: "#22D3EE", lineWidth: 1, radius: 2 });
            }
          }

          if (onResults) onResults({ handRes, poseRes: lastPoseRef.current, faceRes: lastFaceRef.current });
          rafRef.current = requestAnimationFrame(detect);
        }
        rafRef.current = requestAnimationFrame(detect);

      } catch (err) {
        if (!cancelled) setCamError("Error de cámara: " + err.message);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      hlRef.current?.close();
      plRef.current?.close();
      flRef.current?.close();
      
      // Ensure camera is completely stopped
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return { videoRef, canvasRef, camReady, camError };
}

function PracticePage({ isDark, setIsDark, navigate }) {
  const { user, userProgress } = useAuth();
  const [signIdx, setSignIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [handDetected, setHandDetected] = useState(false);
  const [toasts, setToasts] = useState([{ id: 1, type: "info", message: 'Muestra la seña correcta con tu mano' }]);
  const idRef = useRef(2);
  const [gestureState, setGestureState] = useState("waiting"); // waiting | partial | match | confirmed
  const [matchScore, setMatchScore]     = useState(0);
  const [confirmedSignName, setConfirmedSignName] = useState(null);
  const confirmedRef = useRef(false);
  const holdStartRef = useRef(null);   // momentáneo que lleva la mano en MATCH
  const HOLD_MS = 600;                 // ms que debe mantener la pose correcta
  const practiceStartTime = useRef(Date.now());
  const streamRef = useRef(null); // Store the media stream for cleanup

  const addToast = (type, message) => setToasts((prev) => [{ id: idRef.current++, type, message }]); // Solo mantener el toast más reciente

  // Cleanup camera when component unmounts or route changes
  useEffect(() => {
    return () => {
      // Stop all media streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Also stop any video elements
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach(video => {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(track => track.stop());
          video.srcObject = null;
        }
      });
    };
  }, []);

  const handleResults = useCallback(({ handRes }) => {
    const lms = handRes?.landmarks?.[0] ?? null;
    setHandDetected(!!lms);

    if (!lms) {
      holdStartRef.current = null;
      if (!confirmedRef.current) setGestureState("waiting");
      setMatchScore(0);
      return;
    }

    if (confirmedRef.current) return;

    setSignIdx((prevIdx) => {
      const sign = signsQueue[prevIdx];
      const states = fingerStates(lms);
      const sc = sign.template
        ? scoreTarget(states, sign.name, sign.template)
        : 0;  // señas sin template (palabras) siempre pasan con botón

      setMatchScore(sc);

      if (sc >= MATCH_THR) {
        if (!holdStartRef.current) holdStartRef.current = performance.now();
        const held = performance.now() - holdStartRef.current;
        const pct  = Math.min(1, held / HOLD_MS);
        setGestureState(pct >= 1 ? "match" : "partial");

        if (held >= HOLD_MS) {
          confirmedRef.current = true;
          setGestureState("confirmed");
          setConfirmedSignName(sign.name); // Guardar el nombre de la seña detectada
          setCorrect((v) => v + 1);
          setTotal((v) => v + 1);
          const next = Math.min(prevIdx + 1, signsQueue.length - 1);
          addToast("success", `✓ ${sign.name}  →  ${signsQueue[next].name}`);
          
          // Save progress to database
          if (user) {
            const timeSpent = Math.floor((Date.now() - practiceStartTime.current) / 1000);
            updateSignProgress(user.id, sign.name, sign.module || 'practice', sc, timeSpent);
            updateStreak(user.id);
            practiceStartTime.current = Date.now();
          }
          
          setTimeout(() => {
            confirmedRef.current = false;
            holdStartRef.current = null;
            setGestureState("waiting");
            setMatchScore(0);
            setConfirmedSignName(null); // Limpiar el nombre confirmado
          }, 800);
          return next;
        }
      } else {
        holdStartRef.current = null;
        setGestureState(sc > 0.45 ? "partial" : "waiting");
      }
      return prevIdx;
    });
  }, []);

  const { videoRef, canvasRef, camReady, camError } = useCameraMediaPipe({ onResults: handleResults });

  const skipSign = () => {
    confirmedRef.current = false;
    holdStartRef.current = null;
    setGestureState("waiting");
    setMatchScore(0);
    setTotal((v) => v + 1);
    setSignIdx((v) => Math.min(v + 1, signsQueue.length - 1));
    addToast("info", `Saltada → ${signsQueue[Math.min(signIdx + 1, signsQueue.length - 1)].name}`);
  };

  const stopCamera = () => {
    // Stop all media streams
    const videoElements = document.querySelectorAll('video');
    videoElements.forEach(video => {
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }
    });
    addToast("info", "Cámara detenida");
  };

  return (
    <div className={cx("flex h-screen flex-col transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
      <header className={cx("flex items-center justify-between border-b px-4 py-2 sm:px-6 sm:py-3 backdrop-blur-xl", isDark ? "border-brand-line bg-brand-deep/90" : "border-brand-mist bg-brand-cream/90")}>
        <div className="flex items-center gap-2 sm:gap-3">
          <Logo isDark={isDark} compact />
          <div className={cx("hidden h-5 w-px sm:block", isDark ? "bg-brand-line" : "bg-brand-mist")} />
          <span className={cx("hidden text-xs font-semibold sm:block", isDark ? "text-brand-soft" : "text-brand-muted")}>Práctica</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className={cx("rounded-xl px-2 py-1.5 text-xs font-bold sm:px-3", isDark ? "bg-brand-card text-brand-cyan" : "bg-white text-brand-teal shadow-sm")}>{correct}/{total}</span>
          <button 
            onClick={stopCamera}
            className={cx("rounded-xl px-2 py-1.5 text-xs font-bold transition sm:px-3", isDark ? "bg-brand-card text-brand-orange hover:bg-brand-orange/20" : "bg-white text-brand-orange hover:bg-brand-orange/10 shadow-sm")}
          >
            <span className="hidden sm:inline">Detener Cámara</span>
            <span className="sm:hidden">Detener</span>
          </button>
          <ThemeToggle isDark={isDark} setIsDark={setIsDark} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative flex-1 p-2 sm:p-4">
          <div className="relative h-full overflow-hidden rounded-xl bg-black">
            {/* Video oculto — solo usado como fuente para MediaPipe */}
            <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted />
            {/* Canvas con video espejado + landmarks */}
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />

            {!camReady && !camError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
                <p className={cx("text-sm font-semibold text-center", isDark ? "text-brand-soft" : "text-white")}>Iniciando cámara…</p>
              </div>
            )}
            {camError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 sm:p-8 text-center">
                <Icon name="camera" className="h-10 w-10 sm:h-12 sm:w-12 text-[#D96B6B]" />
                <p className="text-sm font-semibold text-white">{camError}</p>
                <p className="text-xs text-[#8AA8B0]">Permite el acceso a la cámara en tu navegador y recarga la página.</p>
              </div>
            )}

            {/* Indicador de detección geométrica - ocultar cuando se confirma la seña */}
            {camReady && gestureState !== "confirmed" && (
              <div className="absolute left-2 top-2 sm:left-4 sm:top-4 flex flex-col gap-1.5 transition-opacity duration-300">
                <div className={cx(
                  "flex items-center gap-2 rounded-full px-2 py-1.5 text-[10px] font-bold backdrop-blur-sm transition-all sm:px-3 sm:text-[11px]",
                  gestureState === "confirmed" ? "bg-[#1A6B4A]/90 text-[#D4F5E4]" :
                  gestureState === "match"     ? "bg-green-600/90 text-white" :
                  gestureState === "partial"   ? "bg-brand-orange/90 text-white" :
                  handDetected                 ? "bg-black/60 text-[#2AABB8]" :
                                                "bg-black/50 text-[#8AA8B0]"
                )}>
                  <span className={cx("h-2 w-2 rounded-full",
                    gestureState === "confirmed" ? "bg-green-400 animate-pulse" :
                    gestureState === "match"     ? "bg-green-300 animate-pulse" :
                    gestureState === "partial"   ? "bg-yellow-300 animate-pulse" :
                    handDetected                 ? "bg-[#2AABB8]" : "bg-gray-500"
                  )} />
                  {gestureState === "confirmed" ? "✓ ¡Correcto!" :
                   gestureState === "match"     ? "✓ Mantén la pose…" :
                   gestureState === "partial"   ? `Cerca: ${Math.round(matchScore*100)}%` :
                   handDetected                 ? "Mano detectada" : "Sin mano"}
                </div>
                {/* Barra de progreso del score */}
                {handDetected && gestureState !== "confirmed" && (
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/40 sm:w-32">
                    <div
                      className={cx("h-full rounded-full transition-all duration-150",
                        matchScore >= MATCH_THR ? "bg-green-400" :
                        matchScore > 0.45 ? "bg-brand-orange" : "bg-[#2AABB8]/60"
                      )}
                      style={{ width: `${Math.round(matchScore*100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Esquinas decorativas */}
            <div className="absolute inset-8 pointer-events-none">
              {["top-0 left-0 border-l-2 border-t-2", "top-0 right-0 border-r-2 border-t-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map((pos) => (
                <div key={pos} className={cx("absolute h-8 w-8 rounded-lg", pos, handDetected ? "border-green-400/60" : "border-brand-cyan/40")} />
              ))}
            </div>

            {/* Indicador de éxito cuando se confirma la seña */}
            {gestureState === "confirmed" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity duration-300">
                <div className="flex flex-col items-center gap-4 animate-fade">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-500/20 shadow-2xl sm:h-32 sm:w-32">
                    <Icon name="check" className="h-12 w-12 text-green-400 sm:h-16 sm:w-16" />
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-extrabold text-white sm:text-3xl">¡Excelente!</div>
                    <div className="mt-2 text-sm text-green-300">{confirmedSignName || signsQueue[signIdx].name} detectada</div>
                  </div>
                </div>
              </div>
            )}

            {/* Seña actual - ocultar cuando se confirma la seña */}
            {gestureState !== "confirmed" && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-white/20 bg-black/60 px-4 py-2.5 text-center shadow-lg backdrop-blur-md max-w-xs w-full sm:bottom-6 sm:px-5 sm:py-3 transition-opacity duration-300">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#8AA8B0] sm:text-[10px]">{signsQueue[signIdx].module} · {signsQueue[signIdx].difficulty}{signsQueue[signIdx].mov ? " · 🤸 con movimiento" : ""}</div>
                <div className="text-xl font-extrabold text-white sm:text-2xl">{signsQueue[signIdx].name}</div>
                {signsQueue[signIdx].hint && (
                  <div className="mt-1 text-[10px] text-[#8AA8B0] leading-tight sm:text-[11px]">{signsQueue[signIdx].hint}</div>
                )}
              </div>
            )}

            {/* Toasts - reposicionados a la esquina superior derecha, más pequeños y sin stackeo */}
            {gestureState !== "confirmed" && (
              <div className="absolute right-2 top-2 flex w-full max-w-[180px] flex-col gap-1 px-2 sm:right-4 sm:top-4 sm:max-w-[220px] sm:px-0 transition-opacity duration-300">
                {toasts.map((toast) => <Toast key={toast.id} toast={toast} isDark={isDark} />)}
              </div>
            )}
          </div>
        </main>

        <aside className={cx("hidden w-64 flex-col border-l md:flex", isDark ? "border-brand-line bg-brand-deep" : "border-brand-mist bg-brand-cream")}>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <SignQueue current={signIdx} isDark={isDark} />
            <Card isDark={isDark} className="p-4">
              <SectionLabel isDark={isDark}>Esta sesión</SectionLabel>
              <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                <Stat value={correct} label="Detectadas" isDark={isDark} />
                <Stat value={total - correct} label="Saltadas" isDark={isDark} />
              </div>
            </Card>
          </div>
          <div className={cx("flex items-center justify-center gap-4 border-t px-6 py-4", isDark ? "border-brand-line bg-brand-deep/90" : "border-brand-mist bg-brand-cream/90")}>
            <button onClick={() => navigate("/dashboard")} className={cx("btn-press flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold", isDark ? "bg-brand-card text-brand-soft" : "bg-white text-brand-muted shadow-sm")}>
              <Icon name="x" className="h-4 w-4" />Terminar
            </button>
            <button onClick={skipSign} className={cx("btn-press flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold", isDark ? "bg-brand-card text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}>
              Saltar<Icon name="arrow" className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </div>

      {/* Controles móvil */}
      <div className={cx("md:hidden flex items-center justify-between gap-2 border-t px-4 py-3 sm:gap-3 sm:px-6", isDark ? "border-brand-line bg-brand-deep/90" : "border-brand-mist bg-brand-cream/90")}>
        <button onClick={() => navigate("/dashboard")} className={cx("btn-press flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold sm:px-4", isDark ? "bg-brand-card text-brand-soft" : "bg-white text-brand-muted shadow-sm")}>
          <Icon name="x" className="h-4 w-4" /><span className="hidden sm:inline">Terminar</span><span className="sm:hidden">Salir</span>
        </button>
        <div className="text-center flex-1">
          <div className={cx("text-xs font-bold truncate", isDark ? "text-white" : "text-brand-ink")}>{signsQueue[signIdx].name}</div>
          <div className={cx("text-[10px]", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{correct}/{total} detectadas</div>
        </div>
        <button onClick={skipSign} className={cx("btn-press flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold sm:px-4", isDark ? "bg-brand-card text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}>
          Saltar<Icon name="arrow" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function HandGuide({ isDark }) {
  return <svg width="180" height="200" viewBox="0 0 180 200" fill="none" className="animate-hand-pulse opacity-20"><path d="M90 20C60 20 40 50 40 80V140C40 160 55 180 90 180C125 180 140 160 140 140V80C140 50 120 20 90 20Z" stroke={isDark ? "#2AABB8" : "#0D5C6F"} strokeWidth="2" strokeDasharray="8 4" /><path d="M70 80C70 70 75 60 80 55M90 75V48M110 80C110 70 105 60 100 55M125 90C128 82 130 75 128 70" stroke={isDark ? "#2AABB8" : "#0D5C6F"} strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function Toast({ toast, isDark }) {
  const styles = {
    info: isDark ? "bg-brand-line text-[#D4EEF4]" : "bg-[#A8CDD6] text-[#1A3A42]",
    success: isDark ? "bg-[#1A6B4A] text-[#D4F5E4]" : "bg-brand-mint text-[#1A4A32]",
    warning: isDark ? "bg-[#8B5A2B] text-[#FDE8D4]" : "bg-brand-orange text-[#5A3A1A]"
  };
  return <div className={cx("animate-toast-in rounded-lg px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-sm", styles[toast.type])}>{toast.message}</div>;
}

const DIFF_COLORS = {
  "Fácil":   { bg: "bg-green-500/20",  text: "text-green-400" },
  "Media":   { bg: "bg-brand-orange/20", text: "text-brand-orange" },
  "Difícil": { bg: "bg-[#D96B6B]/20",  text: "text-[#D96B6B]" },
};

function SignQueue({ current, isDark }) {
  const windowStart = Math.max(0, current - 1);
  const windowEnd   = Math.min(signsQueue.length, current + 6);
  const visible     = signsQueue.slice(windowStart, windowEnd);

  return (
    <Card isDark={isDark} className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel isDark={isDark}>Cola de práctica</SectionLabel>
        <span className={cx("text-[10px] font-bold", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>
          {current + 1}/{signsQueue.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {visible.map((sign, vi) => {
          const i = windowStart + vi;
          const isCurrent = i === current;
          const isDone    = i < current;
          const diff      = DIFF_COLORS[sign.difficulty] || DIFF_COLORS["Media"];
          return (
            <div
              key={`${sign.name}-${i}`}
              className={cx(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all",
                isCurrent
                  ? isDark ? "border border-brand-cyan/40 bg-brand-teal/25" : "border border-brand-teal/30 bg-brand-teal/10"
                  : isDone
                  ? isDark ? "opacity-40 bg-brand-deep/20" : "opacity-40 bg-brand-cream/40"
                  : isDark ? "bg-brand-deep/30" : "bg-brand-cream/60"
              )}
            >
              <span className={cx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                isDone    ? "bg-brand-teal text-white" :
                isCurrent ? "bg-brand-orange text-white" :
                isDark    ? "bg-brand-deep text-[#5A8A94]" : "bg-[#E8EEEF] text-[#8AA8B0]"
              )}>
                {isDone ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-xs font-bold truncate", isDark ? "text-white" : "text-brand-ink")}>{sign.name}</span>
                <span className={cx("block text-[10px]", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{sign.module}</span>
              </span>
              <span className={cx("rounded-full px-1.5 py-0.5 text-[9px] font-bold shrink-0", diff.bg, diff.text)}>
                {sign.difficulty}
              </span>
            </div>
          );
        })}
      </div>
      {windowEnd < signsQueue.length && (
        <p className={cx("mt-2 text-center text-[10px]", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>
          +{signsQueue.length - windowEnd} señas más…
        </p>
      )}
    </Card>
  );
}

function SessionControls({ isDark, recording, onToggle, onEnd }) {
  return <div className={cx("flex items-center justify-center gap-4 border-t px-6 py-4 backdrop-blur-xl", isDark ? "border-brand-line bg-brand-deep/90" : "border-brand-mist bg-brand-cream/90")}><button type="button" onClick={onEnd} className={cx("btn-press flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold", isDark ? "bg-brand-card text-brand-soft" : "bg-white text-brand-muted shadow-sm")}><Icon name="x" className="h-4 w-4" />Terminar</button><button type="button" onClick={onToggle} className={cx("btn-press relative flex h-16 w-16 items-center justify-center rounded-full", recording ? "bg-[#D96B6B]" : isDark ? "bg-brand-cyan" : "bg-brand-teal")}><span className="h-5 w-5 rounded-sm bg-white" /></button><button type="button" onClick={onToggle} className={cx("btn-press flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold", isDark ? "bg-brand-card text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}>Siguiente<Icon name="arrow" className="h-4 w-4" /></button></div>;
}

function Stat({ value, label, isDark }) {
  return <div><div className={cx("text-xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{value}</div><div className={cx("text-[10px] font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{label}</div></div>;
}

function ConfigErrorPage({ isDark }) {
  return (
    <div className={cx("flex min-h-screen items-center justify-center px-6", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
      <div className={cx("w-full max-w-lg rounded-2xl border p-6 text-center", isDark ? "border-brand-line bg-brand-card text-white" : "border-brand-mist bg-white text-brand-ink")}>
        <Logo isDark={isDark} compact />
        <h1 className="mt-6 text-2xl font-extrabold">Configuracion pendiente</h1>
        <p className={cx("mt-3 text-sm leading-6", isDark ? "text-brand-soft" : "text-brand-muted")}>
          Agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en las variables de entorno del deploy y vuelve a desplegar.
        </p>
      </div>
    </div>
  );
}


function App() {
  const [isDark, setIsDark] = useState(false);
  const [path, navigate, state] = useRoute();
  const { user, loading, authConfigError } = useAuth();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Handle OAuth callback redirect
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const hash = window.location.hash;
      if (hash.includes('access_token') || hash.includes('error')) {
        // Let Supabase handle the session restoration
        await supabase.auth.getSession();
        // The auth state change will trigger navigation
      }
    };
    
    handleOAuthCallback();
  }, []);

  // Ensure camera is stopped when navigating away from practice page
  useEffect(() => {
    const stopCamera = () => {
      // Stop all active media streams
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach(video => {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(track => {
            track.stop();
          });
          video.srcObject = null;
        }
      });
    };

    if (path !== "/practice") {
      stopCamera();
    }

    return () => {
      // Also stop camera on unmount
      stopCamera();
    };
  }, [path]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${isDark ? "bg-brand-deep" : "bg-brand-cream"}`}>
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-brand-teal border-t-transparent"></div>
          <p className={cx(isDark ? "text-brand-soft" : "text-brand-muted")}>Cargando...</p>
        </div>
      </div>
    );
  }

  if (authConfigError) return <ConfigErrorPage isDark={isDark} />;

  // Auth pages
  if (path === "/" || path === "/login") return <AuthPage mode="login" isDark={isDark} setIsDark={setIsDark} navigate={navigate} />;
  if (path === "/signup") return <AuthPage mode="signup" isDark={isDark} setIsDark={setIsDark} navigate={navigate} />;
  if (path === "/confirm-email") return <EmailConfirmationPage isDark={isDark} setIsDark={setIsDark} navigate={navigate} email={state?.email || ""} />;

  // Protected routes - redirect to login if not authenticated
  if (!user) {
    navigate("/");
    return null;
  }

  // Protected pages - todas con header
  if (path === "/practice") {
    return (
      <div className={cx("min-h-screen transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
        <AppHeader isDark={isDark} setIsDark={setIsDark} navigate={navigate} path={path} />
        <PracticePage isDark={isDark} setIsDark={setIsDark} navigate={navigate} />
      </div>
    );
  }
  
  if (path === "/dashboard") {
    return (
      <div className={cx("min-h-screen transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
        <AppHeader isDark={isDark} setIsDark={setIsDark} navigate={navigate} path={path} />
        <DashboardPage isDark={isDark} navigate={navigate} />
      </div>
    );
  }
  
  if (path === "/learn") {
    return (
      <div className={cx("min-h-screen transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
        <AppHeader isDark={isDark} setIsDark={setIsDark} navigate={navigate} path={path} />
        <LearnPage isDark={isDark} />
      </div>
    );
  }
  
  if (path === "/lesson") {
    return <LessonPage isDark={isDark} navigate={navigate} />;
  }

  return (
    <div className={cx("min-h-screen transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
      <AppHeader isDark={isDark} setIsDark={setIsDark} navigate={navigate} path={path} />
      <DashboardPage isDark={isDark} navigate={navigate} />
    </div>
  );
}

export default App;

createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <App />
    <Analytics />
  </AuthProvider>
);

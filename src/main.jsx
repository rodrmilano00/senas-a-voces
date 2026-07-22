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

const navItems = [
  { path: "/", label: "Acceso" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/learn", label: "Aprender" },
  { path: "/practice", label: "Práctica" }
];

const modules = [ALPHABET_LESSON, ...GLOSARIO_LESSONS].map((lesson, i) => ({
  id: lesson.id,
  title: lesson.title,
  desc: `${lesson.items.length} señas · Nivel ${lesson.level}`,
  signs: lesson.items.length,
  status: i === 0 ? "current" : i < 3 ? "completed" : "locked",
  items: lesson.items,
  level: lesson.level,
}));

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
  { label: "Memoria visual", value: "Alta", detail: "Reconoces patrones de mano con buena precision." },
  { label: "Ritmo", value: "12 dias", detail: "Tu constancia desbloquea practica avanzada." },
  { label: "Siguiente foco", value: "Familia", detail: "Practica parentescos antes de pasar a comida." }
];

const dailyQuest = [
  { task: "Completa 3 senas de Familia", done: true },
  { task: "Repite una sena dificil", done: true },
  { task: "Graba una practica corta", done: false }
];

const accountActions = [
  { label: "Mi perfil", helper: "Datos y preferencias", icon: "user", path: "/dashboard" },
  { label: "Progreso", helper: "Racha y modulos", icon: "trophy", path: "/learn" },
  { label: "Practica", helper: "Abrir camara", icon: "camera", path: "/practice" },
  { label: "Cerrar sesion", helper: "Volver al acceso", icon: "lock", path: "/" }
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
    x: <svg {...filled}><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" /></svg>
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
    <header className={cx("app-header sticky top-0 z-40 border-b backdrop-blur-xl transition-colors", isDark ? "border-brand-line bg-brand-deep/85" : "border-brand-mist bg-brand-cream/85")}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <button onClick={() => navigate("/dashboard")} className="btn-press"><Logo isDark={isDark} compact /></button>
        
        {/* Mobile Navigation Button */}
        <button 
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className={cx("md:hidden btn-press rounded-xl p-2", isDark ? "text-brand-soft hover:bg-brand-card" : "text-brand-muted hover:bg-white")}
          aria-label="Menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileNavOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.slice(1).map((item) => (
            <button key={item.path} onClick={() => navigate(item.path)} className={cx("rounded-2xl px-3 py-2 text-xs font-bold transition", path === item.path ? (isDark ? "bg-brand-card text-white" : "bg-white text-brand-teal shadow-sm") : (isDark ? "text-brand-soft hover:bg-brand-card" : "text-brand-muted hover:bg-white"))}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle isDark={isDark} setIsDark={setIsDark} />
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className={cx("profile-trigger btn-press flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold", isDark ? "bg-brand-card text-brand-cyan" : "bg-brand-teal text-white")}
            >
              {userInitials}
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

      {/* Mobile Navigation Menu */}
      {mobileNavOpen && (
        <div ref={mobileNavRef} className={cx("md:hidden border-t px-4 py-3", isDark ? "border-brand-line bg-brand-deep/95" : "border-brand-mist bg-brand-cream/95")}>
          <nav className="flex flex-col gap-2">
            {navItems.slice(1).map((item) => (
              <button 
                key={item.path} 
                onClick={() => { navigate(item.path); setMobileNavOpen(false); }}
                className={cx("rounded-xl px-4 py-3 text-left text-sm font-bold transition", path === item.path ? (isDark ? "bg-brand-card text-white" : "bg-white text-brand-teal shadow-sm") : (isDark ? "text-brand-soft hover:bg-brand-card" : "text-brand-muted hover:bg-white"))}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: isDark ? "#1A5C6A" : "#E8EEEF" }}>
            <div className="flex items-center gap-3">
              <ThemeToggle isDark={isDark} setIsDark={setIsDark} />
              <span className={cx("text-sm font-semibold", isDark ? "text-white" : "text-brand-ink")}>{userName}</span>
            </div>
            <button 
              onClick={() => { signOut(); setMobileNavOpen(false); }}
              className={cx("btn-press rounded-xl px-4 py-2 text-xs font-bold", isDark ? "bg-brand-card text-brand-orange" : "bg-white text-brand-orange shadow-sm")}
            >
              Cerrar sesión
            </button>
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
  return <div className={cx("surface-card rounded-2xl p-6", isDark ? "border border-brand-line bg-brand-card" : "border border-gray-100 bg-white shadow-sm", className)}>{children}</div>;
}

function LearningPulse({ isDark }) {
  return (
    <Card isDark={isDark} className="learning-pulse mb-6 p-4 sm:p-6 md:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between sm:gap-6">
        <div className="flex-1">
          <SectionLabel isDark={isDark}>Brujula de aprendizaje</SectionLabel>
          <h2 className={cx("mt-4 text-xl font-extrabold sm:text-2xl", isDark ? "text-white" : "text-brand-ink")}>Hoy conviene practicar Familia</h2>
          <p className={cx("mt-3 max-w-2xl text-sm leading-7", isDark ? "text-brand-soft" : "text-brand-muted")}>Tu ruta detecta buena memoria visual. Manten sesiones cortas y repite las senas que mezclan parentesco y saludo.</p>
        </div>
        <span className={cx("hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl sm:flex sm:h-14 sm:w-14", isDark ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}><Icon name="sparkles" /></span>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {learningMoments.map((item) => (
          <div key={item.label} className={cx("rounded-xl border p-3 sm:p-4", isDark ? "border-brand-line bg-brand-deep/20" : "border-brand-mist bg-white/35")}>
            <span className={cx("text-xs font-bold", isDark ? "text-brand-soft" : "text-brand-muted")}>{item.label}</span>
            <strong className={cx("mt-2 block text-lg sm:text-xl", isDark ? "text-white" : "text-brand-ink")}>{item.value}</strong>
            <p className={cx("mt-2 text-xs", isDark ? "text-brand-soft" : "text-brand-muted")}>{item.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function QuestList({ isDark }) {
  return (
    <Card isDark={isDark}>
      <div className="mb-4 flex items-center justify-between"><SectionLabel isDark={isDark}>Reto de hoy</SectionLabel><span className={cx("rounded-full px-3 py-1 text-xs font-bold", isDark ? "bg-brand-orange/15 text-brand-orange" : "bg-brand-orange/20 text-brand-teal")}>2/3</span></div>
      <div className="space-y-4">
        {dailyQuest.map((quest) => (
          <div key={quest.task} className={cx("flex items-center gap-3 rounded-xl p-2", !quest.done && (isDark ? "bg-brand-deep/35" : "bg-brand-cream/55"))}>
            <span className={cx("flex h-7 w-7 items-center justify-center rounded-lg", quest.done ? "bg-brand-teal text-white" : isDark ? "border border-brand-line text-brand-soft" : "border border-brand-mist text-brand-muted")}><Icon name={quest.done ? "check" : "sparkles"} className="h-4 w-4" /></span>
            <p className={cx("text-xs font-semibold", isDark ? "text-brand-soft" : "text-brand-muted")}>{quest.task}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Dashboard({ isDark, navigate }) {
  const { profile, userProgress, moduleProgress, user } = useAuth();
  const levels = isDark ? ["#0C4A57", "#0E5F6E", "#14889A", "#1FAAB8", "#2AABB8"] : ["#E8EEEF", "#A8CDD6", "#5AADBE", "#1D7F94", "#0D5C6F"];
  const [recommendations, setRecommendations] = useState([]);
  
  // Parse weekly activity from database or use default
  const activity = useMemo(() => {
    if (userProgress?.weekly_activity && userProgress.weekly_activity.length > 0) {
      return userProgress.weekly_activity;
    }
    return Array.from({ length: 16 }, (_, week) => Array.from({ length: 7 }, (_, day) => (week * 3 + day * 5) % 5));
  }, [userProgress]);

  const userName = profile?.full_name || "Usuario";
  const streakDays = userProgress?.streak_days || 0;
  const practiceDays = userProgress?.practice_days || 0;
  const currentLevel = userProgress?.current_level || 1;
  const currentLesson = userProgress?.current_lesson || 1;
  const totalSignsLearned = userProgress?.total_signs_learned || 0;
  const totalPracticeTime = userProgress?.total_practice_time || 0;
  const averageAccuracy = userProgress?.average_accuracy || 0;

  // Calculate module progress
  const completedModules = moduleProgress?.filter(m => m.status === 'completed').length || 0;
  const totalModules = modules.length;
  const moduleProgressPercent = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

  // Fetch recommendations
  useEffect(() => {
    if (user) {
      getRecommendations(user.id).then(setRecommendations);
    }
  }, [user]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageTitle isDark={isDark} title={`Buenas tardes, ${userName.split(' ')[0]}`} accent={userName.split(' ')[0]} subtitle="Tu progreso de la semana va excelente" />
      <LearningPulse isDark={isDark} />
      {streakDays > 0 && (
        <div className={cx("streak-banner animate-fade mb-6 flex items-center gap-3 rounded-xl border p-3 sm:gap-4 sm:p-4", isDark ? "border-brand-line bg-brand-card/70" : "border-brand-mist bg-white/60")}>
          <div className="flex items-center gap-2 text-brand-orange"><Icon name="flame" className="streak-fire h-6 w-6 sm:h-7 sm:w-7" /><strong className="text-2xl sm:text-3xl">{streakDays}</strong></div>
          <div><div className={cx("text-sm font-bold", isDark ? "text-white" : "text-brand-ink")}>¡Racha de {streakDays} días!</div><div className={cx("text-xs", isDark ? "text-brand-soft" : "text-brand-muted")}>Sigue practicando para mantener tu racha activa</div></div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card isDark={isDark}>
            <div className="mb-4 flex items-center justify-between"><SectionLabel isDark={isDark}>Actividad reciente</SectionLabel><span className={cx("text-xs font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>Últimas 16 semanas</span></div>
            <div className="overflow-x-auto">
              <div className="flex w-max gap-1.5">
                {activity.map((week, wi) => <div key={wi} className="flex flex-col gap-[3px]">{week.map((level, di) => <div key={di} className="heatmap-cell h-[12px] w-[12px] sm:h-[14px] sm:w-[14px] rounded-[3px]" style={{ backgroundColor: levels[level] }} />)}</div>)}
              </div>
            </div>
          </Card>
          <ProgressCard 
            isDark={isDark} 
            currentLevel={currentLevel}
            currentLesson={currentLesson}
            totalSignsLearned={totalSignsLearned}
            totalPracticeTime={totalPracticeTime}
            averageAccuracy={averageAccuracy}
            moduleProgressPercent={moduleProgressPercent}
            practiceDays={practiceDays}
          />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <QuestList isDark={isDark} />
          {recommendations.length > 0 && (
            <Card isDark={isDark}>
              <SectionLabel isDark={isDark}>Recomendaciones</SectionLabel>
              <div className="mt-4 space-y-2">
                {recommendations.map((rec, i) => (
                  <div key={i} className={cx("flex items-start gap-3 rounded-lg p-3", isDark ? "bg-brand-deep/50" : "bg-brand-cream/50")}>
                    <span className={cx("mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", isDark ? "bg-brand-cyan/20 text-brand-cyan" : "bg-brand-teal/20 text-brand-teal")}>{i + 1}</span>
                    <p className={cx("text-xs font-medium", isDark ? "text-brand-soft" : "text-brand-muted")}>{rec.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card isDark={isDark}>
            <SectionLabel isDark={isDark}>Tu semana</SectionLabel>
            <div className="mt-4 space-y-3">{[45, 30, 60, 25, 0, 0, 0].map((min, i) => <BarRow key={i} label={["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][i]} value={min} isDark={isDark} />)}</div>
          </Card>
          <div>
            <SectionLabel isDark={isDark}>Acciones rápidas</SectionLabel>
            <div className="mt-3 space-y-3">
              <QuickAction isDark={isDark} icon="play" title="Comenzar lección" desc={`Lección ${currentLesson}`} onClick={() => navigate("/learn")} />
              <QuickAction isDark={isDark} icon="camera" title="Práctica inmersiva" desc="Feedback con IA" onClick={() => navigate("/practice")} accent />
              <QuickAction isDark={isDark} icon="refresh" title="Repaso diario" desc={`${Math.max(0, 12 - totalSignsLearned)} señas pendientes`} onClick={() => navigate("/learn")} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function PageTitle({ isDark, title, accent, subtitle }) {
  const parts = title.split(accent);
  return (
    <div className="animate-fade mb-8">
      <h1 className={cx("text-2xl font-extrabold md:text-3xl", isDark ? "text-white" : "text-brand-ink")}>{parts[0]}<span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>{accent}</span>{parts[1]}</h1>
      <p className={cx("mt-1 text-sm", isDark ? "text-brand-soft" : "text-brand-muted")}>{subtitle}</p>
    </div>
  );
}

function SectionLabel({ isDark, children }) {
  return <h3 className={cx("text-sm font-bold uppercase tracking-wider", isDark ? "text-brand-soft" : "text-brand-muted")}>{children}</h3>;
}

function ProgressCard({ isDark, currentLevel, currentLesson, totalSignsLearned, totalPracticeTime, averageAccuracy, moduleProgressPercent, practiceDays }) {
  return (
    <Card isDark={isDark}>
      <div className="mb-4 flex items-center justify-between"><SectionLabel isDark={isDark}>Progreso actual</SectionLabel><span className={cx("rounded-full px-3 py-1 text-xs font-semibold", isDark ? "bg-brand-cyan/15 text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}>Nivel {currentLevel}</span></div>
      <h3 className={cx("text-2xl font-extrabold sm:text-3xl", isDark ? "text-white" : "text-brand-ink")}>Lección {currentLesson}:</h3>
      <p className={cx("text-sm font-medium", isDark ? "text-brand-soft" : "text-brand-muted")}>Progreso del módulo</p>
      <div className={cx("mt-5 h-2.5 overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-[#E8EEEF]")}><div className="h-full rounded-full bg-gradient-to-r from-brand-teal to-brand-orange" style={{ width: `${moduleProgressPercent}%` }} /></div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-dashed pt-5 sm:grid-cols-4" style={{ borderColor: isDark ? "#1A5C6A" : "#E8EEEF" }}>
        {[
          [totalSignsLearned, "Señas aprendidas"],
          [`${totalPracticeTime} min`, "Tiempo total"],
          [`${Math.round(averageAccuracy)}%`, "Precisión"],
          [practiceDays, "Días practicados"]
        ].map(([v, l]) => (
          <div key={l} className="text-center">
            <div className={cx("text-lg font-extrabold sm:text-xl", isDark ? "text-white" : "text-brand-ink")}>{v}</div>
            <div className={cx("mt-0.5 text-[10px] font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{l}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BarRow({ label, value, isDark }) {
  return <div className="flex items-center gap-3"><span className={cx("w-8 text-xs font-semibold", isDark ? "text-brand-soft" : "text-brand-muted")}>{label}</span><div className={cx("h-2 flex-1 overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-[#E8EEEF]")}><div className="h-full rounded-full bg-gradient-to-r from-brand-teal to-brand-orange" style={{ width: `${Math.min(100, (value / 60) * 100)}%` }} /></div><span className={cx("w-10 text-right text-xs font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{value ? `${value}m` : "-"}</span></div>;
}

function QuickAction({ isDark, icon, title, desc, onClick, accent }) {
  return (
    <button onClick={onClick} className={cx("btn-press group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition", isDark ? "border-brand-line bg-brand-card hover:border-brand-cyan/30" : "border-gray-100 bg-white shadow-sm hover:shadow-md")}>
      <span className={cx("flex h-11 w-11 items-center justify-center rounded-lg", accent ? "bg-brand-orange/15 text-brand-orange" : isDark ? "bg-brand-teal/20 text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}><Icon name={icon} /></span>
      <span className="min-w-0 flex-1"><span className={cx("block text-sm font-bold", isDark ? "text-white" : "text-brand-ink")}>{title}</span><span className={cx("block text-xs", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{desc}</span></span>
      <Icon name="arrow" className={cx("h-4 w-4 transition group-hover:translate-x-1", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")} />
    </button>
  );
}

function LearnPage({ isDark }) {
  const { userProgress, moduleProgress } = useAuth();
  const [selected, setSelected] = useState(modules[0]);
  const [activeSign, setActiveSign] = useState(null);
  const [search, setSearch] = useState("");

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
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageTitle isDark={isDark} title="Tu ruta de aprendizaje" accent="aprendizaje" subtitle="Selecciona un módulo y toca cualquier seña para ver el video" />
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-0 lg:col-span-4 overflow-y-auto max-h-[60vh] lg:max-h-[80vh] pr-1">
          {modulesWithProgress.map((module, index) => (
            <SkillNode
              key={module.id} module={module} index={index} isDark={isDark}
              selected={selected?.id === module.id}
              onClick={() => { setSelected(module); setActiveSign(null); setSearch(""); }}
            />
          ))}
        </section>
        <section className="space-y-4 lg:col-span-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card isDark={isDark}>
              <SectionLabel isDark={isDark}>Tu racha</SectionLabel>
              <div className="mt-4 text-center">
                <div className="text-3xl font-extrabold text-brand-orange sm:text-4xl">{streakDays}</div>
                <div className={cx("mt-1 text-xs font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>días consecutivos</div>
              </div>
            </Card>
            <Card isDark={isDark}>
              <SectionLabel isDark={isDark}>Progreso general</SectionLabel>
              <div className={cx("mt-3 text-2xl font-extrabold sm:text-3xl", isDark ? "text-white" : "text-brand-ink")}>{progress}%</div>
              <div className={cx("mt-3 h-2 overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-[#E8EEEF]")}>
                <div className="h-full rounded-full bg-gradient-to-r from-brand-teal to-brand-orange" style={{ width: `${progress}%` }} />
              </div>
              <p className={cx("mt-2 text-[10px]", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{completedSigns} de {totalSigns} señas</p>
            </Card>
          </div>
          {activeSign ? (
            <SignVideoPanel sign={activeSign} isDark={isDark} onClose={() => setActiveSign(null)} moduleId={selected.id} />
          ) : (
            <ModuleDetail
              module={selected} isDark={isDark}
              items={filteredItems} search={search}
              onSearch={setSearch} onSelect={setActiveSign}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function SkillNode({ module, index, isDark, selected, onClick }) {
  const completed = module.status === "completed";
  const current = module.status === "current";
  const locked = module.status === "locked";
  return (
    <div>
      <button onClick={onClick} className={cx("animate-fade flex w-full items-center gap-3 text-left sm:gap-4", locked && "cursor-default opacity-60")} style={{ animationDelay: `${index * 60}ms` }}>
        <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition sm:h-14 sm:w-14", completed ? "bg-brand-teal text-white" : current ? "node-glow bg-brand-orange text-white" : isDark ? "border border-brand-line bg-brand-card text-[#5A8A94]" : "border border-brand-mist bg-[#E8EEEF] text-[#8AA8B0]")}>{completed ? <Icon name="check" /> : current ? <Icon name="play" /> : <Icon name="lock" />}</span>
        <span className={cx("flex-1 rounded-xl p-3 transition sm:p-4", selected ? (isDark ? "border border-brand-cyan/30 bg-brand-card" : "border border-brand-teal/20 bg-white shadow-sm") : (isDark ? "hover:bg-brand-card/50" : "hover:bg-white/50"))}>
          <span className={cx("block text-sm font-bold", isDark ? "text-white" : "text-brand-ink")}>{module.title}</span>
          <span className={cx("block text-xs", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{module.desc}</span>
        </span>
      </button>
      {index < modules.length - 1 && <div className="flex justify-center py-1"><div className={cx("h-8 w-px rounded-full sm:h-10", isDark ? "bg-brand-line" : "bg-brand-mist")} /></div>}
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
            key={item.label} onClick={() => onSelect(item)}
            className={cx("btn-press group flex flex-col items-center gap-2 rounded-xl border p-2 sm:p-3 text-center transition",
              isDark ? "border-brand-line bg-brand-deep/40 hover:border-brand-cyan/40 hover:bg-brand-card" : "border-brand-mist bg-brand-cream hover:border-brand-teal/30 hover:bg-white hover:shadow-sm"
            )}
          >
            <img src={item.thumbnail} alt={item.label} className="h-12 w-full rounded-lg object-cover sm:h-14" loading="lazy" />
            <span className={cx("text-[10px] font-semibold leading-tight sm:text-[11px]", isDark ? "text-brand-soft" : "text-brand-muted")}>{item.label}</span>
          </button>
        ))}
      </div>
    </Card>
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
          <span className={cx("hidden text-xs font-semibold sm:block", isDark ? "text-brand-soft" : "text-brand-muted")}>Práctica Inmersiva · MediaPipe</span>
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
  const [isDark, setIsDark] = useState(true);
  const [path, navigate, state] = useRoute();
  const { user, loading, authConfigError } = useAuth();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

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

  // Protected pages
  if (path === "/practice") return <PracticePage isDark={isDark} setIsDark={setIsDark} navigate={navigate} />;

  return (
    <div className={cx("min-h-screen transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
      <AppHeader isDark={isDark} setIsDark={setIsDark} navigate={navigate} path={path} />
      {path === "/learn" ? <LearnPage isDark={isDark} /> : <Dashboard isDark={isDark} navigate={navigate} />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);

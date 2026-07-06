import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { GLOSARIO_LESSONS } from "./lessons_glosario.js";

const navItems = [
  { path: "/", label: "Acceso" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/learn", label: "Aprender" },
  { path: "/practice", label: "Práctica" }
];

const modules = GLOSARIO_LESSONS.map((lesson, i) => ({
  id: lesson.id,
  title: lesson.title,
  desc: `${lesson.items.length} señas · Nivel ${lesson.level}`,
  signs: lesson.items.length,
  status: i === 0 ? "current" : i < 3 ? "completed" : "locked",
  items: lesson.items,
  level: lesson.level,
}));

const signsQueue = [
  // Nivel 1 — Números (G1)
  { name: "1",          difficulty: "Fácil",   module: "Números" },
  { name: "2",          difficulty: "Fácil",   module: "Números" },
  { name: "3",          difficulty: "Fácil",   module: "Números" },
  { name: "4",          difficulty: "Fácil",   module: "Números" },
  { name: "5",          difficulty: "Fácil",   module: "Números" },
  { name: "6",          difficulty: "Fácil",   module: "Números" },
  { name: "7",          difficulty: "Fácil",   module: "Números" },
  { name: "8",          difficulty: "Fácil",   module: "Números" },
  { name: "9",          difficulty: "Fácil",   module: "Números" },
  { name: "10",         difficulty: "Fácil",   module: "Números" },
  { name: "20",         difficulty: "Media",   module: "Números" },
  { name: "30",         difficulty: "Media",   module: "Números" },
  { name: "100",        difficulty: "Media",   module: "Números" },
  { name: "1,000",      difficulty: "Difícil", module: "Números" },
  // Nivel 1 — Expresiones cotidianas (G2)
  { name: "DISCULPA",         difficulty: "Fácil",   module: "Expresiones" },
  { name: "POR FAVOR",        difficulty: "Fácil",   module: "Expresiones" },
  { name: "¿CÓMO ESTÁS?",     difficulty: "Media",   module: "Expresiones" },
  { name: "¿CÓMO TE LLAMAS?", difficulty: "Media",   module: "Expresiones" },
  { name: "¡SORPRESA!",       difficulty: "Media",   module: "Expresiones" },
  { name: "¡QUÉ MILAGRO!",    difficulty: "Difícil", module: "Expresiones" },
  // Nivel 2 — Colores (G3)
  { name: "ROJO",    difficulty: "Fácil",   module: "Colores" },
  { name: "AZUL",    difficulty: "Fácil",   module: "Colores" },
  { name: "VERDE",   difficulty: "Fácil",   module: "Colores" },
  { name: "AMARILLO",difficulty: "Fácil",   module: "Colores" },
  { name: "BLANCO",  difficulty: "Media",   module: "Colores" },
  { name: "NEGRO",   difficulty: "Media",   module: "Colores" },
  { name: "NARANJA", difficulty: "Media",   module: "Colores" },
  { name: "MORADO",  difficulty: "Media",   module: "Colores" },
  { name: "ROSA",    difficulty: "Difícil", module: "Colores" },
  { name: "CAFÉ",    difficulty: "Difícil", module: "Colores" },
  // Nivel 2 — Familia (G4)
  { name: "MAMÁ",    difficulty: "Fácil",   module: "Familia" },
  { name: "PAPÁ",    difficulty: "Fácil",   module: "Familia" },
  { name: "HERMANO", difficulty: "Fácil",   module: "Familia" },
  { name: "ABUELO",  difficulty: "Media",   module: "Familia" },
  { name: "ABUELA",  difficulty: "Media",   module: "Familia" },
  { name: "TÍO",     difficulty: "Media",   module: "Familia" },
  { name: "ESPOSO",  difficulty: "Difícil", module: "Familia" },
  { name: "YERNO",   difficulty: "Difícil", module: "Familia" },
  // Nivel 3 — Salud (G5)
  { name: "DOCTOR",      difficulty: "Media",   module: "Salud" },
  { name: "HOSPITAL",    difficulty: "Media",   module: "Salud" },
  { name: "MEDICINA",    difficulty: "Media",   module: "Salud" },
  { name: "ENFERMEDAD",  difficulty: "Difícil", module: "Salud" },
  { name: "EMERGENCIA",  difficulty: "Difícil", module: "Salud" },
  // Nivel 3 — Educación (G6 — alfabeto completo LSM)
  { name: "A",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "B",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "C",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "D",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "E",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "F",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "G",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "H",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "I",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "J",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "K",  difficulty: "Media",   module: "Alfabeto" },
  { name: "L",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "M",  difficulty: "Media",   module: "Alfabeto" },
  { name: "N",  difficulty: "Media",   module: "Alfabeto" },
  { name: "Ñ",  difficulty: "Media",   module: "Alfabeto" },
  { name: "O",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "P",  difficulty: "Media",   module: "Alfabeto" },
  { name: "Q",  difficulty: "Media",   module: "Alfabeto" },
  { name: "R",  difficulty: "Media",   module: "Alfabeto" },
  { name: "RR", difficulty: "Difícil", module: "Alfabeto" },
  { name: "S",  difficulty: "Media",   module: "Alfabeto" },
  { name: "T",  difficulty: "Media",   module: "Alfabeto" },
  { name: "U",  difficulty: "Fácil",   module: "Alfabeto" },
  { name: "V",  difficulty: "Media",   module: "Alfabeto" },
  { name: "W",  difficulty: "Media",   module: "Alfabeto" },
  { name: "X",  difficulty: "Difícil", module: "Alfabeto" },
  { name: "Y",  difficulty: "Media",   module: "Alfabeto" },
  { name: "Z",  difficulty: "Difícil", module: "Alfabeto" },
  { name: "CH", difficulty: "Difícil", module: "Alfabeto" },
  { name: "LL", difficulty: "Difícil", module: "Alfabeto" },
  { name: "ESCUELA",  difficulty: "Media",   module: "Educación" },
  { name: "MAESTRO",  difficulty: "Media",   module: "Educación" },
  { name: "LIBRO",    difficulty: "Difícil", module: "Educación" },
  // Nivel 3 — Tecnología (G7)
  { name: "INTERNET",   difficulty: "Media",   module: "Tecnología" },
  { name: "TELÉFONO",   difficulty: "Media",   module: "Tecnología" },
  { name: "COMPUTADORA",difficulty: "Media",   module: "Tecnología" },
  { name: "INSTAGRAM",  difficulty: "Difícil", module: "Tecnología" },
  { name: "YOUTUBE",    difficulty: "Difícil", module: "Tecnología" },
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

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to) => {
    window.history.pushState({}, "", to);
    setPath(to);
  }, []);

  return [path, navigate];
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
  const menuRef = useRef(null);

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

  const selectAccountAction = (to) => {
    navigate(to);
    setMenuOpen(false);
  };

  return (
    <header className={cx("app-header sticky top-0 z-40 border-b backdrop-blur-xl transition-colors", isDark ? "border-brand-line bg-brand-deep/85" : "border-brand-mist bg-brand-cream/85")}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <button onClick={() => navigate("/dashboard")} className="btn-press"><Logo isDark={isDark} compact /></button>
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.slice(1).map((item) => (
            <button key={item.path} onClick={() => navigate(item.path)} className={cx("rounded-2xl px-3 py-2 text-xs font-bold transition", path === item.path ? (isDark ? "bg-brand-card text-white" : "bg-white text-brand-teal shadow-sm") : (isDark ? "text-brand-soft hover:bg-brand-card" : "text-brand-muted hover:bg-white"))}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle isDark={isDark} setIsDark={setIsDark} />
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className={cx("profile-trigger btn-press flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold", isDark ? "bg-brand-card text-brand-cyan" : "bg-brand-teal text-white")}
            >
              MA
            </button>
            {menuOpen && (
              <div className={cx("account-menu", isDark ? "account-menu-dark" : "account-menu-light")} role="menu">
                <div className="account-menu-head">
                  <span className={cx("flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold", isDark ? "bg-brand-card text-brand-cyan" : "bg-brand-teal text-white")}>MA</span>
                  <span>
                    <strong className={cx("block text-sm", isDark ? "text-white" : "text-brand-ink")}>Maria</strong>
                    <small className={cx("block text-xs", isDark ? "text-brand-soft" : "text-brand-muted")}>maria@senasavoces.mx</small>
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

function AuthPage({ mode, isDark, setIsDark, navigate }) {
  const isSignup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    setLoading(true);
    setTimeout(() => navigate("/dashboard"), 700);
  };

  return (
    <div className={cx("relative min-h-screen overflow-hidden transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
      <WaveBackground isDark={isDark} />
      <button onClick={() => setIsDark(!isDark)} className={cx("btn-press fixed right-6 top-6 z-50 rounded-xl p-2.5", isDark ? "bg-brand-card text-brand-orange" : "bg-white text-brand-teal shadow-sm")} aria-label="Cambiar tema">
        <Icon name={isDark ? "sun" : "moon"} />
      </button>
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        <section className="hidden w-[55%] items-center justify-center p-12 lg:flex">
          <div className="relative max-w-lg">
            <Logo isDark={isDark} />
            <h1 className={cx("mt-8 text-4xl font-extrabold leading-tight", isDark ? "text-white" : "text-brand-ink")}>
              {isSignup ? "Únete a la" : "Aprende LSM"}<br />
              <span className={isDark ? "text-brand-cyan" : "text-brand-teal"}>{isSignup ? "comunidad LSM" : "a tu ritmo"}</span>
            </h1>
            <p className={cx("mt-4 text-lg leading-relaxed", isDark ? "text-brand-soft" : "text-brand-muted")}>
              {isSignup ? "Crea tu cuenta gratuita y comienza con práctica inmersiva y retroalimentación inteligente." : "Únete a miles de personas que ya aprenden Lengua de Señas Mexicana con práctica inmersiva."}
            </p>
            <div className="mt-10 flex gap-8">
              {(isSignup ? [
                ["Gratis", "Para siempre"],
                ["5 min", "Por día"],
                ["IA", "Retroalimentación"]
              ] : [
                ["2,400+", "Señas enseñadas"],
                ["15K+", "Estudiantes activos"],
                ["98%", "Satisfacción"]
              ]).map(([num, label]) => (
                <div key={label}>
                  <div className={cx("text-2xl font-extrabold", isDark ? "text-brand-cyan" : "text-brand-teal")}>{num}</div>
                  <div className={cx("mt-1 text-xs font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="flex flex-1 items-center justify-center p-6 lg:p-12">
          <div className={cx("animate-float-in w-full max-w-md rounded-3xl p-8 lg:p-10", isDark ? "border border-brand-line bg-brand-card/80 backdrop-blur-xl" : "border border-gray-100 bg-white/90 shadow-2xl shadow-gray-200/50 backdrop-blur-xl")}>
            <div className="mb-8 flex justify-center lg:hidden"><Logo isDark={isDark} /></div>
            <h2 className={cx("text-2xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{isSignup ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h2>
            <p className={cx("mb-8 mt-1 text-sm", isDark ? "text-brand-soft" : "text-brand-muted")}>{isSignup ? "Empieza a aprender LSM hoy mismo" : "Inicia sesión para continuar tu aprendizaje"}</p>
            <form onSubmit={submit} className="space-y-5">
              {isSignup && <Field icon="user" label="Nombre completo" placeholder="Tu nombre" isDark={isDark} />}
              <Field icon="mail" label="Correo electrónico" type="email" placeholder="tu@correo.com" isDark={isDark} />
              <Field icon="lock" label="Contraseña" type={showPassword ? "text" : "password"} placeholder={isSignup ? "Mínimo 8 caracteres" : "••••••••"} isDark={isDark} action={<button type="button" onClick={() => setShowPassword(!showPassword)} className={cx("rounded-lg p-1", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}><Icon name="eye" className="h-4 w-4" /></button>} />
              {isSignup && <Field icon="lock" label="Confirmar contraseña" type="password" placeholder="Repite tu contraseña" isDark={isDark} />}
              {isSignup ? (
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input checked={agreed} onChange={(e) => setAgreed(e.target.checked)} type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-teal" />
                  <span className={cx("text-xs leading-relaxed", isDark ? "text-brand-soft" : "text-brand-muted")}>Acepto los términos de servicio y la política de privacidad.</span>
                </label>
              ) : (
                <div className="flex items-center justify-between">
                  <label className={cx("flex cursor-pointer items-center gap-2 text-xs font-medium", isDark ? "text-brand-soft" : "text-brand-muted")}><input type="checkbox" className="h-4 w-4 accent-brand-teal" />Recordarme</label>
                  <button type="button" className={cx("text-xs font-semibold", isDark ? "text-brand-cyan" : "text-brand-teal")}>¿Olvidaste tu contraseña?</button>
                </div>
              )}
              <button disabled={loading || (isSignup && !agreed)} className={cx("btn-press w-full rounded-lg py-3.5 text-sm font-bold transition", isSignup ? "bg-brand-orange text-white hover:bg-[#E08A50]" : "bg-brand-teal text-white hover:bg-[#0A4D5D]", (loading || (isSignup && !agreed)) && "cursor-not-allowed opacity-55")}>
                {loading ? "Procesando..." : isSignup ? "Crear cuenta gratis" : "Iniciar sesión"}
              </button>
            </form>
            <p className={cx("mt-8 text-center text-sm", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>
              {isSignup ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
              <button onClick={() => navigate(isSignup ? "/" : "/signup")} className={cx("font-bold", isDark ? "text-brand-cyan" : "text-brand-teal")}>{isSignup ? "Inicia sesión" : "Regístrate gratis"}</button>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ icon, label, action, isDark, ...props }) {
  return (
    <label className="block">
      <span className={cx("mb-2 block text-xs font-semibold uppercase tracking-wide", isDark ? "text-brand-soft" : "text-brand-muted")}>{label}</span>
      <span className="relative block">
        <span className={cx("absolute left-3.5 top-1/2 -translate-y-1/2", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}><Icon name={icon} className="h-4 w-4" /></span>
        <input {...props} className={cx("input-focus-ring w-full rounded-lg border py-3.5 pl-11 pr-12 text-sm font-medium transition", isDark ? "border-brand-line bg-brand-deep text-white placeholder:text-[#5A8A94]" : "border-brand-mist bg-brand-cream text-brand-ink placeholder:text-[#8AA8B0]")} />
        {action && <span className="absolute right-3.5 top-1/2 -translate-y-1/2">{action}</span>}
      </span>
    </label>
  );
}

function Card({ isDark, className = "", children }) {
  return <div className={cx("surface-card rounded-2xl p-6", isDark ? "border border-brand-line bg-brand-card" : "border border-gray-100 bg-white shadow-sm", className)}>{children}</div>;
}

function LearningPulse({ isDark }) {
  return (
    <Card isDark={isDark} className="learning-pulse mb-6 p-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <SectionLabel isDark={isDark}>Brujula de aprendizaje</SectionLabel>
          <h2 className={cx("mt-4 text-2xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>Hoy conviene practicar Familia</h2>
          <p className={cx("mt-3 max-w-2xl text-sm leading-7", isDark ? "text-brand-soft" : "text-brand-muted")}>Tu ruta detecta buena memoria visual. Manten sesiones cortas y repite las senas que mezclan parentesco y saludo.</p>
        </div>
        <span className={cx("hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl sm:flex", isDark ? "bg-brand-cyan/10 text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}><Icon name="sparkles" /></span>
      </div>
      <div className="mt-7 grid gap-3 md:grid-cols-3">
        {learningMoments.map((item) => (
          <div key={item.label} className={cx("rounded-xl border p-4", isDark ? "border-brand-line bg-brand-deep/20" : "border-brand-mist bg-white/35")}>
            <span className={cx("text-xs font-bold", isDark ? "text-brand-soft" : "text-brand-muted")}>{item.label}</span>
            <strong className={cx("mt-2 block text-xl", isDark ? "text-white" : "text-brand-ink")}>{item.value}</strong>
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
  const activity = useMemo(() => Array.from({ length: 16 }, (_, week) => Array.from({ length: 7 }, (_, day) => (week * 3 + day * 5) % 5)), []);
  const levels = isDark ? ["#0C4A57", "#0E5F6E", "#14889A", "#1FAAB8", "#2AABB8"] : ["#E8EEEF", "#A8CDD6", "#5AADBE", "#1D7F94", "#0D5C6F"];
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageTitle isDark={isDark} title="Buenas tardes, María" accent="María" subtitle="Tu progreso de la semana va excelente" />
      <LearningPulse isDark={isDark} />
      <div className={cx("streak-banner animate-fade mb-6 flex items-center gap-4 rounded-xl border p-4", isDark ? "border-brand-line bg-brand-card/70" : "border-brand-mist bg-white/60")}>
        <div className="flex items-center gap-2 text-brand-orange"><Icon name="flame" className="streak-fire h-7 w-7" /><strong className="text-3xl">12</strong></div>
        <div><div className={cx("text-sm font-bold", isDark ? "text-white" : "text-brand-ink")}>¡Racha de 12 días!</div><div className={cx("text-xs", isDark ? "text-brand-soft" : "text-brand-muted")}>Sigue practicando para mantener tu racha activa</div></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card isDark={isDark}>
            <div className="mb-4 flex items-center justify-between"><SectionLabel isDark={isDark}>Actividad reciente</SectionLabel><span className={cx("text-xs font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>Últimas 16 semanas</span></div>
            <div className="overflow-x-auto">
              <div className="flex w-max gap-1.5">
                {activity.map((week, wi) => <div key={wi} className="flex flex-col gap-[3px]">{week.map((level, di) => <div key={di} className="heatmap-cell h-[14px] w-[14px] rounded-[3px]" style={{ backgroundColor: levels[level] }} />)}</div>)}
              </div>
            </div>
          </Card>
          <ProgressCard isDark={isDark} />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <QuestList isDark={isDark} />
          <Card isDark={isDark}>
            <SectionLabel isDark={isDark}>Tu semana</SectionLabel>
            <div className="mt-4 space-y-3">{[45, 30, 60, 25, 0, 0, 0].map((min, i) => <BarRow key={i} label={["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][i]} value={min} isDark={isDark} />)}</div>
          </Card>
          <div>
            <SectionLabel isDark={isDark}>Acciones rápidas</SectionLabel>
            <div className="mt-3 space-y-3">
              <QuickAction isDark={isDark} icon="play" title="Comenzar lección" desc="Lección 7: Saludos" onClick={() => navigate("/learn")} />
              <QuickAction isDark={isDark} icon="camera" title="Práctica inmersiva" desc="Feedback con IA" onClick={() => navigate("/practice")} accent />
              <QuickAction isDark={isDark} icon="refresh" title="Repaso diario" desc="12 señas pendientes" onClick={() => navigate("/learn")} />
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

function ProgressCard({ isDark }) {
  return (
    <Card isDark={isDark}>
      <div className="mb-4 flex items-center justify-between"><SectionLabel isDark={isDark}>Progreso actual</SectionLabel><span className={cx("rounded-full px-3 py-1 text-xs font-semibold", isDark ? "bg-brand-cyan/15 text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}>Nivel 3</span></div>
      <h3 className={cx("text-3xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>Lección 7:</h3>
      <p className={cx("text-sm font-medium", isDark ? "text-brand-soft" : "text-brand-muted")}>Saludos y presentaciones</p>
      <div className={cx("mt-5 h-2.5 overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-[#E8EEEF]")}><div className="h-full w-[68%] rounded-full bg-gradient-to-r from-brand-teal to-brand-orange" /></div>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-dashed pt-5" style={{ borderColor: isDark ? "#1A5C6A" : "#E8EEEF" }}>{[["12", "Señas hoy"], ["45 min", "Tiempo total"], ["89%", "Precisión"]].map(([v, l]) => <div key={l} className="text-center"><div className={cx("text-lg font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{v}</div><div className={cx("mt-0.5 text-[10px] font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{l}</div></div>)}</div>
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
  const [selected, setSelected] = useState(modules[0]);
  const [activeSign, setActiveSign] = useState(null);
  const [search, setSearch] = useState("");
  const completedSigns = modules.filter((m) => m.status === "completed").reduce((sum, m) => sum + m.signs, 0);
  const totalSigns = modules.reduce((sum, m) => sum + m.signs, 0);
  const progress = Math.round((completedSigns / totalSigns) * 100);
  const filteredItems = useMemo(() => {
    if (!selected) return [];
    if (!search.trim()) return selected.items;
    return selected.items.filter((item) =>
      item.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [selected, search]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageTitle isDark={isDark} title="Tu ruta de aprendizaje" accent="aprendizaje" subtitle="Selecciona un módulo y toca cualquier seña para ver el video" />
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-0 lg:col-span-4 overflow-y-auto max-h-[80vh] pr-1">
          {modules.map((module, index) => (
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
                <div className="text-4xl font-extrabold text-brand-orange">12</div>
                <div className={cx("mt-1 text-xs font-medium", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>días consecutivos</div>
              </div>
            </Card>
            <Card isDark={isDark}>
              <SectionLabel isDark={isDark}>Progreso general</SectionLabel>
              <div className={cx("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{progress}%</div>
              <div className={cx("mt-3 h-2 overflow-hidden rounded-full", isDark ? "bg-brand-deep" : "bg-[#E8EEEF]")}>
                <div className="h-full rounded-full bg-gradient-to-r from-brand-teal to-brand-orange" style={{ width: `${progress}%` }} />
              </div>
              <p className={cx("mt-2 text-[10px]", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{completedSigns} de {totalSigns} señas</p>
            </Card>
          </div>
          {activeSign ? (
            <SignVideoPanel sign={activeSign} isDark={isDark} onClose={() => setActiveSign(null)} />
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
      <button onClick={onClick} className={cx("animate-fade flex w-full items-center gap-4 text-left", locked && "cursor-default opacity-60")} style={{ animationDelay: `${index * 60}ms` }}>
        <span className={cx("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl transition", completed ? "bg-brand-teal text-white" : current ? "node-glow bg-brand-orange text-white" : isDark ? "border border-brand-line bg-brand-card text-[#5A8A94]" : "border border-brand-mist bg-[#E8EEEF] text-[#8AA8B0]")}>{completed ? <Icon name="check" /> : current ? <Icon name="play" /> : <Icon name="lock" />}</span>
        <span className={cx("flex-1 rounded-xl p-4 transition", selected ? (isDark ? "border border-brand-cyan/30 bg-brand-card" : "border border-brand-teal/20 bg-white shadow-sm") : (isDark ? "hover:bg-brand-card/50" : "hover:bg-white/50"))}>
          <span className={cx("block text-sm font-bold", isDark ? "text-white" : "text-brand-ink")}>{module.title}</span>
          <span className={cx("block text-xs", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{module.desc}</span>
        </span>
      </button>
      {index < modules.length - 1 && <div className="flex justify-center py-1"><div className={cx("h-10 w-px rounded-full", isDark ? "bg-brand-line" : "bg-brand-mist")} /></div>}
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
      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto sm:grid-cols-3">
        {items.map((item) => (
          <button
            key={item.label} onClick={() => onSelect(item)}
            className={cx("btn-press group flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition",
              isDark ? "border-brand-line bg-brand-deep/40 hover:border-brand-cyan/40 hover:bg-brand-card" : "border-brand-mist bg-brand-cream hover:border-brand-teal/30 hover:bg-white hover:shadow-sm"
            )}
          >
            <img src={item.thumbnail} alt={item.label} className="h-14 w-full rounded-lg object-cover" loading="lazy" />
            <span className={cx("text-[11px] font-semibold leading-tight", isDark ? "text-brand-soft" : "text-brand-muted")}>{item.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function SignVideoPanel({ sign, isDark, onClose }) {
  return (
    <Card isDark={isDark}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className={cx("text-lg font-extrabold", isDark ? "text-white" : "text-brand-ink")}>{sign.label}</h3>
          <p className={cx("text-xs", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{sign.desc}</p>
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

function useCameraMediaPipe({ onResults }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(null);

  useEffect(() => {
    const Hands = window.Hands;
    const Camera = window.Camera;
    if (!Hands || !Camera) {
      setCamError("MediaPipe no cargó. Verifica tu conexión.");
      return;
    }
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });
    hands.onResults((results) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          if (window.drawConnectors && window.drawLandmarks && window.HAND_CONNECTIONS) {
            const mirroredLms = landmarks.map((lm) => ({ ...lm, x: 1 - lm.x }));
            window.drawConnectors(ctx, mirroredLms, window.HAND_CONNECTIONS, { color: "#2AABB8", lineWidth: 2 });
            window.drawLandmarks(ctx, mirroredLms, { color: "#EC9960", lineWidth: 1, radius: 4 });
          }
        }
      }
      if (onResults) onResults(results);
    });
    handsRef.current = hands;

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((stream) => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          setCamReady(true);
          const camera = new Camera(video, {
            onFrame: async () => { await hands.send({ image: video }); },
            width: 640, height: 480,
          });
          camera.start();
          cameraRef.current = camera;
        };
      })
      .catch((err) => setCamError("Sin acceso a cámara: " + err.message));

    return () => {
      if (cameraRef.current) cameraRef.current.stop();
      if (handsRef.current) handsRef.current.close();
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, canvasRef, camReady, camError };
}

function PracticePage({ isDark, setIsDark, navigate }) {
  const [signIdx, setSignIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [handDetected, setHandDetected] = useState(false);
  const [toasts, setToasts] = useState([{ id: 1, type: "info", message: 'Coloca tu mano frente a la cámara' }]);
  const idRef = useRef(2);
  const detectionTimeout = useRef(null);

  const addToast = (type, message) => setToasts((prev) => [...prev.slice(-2), { id: idRef.current++, type, message }]);

  const handleResults = useCallback((results) => {
    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    setHandDetected(hasHand);
    if (hasHand) {
      clearTimeout(detectionTimeout.current);
      detectionTimeout.current = setTimeout(() => {
        setCorrect((v) => v + 1);
        setTotal((v) => v + 1);
        addToast("success", `¡Seña detectada! → ${signsQueue[Math.min(signIdx + 1, signsQueue.length - 1)].name}`);
        setSignIdx((v) => Math.min(v + 1, signsQueue.length - 1));
      }, 2000);
    } else {
      clearTimeout(detectionTimeout.current);
    }
  }, [signIdx]);

  const { videoRef, canvasRef, camReady, camError } = useCameraMediaPipe({ onResults: handleResults });

  const skipSign = () => {
    clearTimeout(detectionTimeout.current);
    setTotal((v) => v + 1);
    setSignIdx((v) => Math.min(v + 1, signsQueue.length - 1));
    addToast("info", `Siguiente: ${signsQueue[Math.min(signIdx + 1, signsQueue.length - 1)].name}`);
  };

  return (
    <div className={cx("flex h-screen flex-col transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
      <header className={cx("flex items-center justify-between border-b px-6 py-3 backdrop-blur-xl", isDark ? "border-brand-line bg-brand-deep/90" : "border-brand-mist bg-brand-cream/90")}>
        <div className="flex items-center gap-3">
          <Logo isDark={isDark} compact />
          <div className={cx("h-5 w-px", isDark ? "bg-brand-line" : "bg-brand-mist")} />
          <span className={cx("text-xs font-semibold", isDark ? "text-brand-soft" : "text-brand-muted")}>Práctica Inmersiva · MediaPipe</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cx("rounded-xl px-3 py-1.5 text-xs font-bold", isDark ? "bg-brand-card text-brand-cyan" : "bg-white text-brand-teal shadow-sm")}>{correct}/{total}</span>
          <ThemeToggle isDark={isDark} setIsDark={setIsDark} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative flex-1 p-4">
          <div className="relative h-full overflow-hidden rounded-xl bg-black">
            {/* Video oculto — solo usado como fuente para MediaPipe */}
            <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted />
            {/* Canvas con video espejado + landmarks */}
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />

            {!camReady && !camError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-teal border-t-transparent" />
                <p className={cx("text-sm font-semibold", isDark ? "text-brand-soft" : "text-white")}>Iniciando cámara…</p>
              </div>
            )}
            {camError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <Icon name="camera" className="h-12 w-12 text-[#D96B6B]" />
                <p className="text-sm font-semibold text-white">{camError}</p>
                <p className="text-xs text-[#8AA8B0]">Permite el acceso a la cámara en tu navegador y recarga la página.</p>
              </div>
            )}

            {/* Indicador de mano detectada */}
            {camReady && (
              <div className={cx("absolute left-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur-sm transition-colors",
                handDetected ? "bg-[#1A6B4A]/90 text-[#D4F5E4]" : "bg-black/50 text-[#8AA8B0]"
              )}>
                <span className={cx("h-2 w-2 rounded-full", handDetected ? "bg-green-400 animate-pulse" : "bg-gray-500")} />
                {handDetected ? "Mano detectada" : "Sin mano"}
              </div>
            )}

            {/* Esquinas decorativas */}
            <div className="absolute inset-8 pointer-events-none">
              {["top-0 left-0 border-l-2 border-t-2", "top-0 right-0 border-r-2 border-t-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map((pos) => (
                <div key={pos} className={cx("absolute h-8 w-8 rounded-lg", pos, handDetected ? "border-green-400/60" : "border-brand-cyan/40")} />
              ))}
            </div>

            {/* Seña actual */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-white/20 bg-black/60 px-5 py-2.5 text-center shadow-lg backdrop-blur-md">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#8AA8B0]">Seña actual</div>
              <div className="text-lg font-extrabold text-white">{signsQueue[signIdx].name}</div>
              <div className="text-[10px] text-[#5A8A94]">{signsQueue[signIdx].difficulty}</div>
            </div>

            {/* Toasts */}
            <div className="absolute left-1/2 top-6 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
              {toasts.map((toast) => <Toast key={toast.id} toast={toast} isDark={isDark} />)}
            </div>
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
      <div className={cx("md:hidden flex items-center justify-between gap-3 border-t px-6 py-3", isDark ? "border-brand-line bg-brand-deep/90" : "border-brand-mist bg-brand-cream/90")}>
        <button onClick={() => navigate("/dashboard")} className={cx("btn-press flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold", isDark ? "bg-brand-card text-brand-soft" : "bg-white text-brand-muted shadow-sm")}>
          <Icon name="x" className="h-4 w-4" />Terminar
        </button>
        <div className="text-center">
          <div className={cx("text-xs font-bold", isDark ? "text-white" : "text-brand-ink")}>{signsQueue[signIdx].name}</div>
          <div className={cx("text-[10px]", isDark ? "text-[#5A8A94]" : "text-[#8AA8B0]")}>{correct}/{total} detectadas</div>
        </div>
        <button onClick={skipSign} className={cx("btn-press flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold", isDark ? "bg-brand-card text-brand-cyan" : "bg-brand-teal/10 text-brand-teal")}>
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
  return <div className={cx("animate-toast-in rounded-xl px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur-sm", styles[toast.type])}>{toast.message}</div>;
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

function App() {
  const [isDark, setIsDark] = useState(true);
  const [path, navigate] = useRoute();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  if (path === "/" || path === "/login") return <AuthPage mode="login" isDark={isDark} setIsDark={setIsDark} navigate={navigate} />;
  if (path === "/signup") return <AuthPage mode="signup" isDark={isDark} setIsDark={setIsDark} navigate={navigate} />;
  if (path === "/practice") return <PracticePage isDark={isDark} setIsDark={setIsDark} navigate={navigate} />;

  return (
    <div className={cx("min-h-screen transition-colors", isDark ? "bg-brand-deep" : "bg-brand-cream")}>
      <AppHeader isDark={isDark} setIsDark={setIsDark} navigate={navigate} path={path} />
      {path === "/learn" ? <LearnPage isDark={isDark} /> : <Dashboard isDark={isDark} navigate={navigate} />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

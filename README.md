# Señas a Voces Academy

Aplicación web de aprendizaje de Lengua de Señas Mexicana construida con Vite, React y Tailwind CSS.

El proyecto migra los HTML estáticos originales a una SPA con componentes React reutilizables, manteniendo la identidad visual definida en `brand-spec.md`.

## Stack

- Vite
- React 19
- Tailwind CSS 3
- PostCSS + Autoprefixer
- Plus Jakarta Sans

## Requisitos

- Node.js 20 o superior recomendado
- npm

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Por defecto Vite levanta la app en:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

El resultado se genera en `dist/`.

## Preview de producción

```bash
npm run preview
```

## Estructura

```text
senas-a-voces/
├─ public/
│  ├─ logo-senas-a-voces.png
│  └─ logo-senas-a-voces-crop.png
├─ src/
│  ├─ main.jsx
│  └─ styles.css
├─ brand-spec.md
├─ index.html
├─ package.json
├─ tailwind.config.js
├─ postcss.config.js
└─ vite.config.js
```

## Pantallas

La app funciona como una SPA con navegación interna:

- `/` o `/login`: inicio de sesión
- `/signup`: registro
- `/dashboard`: progreso y acciones rápidas
- `/learn`: ruta de aprendizaje
- `/practice`: práctica inmersiva

## Branding

Los tokens principales viven en `tailwind.config.js` y siguen `brand-spec.md`.

Colores base:

- Crema: `#FAF7ED`
- Teal principal: `#0D5C6F`
- Fondo oscuro: `#083D48`
- Superficie oscura: `#0C4A57`
- Acento naranja: `#EC9960`
- Teal claro para dark mode: `#2AABB8`

El logo oficial está en `public/logo-senas-a-voces.png`.

Para headers se usa `public/logo-senas-a-voces-crop.png`, una versión recortada sin márgenes transparentes excesivos. En modo oscuro se aplica filtro CSS para mostrarlo en blanco y conservar contraste.

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm run preview  # preview local del build
```

## Notas de desarrollo

- `dist/` y `node_modules/` están ignorados por Git.
- Mantén radios entre `16px` y `24px`, como indica el brand spec.
- Usa un solo acento visual fuerte por pantalla.
- Evita sombras pesadas salvo para elevación interactiva.
- Revisa contraste del logo al tocar headers o fondos oscuros.

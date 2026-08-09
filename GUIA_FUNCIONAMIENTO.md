# Guía de Funcionamiento — Señas a Voces

## Resumen

Sistema de reconocimiento de señas dinámicas de Lengua de Señas Mexicana (LSM) usando **Dynamic Time Warping (DTW)** sobre secuencias de vectores de características extraídas de landmarks de manos.

---

## Arquitectura

### Componentes principales

| Componente | Archivo | Descripción |
|---|---|---|
| Detector DTW (JS) | `src/dynamic_sign_detector.js` | Detector principal para web |
| Detector DTW (Dart) | `flutter_app/lib/engine/dynamic_sign_detector.dart` | Puerto para Flutter |
| Página de pruebas | `src/model_test_page.jsx` | UI para evaluar el modelo con cámara |
| Detector estático | `src/lsm_detector.js` | Templates geométricos para números/letras estáticas |
| Datos de entrenamiento | `public/training_data/` | Secuencias JSON de landmarks por seña |
| Manifest | `public/training_data/manifest.json` | Catálogo de señas por categoría |

### Categorías de señas

- **numeros** — Números dinámicos (10, 14, 15, 20, 50, 60, 100, etc.)
- **palabras** — Vocabulario general (ABRIR_LIBRO, ADIOS, AGOSTO, etc.)
- **familia** — Parentesco (ABUELA, ABUELO, BEBE, CUNADO, etc.)
- **colores** — Colores (ROJO, AZUL, VERDE, etc.)
- **salud** — Salud (DOCTOR, HOSPITAL, etc.)
- **tecnologia** — Tecnología (INTERNET, TELEFONO, etc.)
- **expresiones** — Expresiones (BIEN, FEO, TRISTE, etc.)

---

## Datos de Entrenamiento

### Estructura de archivos

```
public/training_data/
├── manifest.json          # { "palabras": ["ABRIR_LIBRO", "ADIOS", ...], ... }
├── palabras/
│   ├── ABRIR_LIBRO_1.json # Ejemplo 1
│   ├── ABRIR_LIBRO_2.json # Ejemplo 2 (augmentado)
│   ├── ...
│   └── ABRIR_LIBRO_10.json# Ejemplo 10 (augmentado)
├── familia/
│   └── ABUELA_1.json
└── ...
```

### Formato de cada archivo JSON

Cada archivo contiene un arreglo de frames, cada frame tiene landmarks de manos:

```json
[
  {
    "landmarksRight": [{"x": 0.3, "y": 0.5, "z": 0.0}, ...21 puntos],
    "landmarksLeft": null
  },
  ...
]
```

- **landmarksRight**: 21 puntos de la mano derecha (o la única mano detectada)
- **landmarksLeft**: 21 puntos de la mano izquierda (null si es una seña de una mano)
- Cada landmark tiene coordenadas normalizadas `x` (0-1), `y` (0-1), `z`

### Cantidad de ejemplos

- **10 ejemplos por seña** (1 original + 9 augmentados)
- **227 señas** en total
- **2270 secuencias** de entrenamiento

### Augmentación de datos

Los ejemplos 2-10 se generan sintéticamente desde el ejemplo 1 con:

1. **Variación de velocidad**: Interpolación temporal (×0.8, ×0.85, ×0.9, ×1.1, ×1.15, ×1.2)
2. **Ruido espacial**: Jitter aleatorio en landmarks (±0.003-0.005)
3. **Rotación**: Rotación alrededor de la muñeca (±3 grados)
4. **Escala**: Escala alrededor de la muñeca (×0.9 a ×1.1)
5. **Traslación**: Desplazamiento de la mano (±0.02)
6. **Recorte temporal**: Eliminación de frames iniciales/finales

Script: `scripts/augment_aggressive.mjs`

---

## Vector de Características

Cada frame se convierte en un vector de **46 dimensiones**:

### 1. Forma de mano derecha (16 dims)
- 5 ángulos de dedos (índice, medio, anular, meñique, pulgar)
- 5 estados de extensión (true/false)
- Orientación de palma (palmNormalX, palmNormalY, palmNormalZ)
- Posición relativa de dedos
- Presencia de mano (1 o 0)

### 2. Forma de mano izquierda (16 dims)
- Igual que mano derecha
- Para señas de una mano, se duplican las features (mirror invariance)

### 3. Posición relativa entre manos (3 dims)
- `relDx`: Diferencia horizontal entre muñecas
- `relDy`: Diferencia vertical entre muñecas
- `relPresent`: 1 si ambas manos presentes, 0 si no

### 4. Velocidad y aceleración de muñeca derecha (4 dims)
- `vxR * WRIST_WEIGHT`, `vyR * WRIST_WEIGHT`
- `axR * ACCEL_WEIGHT`, `ayR * ACCEL_WEIGHT`

### 5. Velocidad y aceleración de muñeca izquierda (4 dims)
- Igual que mano derecha

### 6. Posición absoluta de muñeca (4 dims)
- `wrx * WRIST_POS_WEIGHT`, `wry * WRIST_POS_WEIGHT`
- `wlx * WRIST_POS_WEIGHT`, `wly * WRIST_POS_WEIGHT`
- **Clave para distinguir signos en diferentes partes del cuerpo** (frente vs pecho vs cara)

### Pesos

| Constante | Valor | Propósito |
|---|---|---|
| `WRIST_WEIGHT` | 4.0 | Peso de velocidad de muñeca |
| `ACCEL_WEIGHT` | 2.5 | Peso de aceleración (transiciones) |
| `WRIST_POS_WEIGHT` | 3.0 | Peso de posición absoluta de muñeca |

---

## Mirror Invariance (Espejo)

Para que una seña detectada con la mano izquierda coincida con entrenamiento de mano derecha:

1. **`abs(vx)`**: La velocidad horizontal se hace absoluta para one-handed
2. **`abs(palmNormalZ)`**: La normal de la palma se hace absoluta para one-handed
3. **`abs(x - 0.5)`**: La posición horizontal absoluta se hace simétrica para one-handed
4. **Duplicación de features**: Para one-handed, las features se duplican en ambos slots (Right y Left)

Esto significa que **no importa qué mano uses** para hacer una seña de una mano — el detector la reconocerá igual.

---

## Detección (DTW)

### Proceso de detección

1. **Captura de frames**: La cámara captura landmarks de manos en tiempo real
2. **Construcción del buffer**: Cada frame se procesa con `frameInfo()` y se agrega al buffer con `pushFrameInfo()`
3. **Pre-filtro por centroide**: Se calcula el centroide del buffer y se comparan con los centroides de todos los patrones. Solo los **40 más cercanos** pasan a DTW completo (`PRE_FILTER_N = 40`)
4. **DTW completo**: Para cada candidato, se calcula la distancia DTW entre el buffer y todas las secuencias del patrón. Se queda con la mejor (menor distancia)
5. **Ranking**: Se ordenan todos los patrones por distancia DTW ascendente
6. **Aceptación**: Se acepta el #1 si:
   - `score < 0.5` (umbral de distancia)
   - `margin > 0.12` (diferencia entre #1 y #2)
   - Se mantiene estable por 3 frames consecutivos

### Parámetros de detección

| Parámetro | Valor | Descripción |
|---|---|---|
| `PRE_FILTER_N` | 40 | Candidatos que pasan a DTW completo |
| `DETECT_SCORE_THRESHOLD` | 0.5 | Distancia máxima aceptable |
| `DETECT_MARGIN_THRESHOLD` | 0.12 | Margen mínimo entre #1 y #2 |
| `STABLE_FRAMES_TO_ACCEPT` | 3 | Frames consecutivos estables |
| `MIN_FRAMES_TO_EVAL` | 15 | Mínimo de frames antes de evaluar |
| `MAX_FRAMES_TO_EVAL` | 260 | Máximo de frames en buffer |
| `EVAL_EVERY_N_FRAMES` | 3 | Evaluar cada 3 frames |
| `IDLE_FRAMES_TO_RESET` | 8 | Frames sin mano para resetear |

---

## Scripts de Utilidad

| Script | Propósito |
|---|---|
| `scripts/augment_aggressive.mjs` | Genera 10 ejemplos por signo con transformaciones |
| `scripts/test_all_detection.mjs` | Verifica que los 227 signos detecten correctamente |
| `scripts/test_specific.mjs` | Prueba signos específicos y muestra el ranking |
| `scripts/test_numbers.mjs` | Verifica mirror invariance (DTW original vs espejo) |
| `scripts/analyze_margins.mjs` | Analiza márgenes de detección para todos los signos |
| `scripts/label_sign.ps1` | Segmenta grabación de video en ejemplos de entrenamiento |

---

## Resultados

- **227/227 señas** detectan correctamente (`accepted = true`)
- **227/227** mirror invariance (DTW original vs espejo = 0.0000)
- **196/227** tienen margen ≥ 0.5 (buena separación)
- **147/227** tienen margen ≥ 1.0 (excelente separación)
- **31/227** tienen margen < 0.5 (señas similares, pero detectables)
- **0/227** tienen margen < 0.1 (no hay confusiones críticas)

### Signos de referencia (excelente)

| Seña | Score | Margen | 2do |
|---|---|---|---|
| ABRIR_LIBRO | 0.0000 | 1.27 | COCINAR |
| ADJETIVO | 0.0000 | 1.28 | SUEGRO |
| ABRIR_PUERTA | 0.0000 | 1.22 | AGUA |
| AGOSTO | 0.0000 | 0.88 | AYER |

### Signos con margen bajo (similares pero detectables)

| Seña | Margen | Confunde con |
|---|---|---|
| MIERCOLES | 0.13 | ABRIL |
| BIEN | 0.13 | TIEMPO |
| BOMBERO | 0.30 | BOCA |
| BOCA | 0.34 | OJOS |

---

## Cómo agregar una nueva seña

1. **Grabar video** de la seña con la cámara web
2. **Extraer landmarks** con MediaPipe HandLandmarker
3. **Guardar JSON** en `public/training_data/<categoria>/<SIGN>_1.json`
4. **Agregar al manifest** en `public/training_data/manifest.json`
5. **Ejecutar augmentación**: `node scripts/augment_aggressive.mjs`
6. **Verificar**: `node scripts/test_specific.mjs <SIGN>`

---

## Puerto Dart (Flutter)

El detector está portado a Dart en `flutter_app/lib/engine/dynamic_sign_detector.dart` con la misma lógica:

- Mismos pesos (`wristWeight = 4.0`, `accelWeight = 2.5`, `wristPosWeight = 3.0`)
- Misma estructura de feature vector (46 dims)
- Mirror invariance con `abs(vx)` y `abs(x - 0.5)`
- Flag `oneHanded` en `FrameInfo`
- Sin pre-filtro (DTW sobre todos los patrones)

---

## Servidor de desarrollo

```bash
npx vite --host
```

- URL local: `http://localhost:5173`
- Página de pruebas: `http://localhost:5173/model-test`
- API de datos: `http://localhost:5173/api/training-data/manifest`

# Pipeline de entrenamiento — Señas a Voces

> **[← Volver al README principal](../README.md)**

Scripts Python para capturar datos del guante, preprocesarlos, entrenar modelos estático y dinámico, y exportarlos a `.tflite` para la app Flutter.

## Estructura

```
python_pipeline/
├── extract_from_videos.py  MP4 -> patrones DTW (vision, sin guante)
├── config.py               constantes compartidas
├── capture.py              captura BLE desde el ESP32-S3
├── preprocess.py           segmenta señas y extrae features
├── train_static.py         entrena MLP estático
├── train_dynamic.py        entrena CNN+LSTM dinámico
├── evaluate.py             evalúa un .tflite contra .npz
├── requirements.txt        deps del pipeline del guante (incluye TensorFlow)
└── requirements-video.txt  deps solo para extract_from_videos.py
```

Hay **dos vías** independientes para entrenar señas:

| Vía | Entrada | Salida | Cuándo usarla |
|-----|---------|--------|---------------|
| **Video (DTW)** | MP4 grabados | JSON en `training_data/` | Señas por cámara. No requiere entrenar ML. |
| **Guante (TFLite)** | Sensores por BLE | `.tflite` | Señas con el guante instrumentado. |

---

## Vía A — De videos MP4 a señas entrenadas

`extract_from_videos.py` procesa videos con MediaPipe, extrae los 21 landmarks
de la mano por frame y genera los JSON que consumen la app Flutter y la web.
No entrena un modelo: los JSON **son** el modelo (se comparan por DTW).

### Instalación

```bash
pip install -r requirements-video.txt
```

El modelo `hand_landmarker.task` se descarga solo la primera vez.

### Preparar los videos

Nombra cada archivo con la seña que representa. El nombre es la etiqueta:

```
videos_crudos/
├── Por Favor.mp4        ->  POR_FAVOR
├── Disculpa.mp4         ->  DISCULPA
├── COMO_ESTAS_1.mp4     ->  COMO_ESTAS (ejemplo 1)
└── COMO_ESTAS_2.mp4     ->  COMO_ESTAS (ejemplo 2)
```

Acentos y espacios se normalizan automáticamente. Varios archivos con la misma
etiqueta se acumulan como ejemplos distintos de la misma seña (mejora precisión).

### Ejecutar

```bash
# Ver qué haría sin escribir nada
python extract_from_videos.py --input ../videos_crudos --category palabras --dry-run

# Generar los patrones
python extract_from_videos.py --input ../videos_crudos --category palabras
```

Escribe en las dos raíces a la vez y actualiza los `manifest.json`:
- `public/training_data/<categoria>/` (web)
- `flutter_app/assets/training_data/<categoria>/` (app)

### Opciones útiles

| Flag | Default | Para qué |
|------|---------|----------|
| `--category` | `palabras` | Categoría destino (`numeros`, `familia`, `colores`, ...) |
| `--target-frames` | `24` | Frames por ejemplo tras remuestrear |
| `--segment` | off | Divide un video con varias repeticiones en ejemplos separados |
| `--motion-threshold` | `0.18` | Sensibilidad al segmentar |
| `--min-frames` | `6` | Descarta tramos demasiado cortos |
| `--recursive` | off | Busca videos en subcarpetas |
| `--out` | ambas raíces | Raíz de salida alternativa (repetible) |
| `--dry-run` | off | Solo reporta, no escribe |

Si grabaste un video haciendo la misma seña varias veces seguidas:

```bash
python extract_from_videos.py --input ../videos_crudos --category palabras --segment
```

### Por qué se remuestrea a 24 frames

El detector DTW usa un buffer de **30 frames** y compara ventanas de largo
`L-2` a `L+8`, donde `L` es el largo del patrón. Si un patrón tiene más de
**32 frames**, la ventana mínima (`L-2`) excede el buffer y **la seña nunca
puede reconocerse en vivo**.

Un video de 2s a 30fps produce 60 frames, así que el remuestreo no es opcional.
El default de 24 deja margen cómodo. El script avisa si subes `--target-frames`
por encima de 30.

### Después de generar

```bash
cd ../flutter_app
flutter build apk --release
```

La app carga todos los patrones del `manifest.json` al abrir.

---

## Vía B — Pipeline del guante (TFLite)

## Instalación

```bash
cd python_pipeline
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Flujo

### 1. Capturar ejemplos

Organiza carpetas por etiqueta dentro de `dataset/raw/`:

```
dataset/raw/
  POR_FAVOR/
    POR_FAVOR_20260716_193000.json
  DISCULPA/
    DISCULPA_20260716_193100.json
```

Capturar directamente por BLE:

```bash
python capture.py --label POR_FAVOR --duration 10
```

O copiar archivos JSON generados por la app Flutter (grabación exportada).

### 2. Preprocesar

```bash
python preprocess.py
```

Genera:
- `dataset/processed/static.npz`
- `dataset/processed/dynamic.npz`
- `dataset/label_map.json` (índice -> palabra)

### 3. Entrenar

```bash
python train_static.py --epochs 100 --int8
python train_dynamic.py --epochs 120 --int8
```

Salida:
- `../flutter_app/assets/models/static.tflite`
- `../flutter_app/assets/models/dynamic.tflite`
- Versiones `*_fp32.tflite` para referencia.

### 4. Evaluar

```bash
python evaluate.py --model ../flutter_app/assets/models/static.tflite --data dataset/processed/static.npz
python evaluate.py --model ../flutter_app/assets/models/dynamic.tflite --data dataset/processed/dynamic.npz
```

## Conectores con Flutter

- Vector estático: `16` floats = 5 flex + 3 accel + 3 gyro + 5 diffs (igual que `LsmClassifier` en Flutter).
- Ventana dinámica: `[60, 11]` = 5 flex + 3 accel + 3 gyro por frame.
- Los modelos deben exportarse con `softmax` en la salida para que Flutter pueda leer probabilidades.

## Notas

- Se requiere al menos 2 clases para entrenar.
- Para INT8 se usa un dataset representativo; si los resultados empeoran, entrena primero en FP32 y prueba variante cuantizada luego.
- El `label_map.json` debe copiarse junto con los modelos a los assets de Flutter o descargarse de backend.

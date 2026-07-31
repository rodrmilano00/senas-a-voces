# Pipeline de entrenamiento — Señas a Voces

> **[← Volver al README principal](../README.md)**

Scripts Python para capturar datos del guante, preprocesarlos, entrenar modelos estático y dinámico, y exportarlos a `.tflite` para la app Flutter.

## Estructura

```
python_pipeline/
├── config.py              constantes compartidas
├── capture.py             captura BLE desde el ESP32-S3
├── preprocess.py          segmenta señas y extrae features
├── train_static.py        entrena MLP estático
├── train_dynamic.py       entrena CNN+LSTM dinámico
├── evaluate.py            evalúa un .tflite contra .npz
└── requirements.txt
```

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

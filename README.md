# Señas a Voces

Plataforma integral de aprendizaje y traducción de Lengua de Señas Mexicana (LSM).
El repositorio contiene **4 proyectos** que trabajan juntos: una web educativa,
una app Android de traducción por cámara, el firmware de un guante instrumentado,
y un pipeline de entrenamiento de modelos.

---

## Estructura del repositorio

```
senas-a-voces/
├── (raíz)                  → 1. Web App (Vite + React + Tailwind)
├── flutter_app/            → 2. App Android (Flutter + MediaPipe)
├── firmware/               → 3. Firmware ESP32-S3 (PlatformIO)
├── python_pipeline/        → 4. Pipeline de entrenamiento (Python)
├── docs/                   → Documentación del producto y branding
├── public/                 → Assets web (logos, training_data, videos)
├── src/                    → Código fuente web
└── _archive/               → Proyectos obsoletos de prueba
```

---

## 1. Web App — Señas a Voces Academy

**Carpeta:** raíz del repositorio (`/`)
**Stack:** Vite, React 19, Tailwind CSS 3, MediaPipe Tasks Vision

Aplicación web SPA para aprender LSM con módulos, práctica inmersiva con cámara
y retroalimentación visual. Reconoce letras, números y palabras dinámicas usando
MediaPipe HandLandmarker + PoseLandmarker + FaceLandmarker en el navegador.

### Cómo empezar

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # genera dist/
```

### Estructura

- `src/main.jsx` — App completa (componentes, pantallas, lógica de detección)
- `src/lsm_detector.js` — Detector de letras/números estáticos (templates geométricos)
- `src/dynamic_sign_detector.js` — Detector de palabras dinámicas (DTW)
- `src/lessons_glosario.js` — Currículo y lecciones
- `src/styles.css` — Estilos globales
- `public/training_data/` — Patrones DTW en JSON (señas entrenadas)
- `public/videos/` — Videos de referencia

### Pantallas

- `/` — Inicio de sesión
- `/signup` — Registro
- `/dashboard` — Progreso y estadísticas
- `/learn` — Ruta de aprendizaje con módulos
- `/practice` — Práctica inmersiva con cámara y detección en vivo

### Documentación

- `docs/brand-spec.md` — Especificación de marca (colores, tipografía, layout)
- `docs/PRODUCT.md` — Visión del producto y principios de diseño

---

## 2. App Android — Traducción por cámara

**Carpeta:** `flutter_app/`
**Stack:** Flutter, MediaPipe Tasks Vision (nativo Android), CameraX, DTW

App Android que usa la cámara del teléfono para reconocer señas LSM en tiempo
real: letras estáticas, números, palabras dinámicas (DTW) y expresiones faciales.
Convierte el resultado a voz con TTS.

### Cómo empezar

```bash
cd flutter_app
flutter pub get
flutter run              # debug en dispositivo conectado
flutter build apk --release   # APK en build/app/outputs/flutter-apk/
```

### Requisitos

- Flutter SDK 3.19+
- Android SDK + teléfono con depuración USB
- Modelos MediaPipe en `android/app/src/main/assets/`:
  - `hand_landmarker.task`
  - `face_landmarker.task` (opcional, desactivado por rendimiento)

Descargar modelos:
```powershell
$dst = "android/app/src/main/assets"
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" -OutFile "$dst/hand_landmarker.task"
```

### Arquitectura

```
flutter_app/lib/
├── main.dart                         Entry point
├── engine/
│   ├── landmark.dart                 Modelo de landmark (21 puntos)
│   ├── hand_shape_detector.dart      Detector de letras/números estáticos
│   └── dynamic_sign_detector.dart    Detector DTW de palabras dinámicas
├── services/
│   ├── vision_service.dart           Bridge nativo (EventChannel)
│   ├── sign_translation_service.dart Combina seña + expresión + frase
│   ├── expression_detector.dart      Detección de expresiones faciales
│   ├── training_data_loader.dart     Carga patrones DTW desde assets
│   ├── ble_manager.dart              BLE para guante (futuro)
│   ├── lsm_classifier.dart           Clasificador TFLite (futuro)
│   └── tts_service.dart              Text-to-Speech
├── ui/
│   ├── live_translation_page.dart    Pantalla principal (cámara + overlay)
│   ├── hand_overlay_painter.dart     CustomPainter del esqueleto de mano
│   ├── home_page.dart                Pantalla de inicio
│   ├── calibration_page.dart         Calibración del guante
│   └── conversation_page.dart        Modo conversación
├── models/sensor_packet.dart         Parsing paquete BLE (30 bytes)
├── providers/app_providers.dart      Riverpod
└── theme/brand.dart                  Colores de marca
```

### Nativo Android

- `android/.../VisionPlugin.kt` — CameraX + MediaPipe HandLandmarker en LIVE_STREAM
- Emite landmarks por EventChannel a Flutter
- Preview a 640×480, análisis a 256×192 (ambos 4:3)

### Entrenar señas nuevas

1. Graba ejemplos desde la web (`/practice`) y exporta el JSON de frames.
2. Copia a `flutter_app/assets/training_data/<categoria>/NOMBRE_1.json`
3. Añade `"NOMBRE"` al `manifest.json` de la categoría.
4. Recompila: `flutter build apk --release`

### Documentación

- `flutter_app/BUILD_Y_DISTRIBUCION.md` — Guía de build, instalación y distribución por QR
- `flutter_app/qr_descarga.html` — Generador de QR para distribución

---

## 3. Firmware — Guante ESP32-S3

**Carpeta:** `firmware/`
**Stack:** PlatformIO, Arduino, ESP32-S3-WROOM-1 N16R8, NimBLE

Firmware del guante instrumentado con 5 sensores flex y IMU BMI160.
Transmite datos por BLE a la app Flutter para clasificación de señas.

### Cómo empezar

```bash
cd firmware
pio run -t upload          # compilar y subir al ESP32-S3
pio device monitor         # monitor serie (115200 baud)
```

### Hardware conectado

| Componente    | GPIO  | Notas                           |
|---------------|-------|---------------------------------|
| Flex pulgar   | GPIO15| Divisor ZD10-100 + 10kΩ         |
| Flex índice   | GPIO7 |                                 |
| Flex medio    | GPIO6 |                                 |
| Flex anular   | GPIO5 |                                 |
| Flex meñique  | GPIO4 |                                 |
| BMI160 SDA    | GPIO16| I2C                             |
| BMI160 SCL    | GPIO17| I2C                             |
| LED onboard   | GPIO47| RGB                             |

### BLE GATT

- **Service:** `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **Data (Notify):** `6e400002-...` — 30 bytes little-endian
- **Command (Write):** `6e400003-...` — 1 byte (OPEN, FIST, SAVE, CLEAR, LED)

### Calibración

1. Mano abierta → enviar `0x01` (OPEN)
2. Puño cerrado → enviar `0x02` (FIST)
3. Guardar → enviar `0x03` (SAVE) — persiste en NVS

### Documentación

- `firmware/docs/BLE_PROTOCOL.md` — Protocolo BLE detallado
- `firmware/docs/HARDWARE_CONNECTIONS.md` — Conexiones de hardware
- `firmware/docs/SEQUENCE_DIAGRAM.md` — Diagrama de secuencia

---

## 4. Pipeline de entrenamiento — Python

**Carpeta:** `python_pipeline/`
**Stack:** Python, TensorFlow, NumPy

Scripts para capturar datos del guante, preprocesarlos, entrenar modelos
estático (MLP) y dinámico (CNN+LSTM), y exportarlos a `.tflite` para la app Flutter.

### Cómo empezar

```bash
cd python_pipeline
python -m venv .venv
.venv\Scripts\activate         # Windows
pip install -r requirements.txt
```

### Flujo

```bash
# 1. Capturar ejemplos por BLE
python capture.py --label POR_FAVOR --duration 10

# 2. Preprocesar (segmenta y extrae features)
python preprocess.py

# 3. Entrenar
python train_static.py --epochs 100 --int8
python train_dynamic.py --epochs 120 --int8

# 4. Evaluar
python evaluate.py --model ../flutter_app/assets/models/static.tflite --data dataset/processed/static.npz
```

### Salida

- `flutter_app/assets/models/static.tflite` — Modelo estático `[1, 16]`
- `flutter_app/assets/models/dynamic.tflite` — Modelo dinámico `[1, 60, 11]`

---

## Cómo fluye el trabajo entre proyectos

```
[Guante ESP32-S3]  →  [Python Pipeline]  →  [App Flutter]
  firmware/              python_pipeline/        flutter_app/
  Sensores + BLE         Captura + Entrenamiento  Inferencia + TTS
                         ↓
                    Modelos .tflite
                         ↓
                    flutter_app/assets/models/

[Web App]  ←  training_data/  →  [App Flutter]
  raíz /          patrones DTW        flutter_app/assets/training_data/
  Práctica web    JSON de frames      Mismos patrones en Android
```

1. El **guante** (firmware) captura señas y las envía por BLE.
2. El **pipeline Python** entrena modelos con esos datos y exporta `.tflite`.
3. La **app Flutter** usa los modelos para clasificar en tiempo real.
4. La **web app** y la **app Flutter** comparten `training_data/` (patrones DTW en JSON).

---

## Notas para colaboradores

- Cada subproyecto tiene su propio `README.md` con instrucciones detalladas.
- `docs/` contiene especificaciones de producto y branding.
- `_archive/` contiene proyectos de prueba obsoletos (no usar en producción).
- Los colores y la identidad visual están en `docs/brand-spec.md`.
- Para añadir señas nuevas, ver la sección "Entrenar señas nuevas" en cada proyecto.

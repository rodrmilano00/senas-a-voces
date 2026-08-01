# Guía para Colaboradores — Modelos DTW Entrenados

Esta guía explica cómo usar, probar y extender los modelos de reconocimiento
de señas LSM ya entrenados en este repositorio.

---

## ¿Qué hay entrenado?

Se procesaron **227 señas** a partir de videos reales de LSM, cada una con
24 frames de landmarks de mano extraídos con MediaPipe HandLandmarker.

| Categoría  | Señas | Ejemplos |
|------------|-------|----------|
| `numeros`  | 40    | 1-30, 50-100, 200-500 |
| `palabras` | 159   | Saludos, verbos, preguntas, meses, días, alimentos, adjetivos, pronombres |
| `familia`  | 18    | Abuela/o, bebé, cuñada/o, hermana/o, mamá, papá, prima/o, sobrina/o, suegra/o, tío, nieta |
| `colores`  | 10    | Amarillo, azul, blanco, gris, morado, negro, rojo, rosa, verde |
| **Total**  | **227** | |

Los patrones viven en dos ubicaciones idénticas:

- **Web:** `public/training_data/<categoria>/<SEÑA>_<n>.json`
- **Flutter:** `flutter_app/assets/training_data/<categoria>/<SEÑA>_<n>.json`

Cada categoría tiene su entrada en `manifest.json` con la lista de señas disponibles.

---

## 1. Probar en la Web

### Requisitos

- Node.js 18+
- Navegador con cámara web (Chrome/Edge recomendado)

### Pasos

```bash
git clone https://github.com/rodrmilano00/senas-a-voces.git
cd senas-a-voces
npm install
npm run dev
```

Abrir `http://localhost:5173`, ir a **Práctica**, permitir la cámara y
seleccionar una categoría. La web carga automáticamente todos los patrones
DTW desde `public/training_data/manifest.json`.

### Cómo funciona el reconocimiento

1. MediaPipe HandLandmarker extrae 21 landmarks de la mano en cada frame.
2. Se calculan `fingerStates` (ángulos articulares, extensión, orientación).
3. Se construye un vector de features de 12 dimensiones + velocidad de muñeca.
4. El algoritmo **DTW** (Dynamic Time Warping) compara la secuencia en vivo
   contra cada patrón entrenado.
5. Si la distancia DTW es menor al umbral (0.80) con margen suficiente (0.08),
   se reconoce la seña.

---

## 2. Probar en Android (Flutter)

### Requisitos

- Flutter SDK 3.19+
- Android SDK
- Teléfono Android con depuración USB activada
- Modelo `hand_landmarker.task` en `android/app/src/main/assets/`

### Pasos

```bash
cd flutter_app
flutter pub get

# Conectar teléfono por USB
flutter run                          # modo debug
# o
flutter build apk --release          # genera APK en build/app/outputs/flutter-apk/
```

### Instalar el APK

```bash
adb install build/app/outputs/flutter-apk/app-release.apk
```

O usar el generador QR en `flutter_app/qr_descarga.html` para distribuir el APK.

### Cómo funciona en Android

1. `VisionPlugin.kt` usa CameraX + MediaPipe en `LIVE_STREAM`.
2. Los landmarks se envían a Flutter por `EventChannel`.
3. `training_data_loader.dart` carga los patrones desde `assets/training_data/`.
4. `dynamic_sign_detector.dart` ejecuta DTW igual que la web.
5. El resultado se muestra en pantalla y se lee con TTS.

---

## 3. Añadir Señas Nuevas

### Opción A: Desde la Web (grabación en vivo)

1. Entrar a `/practice` en la web.
2. Grabar una seña repetidas veces.
3. Exportar el JSON de frames.
4. Guardar en `public/training_data/<categoria>/NOMBRE_1.json`.
5. Copiar también a `flutter_app/assets/training_data/<categoria>/`.
6. Añadir `"NOMBRE"` al `manifest.json` en ambas ubicaciones.
7. Recompilar la app Flutter.

### Opción B: Desde videos MP4 (recomendado para lotes)

Usar el script `python_pipeline/extract_from_videos.py`:

```bash
cd python_pipeline
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-video.txt

# Procesar una carpeta de videos
python extract_from_videos.py --input "C:\ruta\a\videos" --category palabras
```

El script:
- Extrae landmarks de cada video con MediaPipe.
- Segmenta por movimiento (opcional con `--segment`).
- Remuestrea a 24 frames.
- Escribe JSON en `public/training_data/` y `flutter_app/assets/training_data/`.
- Actualiza `manifest.json` automáticamente.

### Categorías disponibles

| Categoría     | Descripción                          |
|---------------|--------------------------------------|
| `numeros`     | Números en LSM                       |
| `palabras`    | Palabras y verbos diversos           |
| `familia`     | Miembros de la familia               |
| `colores`     | Nombres de colores                   |
| `salud`       | Términos médicos (vacío por ahora)   |
| `tecnologia`  | Términos de tecnología (vacío)       |
| `expresiones` | Expresiones y frases (vacío)         |

---

## 4. Estructura de un Patrón DTW

C archivo `<SEÑA>_<n>.json` tiene esta estructura:

```json
{
  "timestamp": "2026-07-31T19:18:17Z",
  "videoTime": 0.0,
  "sign": "AMARILLO",
  "autoDetected": false,
  "score": 0,
  "frames": [
    {
      "fingerStates": { ... },
      "landmarks": [
        { "x": 0.5, "y": 0.3, "z": -0.1 },
        ...  // 21 landmarks
      ]
    },
    ...  // 24 frames
  ]
}
```

- **`fingerStates`**: Ángulos, extensión y orientación de cada dedo.
- **`landmarks`**: 21 puntos normalizados [0-1] de la mano.
- **24 frames**: Secuencia temporal remuestreada para DTW.

> **Nota:** La app Flutter recalcula `fingerStates` desde los `landmarks` al
> cargar, así que el campo `fingerStates` en el JSON es informativo.

---

## 5. Flujo de Trabajo para Colaboradores

### Clonar y configurar

```bash
git clone https://github.com/rodrmilano00/senas-a-voces.git
cd senas-a-voces
git checkout feature/debug

# Web
npm install

# Flutter
cd flutter_app
flutter pub get

# Python (para procesar videos)
cd ../python_pipeline
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-video.txt
```

### Hacer cambios y subir

```bash
git add -A
git commit -m "Descripción del cambio"
git push origin feature/debug
```

### Verificar que todo funcione

1. **Web:** `npm run dev` → ir a Práctica → probar reconocimiento.
2. **Flutter:** `flutter run` → abrir la app → probar con cámara.
3. **Manifests:** Verificar que `manifest.json` tenga las señas correctas.

---

## 6. Problemas Comunes

### La app no reconoce las señas nuevas

- Verificar que el JSON esté en `flutter_app/assets/training_data/<categoria>/`.
- Verificar que el nombre esté en `manifest.json`.
- Recompilar con `flutter build apk --release` (los assets se empaquetan al compilar).

### MediaPipe no detecta la mano

- Asegurar buena iluminación.
- Fondo contrastante (mano visible contra pared clara).
- La mano debe estar dentro del cuadro de la cámara.

### El modelo `hand_landmarker.task` falta

```powershell
$dst = "flutter_app/android/app/src/main/assets"
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" -OutFile "$dst/hand_landmarker.task"
```

### Los manifests no coinciden

Los manifests de web y Flutter deben ser idénticos. Para reconstruirlos:

```powershell
# Desde la raíz del proyecto
function Build-Manifest($root) {
    $cats = @("numeros","palabras","familia","colores","salud","tecnologia","expresiones")
    $manifest = [ordered]@{}
    foreach($cat in $cats) {
        $labels = @()
        $dir = "$root\$cat"
        if(Test-Path $dir) {
            $labels = Get-ChildItem "$dir\*.json" -Name |
                ForEach-Object { ($_ -replace '_\d+\.json$','') } |
                Sort-Object -Unique
        }
        $manifest[$cat] = $labels
    }
    $manifest | ConvertTo-Json -Depth 5 |
        Out-File "$root\manifest.json" -Encoding UTF8 -NoNewline
}
Build-Manifest "public\training_data"
Build-Manifest "flutter_app\assets\training_data"
```

---

## 7. Roadmap

- [ ] Integrar OpenAI Vision (GPT-4o) como fallback cuando DTW no reconozca.
- [ ] Añadir más ejemplos por seña (múltiples repeticiones mejoran DTW).
- [ ] Categorías `salud`, `tecnologia` y `expresiones` con contenido.
- [ ] Exportar modelo `.tflite` entrenado con datos del guante (pipeline Python).
- [ ] Modo conversación con traducción bidireccional.

---

## Contacto

- **Repo:** https://github.com/rodrmilano00/senas-a-voces
- **Branch activa:** `feature/debug`
- **Issues:** Reportar en GitHub Issues

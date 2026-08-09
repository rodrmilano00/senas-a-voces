# Señas a Voces — App de traducción en vivo (Android)

Traducción de LSM en vivo por cámara: reconoce letras, números y palabras
entrenadas (DTW) + expresiones faciales, y las convierte a voz (TTS).

## 1. Requisitos previos

- Flutter SDK (3.19+; recomendado 3.24+)
- Android SDK + un teléfono Android con depuración USB activada
- Los modelos de MediaPipe en `android/app/src/main/assets/`:
  - `hand_landmarker.task`
  - `face_landmarker.task`

Descarga de modelos (desde la carpeta `flutter_app`):

```powershell
$dst = "android/app/src/main/assets"
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" -OutFile "$dst/hand_landmarker.task"
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -OutFile "$dst/face_landmarker.task"
```

## 2. Compilar el APK

```powershell
flutter pub get
flutter build apk --release
```

El APK queda en:

```
build/app/outputs/flutter-apk/app-release.apk
```

## 3. Instalar directo en el teléfono (cable)

```powershell
flutter install
# o
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

## 4. Distribución "solo por QR"

1. Sube `app-release.apk` a un enlace público (Google Drive con enlace directo,
   GitHub Releases, o tu servidor). Ejemplo GitHub Releases:
   `https://github.com/CesarCastilloM/SenasAVoces/releases/download/v1/app-release.apk`
2. Abre `qr_descarga.html` (en esta carpeta), pega esa URL y genera el QR.
3. Imprime o comparte el QR. Al escanearlo, el teléfono descarga el APK.
   (El usuario debe permitir "instalar apps de orígenes desconocidos").

## 5. Entrenar señas nuevas (después)

Las señas viven en `assets/training_data/<categoria>/<SEÑA>_<n>.json` y se
listan en `assets/training_data/manifest.json`. Para añadir una seña:

1. Graba ejemplos (con la herramienta web existente en `/src`) y exporta el JSON
   de frames (array con `landmarks` de 21 puntos por frame).
2. Copia el archivo a `assets/training_data/<categoria>/NOMBRE_1.json`,
   `NOMBRE_2.json`, etc.
3. Añade `"NOMBRE"` a la categoría correspondiente en `manifest.json`.
4. Recompila. La app carga automáticamente todos los patrones al abrir.

## Arquitectura

- `lib/engine/` — motor de detección portado desde el web (forma de mano + DTW).
- `lib/services/vision_service.dart` — recibe landmarks del nativo (MediaPipe).
- `android/.../VisionPlugin.kt` — CameraX + MediaPipe HandLandmarker/FaceLandmarker.
- `lib/services/sign_translation_service.dart` — combina seña + expresión + frase.
- `lib/ui/live_translation_page.dart` — pantalla principal.

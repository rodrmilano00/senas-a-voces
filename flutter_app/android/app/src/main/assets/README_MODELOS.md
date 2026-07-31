# Modelos MediaPipe (requeridos)

La app usa dos modelos on-device de MediaPipe Tasks Vision. Deben estar en esta
carpeta antes de compilar:

- `hand_landmarker.task`  — 21 landmarks por mano
- `face_landmarker.task`  — malla facial + blendshapes (expresiones)

## Descarga automatica (PowerShell)

Desde la raiz del proyecto Flutter (`flutter_app`):

```powershell
$dst = "android/app/src/main/assets"
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" -OutFile "$dst/hand_landmarker.task"
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -OutFile "$dst/face_landmarker.task"
```

Ambos modelos son gratuitos y publicados por Google para MediaPipe.

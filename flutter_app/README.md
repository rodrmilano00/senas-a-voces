# Señas a Voces — App Flutter

> **[← Volver al README principal](../README.md)**

Aplicación Android (y potencialmente iOS) para recibir datos del guante ESP32-S3, clasificar señas LSM en tiempo real y reproducir voz.

## Arquitectura

```
lib/
├── main.dart                    entrypoint con Riverpod
├── models/sensor_packet.dart    parsing del paquete BLE de 30 bytes
├── services/
│   ├── ble_manager.dart         scan, connect, reconnect, comandos
│   ├── lsm_classifier.dart      modelos TFLite estático + dinámico
│   └── tts_service.dart         ElevenLabs con caché MP3
├── providers/
│   └── app_providers.dart       Riverpod wrappers
└── ui/
    ├── home_page.dart           pantalla principal
    └── calibration_page.dart    calibración del guante
```

## Dependencias principales

- `flutter_blue_plus` — BLE
- `permission_handler` — permisos Android
- `tflite_flutter` — inferencia local
- `http` + `just_audio` + `path_provider` — TTS ElevenLabs
- `flutter_riverpod` — estado

## Configuración

1. Coloca los modelos entrenados en:
   - `assets/models/static.tflite`
   - `assets/models/dynamic.tflite`

2. Agrega tu API key de ElevenLabs en `lib/main.dart` al crear `TtsService` (o usa inyección). Por defecto usa `eleven_multilingual_v2`.

3. Permisos Android ya están en `AndroidManifest.xml`.

## Ejecutar

```bash
cd flutter_app
flutter pub get
flutter run
```

## Corrección gramatical con OpenAI (pantalla "Voz a texto")

`ConversationPage` (`lib/ui/conversation_page.dart`) escucha por micrófono
(`speech_to_text`, reconocimiento en la nube para mejor precisión), corrige
la gramática/puntuación del texto transcrito con la API de OpenAI
(`lib/services/grammar_service.dart`), y puede repetir el texto por voz
(`TtsService`). Si no se provee `OPENAI_API_KEY`, la corrección se omite y
se usa el texto transcrito tal cual (sin errores).

Para habilitar la corrección, pasa la key como variable de entorno en tiempo
de compilación (**nunca la hardcodees ni la subas al repo**):

```bash
flutter run --dart-define=OPENAI_API_KEY=sk-... --dart-define=ELEVENLABS_API_KEY=...
```

o en `flutter build apk --release --dart-define=OPENAI_API_KEY=sk-...`.

## Flujo de uso

1. Encender el guante (LED parpadeando).
2. Presionar **Buscar guante** en la app.
3. Seleccionar el dispositivo `SenasAVoces-Glove-R`.
4. Calibrar desde el ícono de ajustes (mano abierta → puño → guardar).
5. Hacer señas. La app mostrará el resultado y lo reproducirá por TTS.

## Notas

- El clasificador intenta primero el modelo dinámico si detecta movimiento; si falla, usa el modelo estático.
- Los modelos `.tflite` deben tener el mismo input shape que usa `LsmClassifier`:
  - estático: `[1, 16]`
  - dinámico: `[1, 60, 11]`
- Usa un `LabelMap` externo para convertir índices de salida a palabras (no está hardcodeado en `lsm_classifier.dart`).

# Reglas requeridas por MediaPipe Tasks Vision para funcionar con
# minificacion/ofuscacion R8 (bug conocido: sin estas reglas, los mensajes
# protobuf internos de MediaPipe fallan con "Field platform_ for X not
# found" al crear HandLandmarker/FaceLandmarker).
# https://github.com/google-ai-edge/mediapipe/issues/5486
# https://github.com/google-ai-edge/mediapipe/issues/3236
-keep class com.google.mediapipe.** { *; }
-keep class com.google.mediapipe.proto.** { *; }
-keep class com.google.mediapipe.solutioncore.** { *; }
-keep class com.google.protobuf.** { *; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite {
  *;
}
-keep class com.google.common.flogger.** { *; }
-dontwarn com.google.protobuf.**
-dontwarn com.google.mediapipe.**
-dontwarn com.google.common.flogger.**

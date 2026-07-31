import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import '../engine/landmark.dart';

/// Resultado por frame proveniente de MediaPipe (nativo Android).
class VisionFrame {
  /// Manos detectadas: lista de manos, cada una con 21 landmarks.
  final List<List<Landmark>> hands;

  /// Blendshapes faciales (nombre -> score 0..1) para expresiones.
  /// Vacio cuando el frame no trae un resultado facial nuevo (la cara se
  /// infiere 1 de cada N frames por rendimiento).
  final Map<String, double> faceBlendshapes;

  /// True si la camara frontal esta activa (preview espejado).
  final bool mirror;

  /// Dimensiones de la imagen rotada (espacio de coordenadas de landmarks).
  final int imgW;
  final int imgH;

  const VisionFrame({
    required this.hands,
    required this.faceBlendshapes,
    this.mirror = false,
    this.imgW = 1,
    this.imgH = 1,
  });

  bool get hasHand => hands.isNotEmpty;
  List<Landmark>? get primaryHand => hands.isNotEmpty ? hands.first : null;
}

/// Puente con el codigo nativo (CameraX + MediaPipe Tasks Vision).
/// El nativo abre la camara, corre HandLandmarker + FaceLandmarker en
/// LIVE_STREAM y emite un mapa por frame a traves del EventChannel.
class VisionService {
  static const MethodChannel _method =
      MethodChannel('senasavoces/vision');
  static const EventChannel _events =
      EventChannel('senasavoces/vision_stream');

  Stream<VisionFrame>? _stream;

  /// Inicia la camara y los detectores en el nativo.
  /// [lensDirection]: 'front' o 'back'.
  /// Devuelve el id de textura ya listo para renderizar (o null si fallo).
  Future<int?> start({String lensDirection = 'front'}) async {
    final id = await _method.invokeMethod<int>('start', {'lens': lensDirection});
    return id;
  }

  Future<void> stop() async {
    await _method.invokeMethod('stop');
  }

  Future<int?> switchCamera() async {
    final id = await _method.invokeMethod<int>('switchCamera');
    return id;
  }

  /// Id de textura para renderizar el preview de la camara nativa.
  Future<int?> get previewTextureId async {
    final id = await _method.invokeMethod<int>('getTextureId');
    return id;
  }

  Stream<VisionFrame> get frames {
    _stream ??= _events.receiveBroadcastStream().map(_parse);
    return _stream!;
  }

  VisionFrame _parse(dynamic event) {
    final map = Map<dynamic, dynamic>.from(event as Map);

    // Cada mano llega como Float64List plano [x0,y0,z0, x1,y1,z1, ...].
    final hands = <List<Landmark>>[];
    final rawHands = map['hands'];
    if (rawHands is List) {
      for (final h in rawHands) {
        if (h is Float64List) {
          final pts = <Landmark>[];
          for (var i = 0; i + 2 < h.length; i += 3) {
            pts.add(Landmark(h[i], h[i + 1], h[i + 2]));
          }
          hands.add(pts);
        }
      }
    }

    final blend = <String, double>{};
    final rawBlend = map['blendshapes'];
    if (rawBlend is Map) {
      rawBlend.forEach((k, v) {
        blend[k.toString()] = (v as num).toDouble();
      });
    }

    final mirror = (map['mirror'] as bool?) ?? false;
    final imgW = (map['imgW'] as num?)?.toInt() ?? 1;
    final imgH = (map['imgH'] as num?)?.toInt() ?? 1;

    return VisionFrame(hands: hands, faceBlendshapes: blend, mirror: mirror, imgW: imgW, imgH: imgH);
  }
}

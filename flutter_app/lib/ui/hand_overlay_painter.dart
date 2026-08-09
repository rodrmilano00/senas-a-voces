import 'package:flutter/material.dart';

import '../engine/landmark.dart';
import '../services/vision_service.dart';

/// Conexiones estandar de MediaPipe HandLandmarker (21 puntos por mano).
const List<List<int>> kHandConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4], // pulgar
  [0, 5], [5, 6], [6, 7], [7, 8], // indice
  [5, 9], [9, 10], [10, 11], [11, 12], // medio
  [9, 13], [13, 14], [14, 15], [15, 16], // anular
  [13, 17], [17, 18], [18, 19], [19, 20], // menique
  [0, 17], // palma
];

/// Dibuja el esqueleto de la(s) mano(s) detectadas sobre el preview de
/// camara. Los landmarks llegan normalizados (0..1) en el espacio de la
/// imagen rotada. Se calcula el rect de BoxFit.contain para mapearlos
/// correctamente sobre el Texture que puede tener distinto aspect ratio.
class HandOverlayPainter extends CustomPainter {
  final VisionFrame frame;

  HandOverlayPainter(this.frame);

  /// Calcula el rect donde el video se muestra realmente dentro del widget.
  /// El Texture esta envuelto en AspectRatio(3:4) + Center, asi que el rect
  /// es el sub-rect 3:4 centrado dentro del canvas.
  Rect _computeDisplayRect(Size canvas) {
    const imgAspect = 3.0 / 4.0; // portrait 3:4
    final canvasAspect = canvas.width / canvas.height;

    double w, h;
    if (imgAspect > canvasAspect) {
      w = canvas.width;
      h = w / imgAspect;
    } else {
      h = canvas.height;
      w = h * imgAspect;
    }

    final x = (canvas.width - w) / 2;
    final y = (canvas.height - h) / 2;
    return Rect.fromLTWH(x, y, w, h);
  }

  Offset _landmarkToOffset(Landmark p, Rect rect) {
    // Los landmarks llegan en el espacio de la imagen rotada 90°.
    // Mapeo base (sin espejo): nx = p.y, ny = 1 - p.x
    // La cámara frontal (selfie) espeja el preview, así que espejamos también.
    // La cámara trasera NO espeja → usamos el mapeo directo.
    final nx = frame.mirror ? (1.0 - p.y) : p.y;
    final ny = 1.0 - p.x;
    return Offset(nx * rect.width + rect.left, ny * rect.height + rect.top);
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (frame.hands.isEmpty) return;

    final rect = _computeDisplayRect(size);

    final linePaint = Paint()
      ..color = const Color(0xFF2AABB8)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final jointPaint = Paint()..color = const Color(0xFFEC9960);
    final tipPaint = Paint()..color = const Color(0xFFFF6600);

    const tipIndices = {4, 8, 12, 16, 20};

    for (final hand in frame.hands) {
      if (hand.length < 21) continue;

      for (final c in kHandConnections) {
        final a = hand[c[0]];
        final b = hand[c[1]];
        canvas.drawLine(
          _landmarkToOffset(a, rect),
          _landmarkToOffset(b, rect),
          linePaint,
        );
      }

      for (var i = 0; i < hand.length; i++) {
        final p = hand[i];
        final offset = _landmarkToOffset(p, rect);
        canvas.drawCircle(
          offset,
          tipIndices.contains(i) ? 4 : 2.5,
          tipIndices.contains(i) ? tipPaint : jointPaint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant HandOverlayPainter oldDelegate) =>
      !identical(frame, oldDelegate.frame);
}

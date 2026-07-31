/// Punto 3D normalizado (x, y en [0,1], z relativo) tal como los entrega
/// MediaPipe HandLandmarker / FaceLandmarker.
class Landmark {
  final double x;
  final double y;
  final double z;

  const Landmark(this.x, this.y, this.z);

  factory Landmark.fromMap(Map<dynamic, dynamic> m) => Landmark(
        (m['x'] as num).toDouble(),
        (m['y'] as num).toDouble(),
        (m['z'] as num?)?.toDouble() ?? 0.0,
      );

  factory Landmark.fromList(List<dynamic> l) => Landmark(
        (l[0] as num).toDouble(),
        (l[1] as num).toDouble(),
        l.length > 2 ? (l[2] as num).toDouble() : 0.0,
      );

  Map<String, double> toMap() => {'x': x, 'y': y, 'z': z};
}

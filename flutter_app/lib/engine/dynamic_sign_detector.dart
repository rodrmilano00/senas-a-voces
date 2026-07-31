import 'dart:math' as math;
import 'landmark.dart';
import 'hand_shape_detector.dart';

/// Puerto Dart de `dynamic_sign_detector.js`.
/// Detecta senas dinamicas (palabras/movimientos) usando DTW sobre secuencias
/// de vectores de caracteristicas. El "modelo entrenado" es una coleccion de
/// secuencias JSON en assets/training_data/.

const double wristWeight = 4;

/// Info por frame: vector de forma, muneca y escala de la mano.
class FrameInfo {
  final List<double> ff;
  final Landmark wrist;
  final double scale;
  const FrameInfo(this.ff, this.wrist, this.scale);
}

/// Vector de caracteristicas invariante (forma de mano) desde FingerStates.
List<double>? featureFromFingerStates(FingerStates? fs) {
  if (fs == null) return null;
  double norm(double? v) => (v ?? 0) / 180.0;
  return [
    norm(fs.ang['index']),
    norm(fs.ang['middle']),
    norm(fs.ang['ring']),
    norm(fs.ang['pinky']),
    norm(fs.ang['thumb']),
    fs.thumb ? 1 : 0,
    fs.index ? 1 : 0,
    fs.middle ? 1 : 0,
    fs.ring ? 1 : 0,
    fs.pinky ? 1 : 0,
    (fs.palmOriY + 1) / 2,
    (fs.fingerOriY + 1) / 2,
  ];
}

FrameInfo? frameInfo(FingerStates? fingerStates, List<Landmark>? landmarks) {
  final ff = featureFromFingerStates(fingerStates);
  if (ff == null || landmarks == null || landmarks.length < 21) return null;
  final wrist = landmarks[0];
  final m = landmarks[9];
  final scale = _nz(_hypot(m.x - wrist.x, m.y - wrist.y), 1e-9);
  return FrameInfo(ff, wrist, scale);
}

/// Construye una secuencia DTW anadiendo velocidad de muneca por frame.
List<List<double>> buildSequence(List<FrameInfo?> infos) {
  final seq = <List<double>>[];
  for (var i = 0; i < infos.length; i++) {
    final cur = infos[i];
    if (cur == null) continue;
    double vx = 0, vy = 0;
    if (i > 0 && infos[i - 1] != null) {
      final prev = infos[i - 1]!;
      vx = (cur.wrist.x - prev.wrist.x) / cur.scale;
      vy = (cur.wrist.y - prev.wrist.y) / cur.scale;
    }
    seq.add([...cur.ff, vx * wristWeight, vy * wristWeight]);
  }
  return seq;
}

double _hypot(double a, double b) => math.sqrt(a * a + b * b);
double _nz(double v, double f) => v == 0 ? f : v;

double _vecDistance(List<double> a, List<double> b) {
  var sum = 0.0;
  final n = math.min(a.length, b.length);
  for (var i = 0; i < n; i++) {
    final d = a[i] - b[i];
    sum += d * d;
  }
  return math.sqrt(sum);
}

double _dtw(List<List<double>> seqA, List<List<double>> seqB) {
  final n = seqA.length, m = seqB.length;
  if (n == 0 || m == 0) return double.infinity;
  var prev = List<double>.filled(m + 1, double.infinity);
  var curr = List<double>.filled(m + 1, double.infinity);
  prev[0] = 0;
  for (var i = 1; i <= n; i++) {
    curr[0] = double.infinity;
    for (var j = 1; j <= m; j++) {
      final cost = _vecDistance(seqA[i - 1], seqB[j - 1]);
      curr[j] = cost + math.min(prev[j], math.min(curr[j - 1], prev[j - 1]));
    }
    final tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fillRange(0, curr.length, double.infinity);
  }
  return prev[m] / (n + m);
}

class _Pattern {
  final String name;
  final List<List<List<double>>> sequences = [];
  _Pattern(this.name);
}

class DetectResult {
  final String? matched;
  final double score;
  final int confidence;
  final double margin;
  final bool accepted;
  const DetectResult({
    required this.matched,
    required this.score,
    required this.confidence,
    required this.margin,
    required this.accepted,
  });
}

/// Frame crudo de entrenamiento cargado desde JSON.
class TrainingFrame {
  final FingerStates? fingerStates;
  final List<Landmark>? landmarks;
  const TrainingFrame(this.fingerStates, this.landmarks);
}

class DynamicSignDetector {
  final List<_Pattern> _patterns = [];
  final List<List<double>> _buffer = [];
  FrameInfo? _previousInfo;

  int maxBufferSize = 30;
  int minBufferSize = 4;
  double threshold = 0.80;
  double minMargin = 0.08;

  void loadPattern(String name, List<TrainingFrame> frames) {
    final infos = frames
        .map((f) => frameInfo(f.fingerStates, f.landmarks))
        .whereType<FrameInfo>()
        .toList();
    final seq = buildSequence(infos);
    if (seq.isEmpty) return;
    var existing = _patterns.where((p) => p.name == name).firstOrNull;
    if (existing == null) {
      existing = _Pattern(name);
      _patterns.add(existing);
    }
    final isDuplicate = existing.sequences
        .any((s) => s.length == seq.length && _dtw(s, seq) < 1e-6);
    if (!isDuplicate) existing.sequences.add(seq);
  }

  /// Carga un patron ya como secuencia de vectores (frames = lista de landmarks).
  void loadPatternFromLandmarks(String name, List<List<Landmark>> frames) {
    final tf = frames
        .map((lms) => TrainingFrame(computeFingerStates(lms), lms))
        .toList();
    loadPattern(name, tf);
  }

  void clearPatterns() => _patterns.clear();

  void clearBuffer() {
    _buffer.clear();
    _previousInfo = null;
  }

  void pushFrameInfo(FrameInfo? info) {
    if (info == null) return;
    double vx = 0, vy = 0;
    if (_previousInfo != null) {
      vx = (info.wrist.x - _previousInfo!.wrist.x) / info.scale;
      vy = (info.wrist.y - _previousInfo!.wrist.y) / info.scale;
    }
    _previousInfo = info;
    _pushFrame([...info.ff, vx * wristWeight, vy * wristWeight]);
  }

  void _pushFrame(List<double> featureVector) {
    _buffer.add(featureVector);
    if (_buffer.length > maxBufferSize) _buffer.removeAt(0);
  }

  DetectResult? detect() {
    if (_buffer.length < minBufferSize) return null;
    String? bestMatch;
    var bestScore = double.infinity;
    var secondScore = double.infinity;
    for (final pattern in _patterns) {
      for (final seq in pattern.sequences) {
        final L = seq.length;
        final minW = math.max(minBufferSize, L - 2);
        final maxW = math.min(_buffer.length, L + 8);
        for (var winLen = minW; winLen <= maxW; winLen++) {
          for (var start = 0; start + winLen <= _buffer.length; start++) {
            final window = _buffer.sublist(start, start + winLen);
            final score = _dtw(window, seq);
            if (score < bestScore) {
              secondScore = bestScore;
              bestScore = score;
              bestMatch = pattern.name;
            } else if (score < secondScore) {
              secondScore = score;
            }
          }
        }
      }
    }
    final margin = secondScore - bestScore;
    final confidence = ((1 - bestScore) * 100).round().clamp(0, 100);
    return DetectResult(
      matched: bestMatch,
      score: bestScore,
      confidence: confidence,
      margin: margin,
      accepted: bestScore <= threshold && margin >= minMargin,
    );
  }

  Map<String, dynamic> getStatus() => {
        'patternsLoaded': _patterns.map((p) => p.name).toList(),
        'totalSequences':
            _patterns.fold<int>(0, (a, p) => a + p.sequences.length),
        'bufferSize': _buffer.length,
      };
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}

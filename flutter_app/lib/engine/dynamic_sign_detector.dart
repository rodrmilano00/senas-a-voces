import 'dart:math' as math;
import 'landmark.dart';
import 'hand_shape_detector.dart';

/// Puerto Dart de `dynamic_sign_detector.js`.
/// Detecta senas dinamicas (palabras/movimientos) usando DTW sobre secuencias
/// de vectores de caracteristicas. El "modelo entrenado" es una coleccion de
/// secuencias JSON en assets/app_movil_de_traduccion/.

const double wristWeight = 2.5;
const double accelWeight = 1.5;
const int topK = 3;
const int handDim = 15;
final List<double> zeroHand = List<double>.filled(handDim, 0);

/// Info por frame: vectores de forma, munecas y escala de ambas manos.
class FrameInfo {
  final List<double> ffR;
  final int presentR;
  final Landmark? wristR;
  final List<double> ffL;
  final int presentL;
  final Landmark? wristL;
  final double scale;
  const FrameInfo(this.ffR, this.presentR, this.wristR, this.ffL, this.presentL, this.wristL, this.scale);
}

/// Vector de caracteristicas invariante (forma de UNA mano) desde FingerStates.
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
    // Features adicionales para mejor diferenciación
    (fs.fingerOriZ + 1) / 2,
    fs.palmNormalZ,
    fs.imGap,
  ];
}

/// Separa manos crudas de VisionFrame/JSON en mano derecha/izquierda.
/// [handedness] debe tener el mismo orden/longitud que [hands].
Map<String, List<Landmark>?> splitHands(List<List<Landmark>> hands, List<String> handedness) {
  List<Landmark>? right, left;
  for (var i = 0; i < hands.length; i++) {
    final label = i < handedness.length ? handedness[i] : null;
    if (label == 'Left') {
      left ??= hands[i];
    } else if (label == 'Right') {
      right ??= hands[i];
    } else if (right == null) {
      right = hands[i];
    } else if (left == null) {
      left = hands[i];
    }
  }
  return {'right': right, 'left': left};
}

FrameInfo? frameInfo(List<Landmark>? landmarksRight, List<Landmark>? landmarksLeft) {
  final fsR = (landmarksRight != null && landmarksRight.length >= 21) ? computeFingerStates(landmarksRight) : null;
  final fsL = (landmarksLeft != null && landmarksLeft.length >= 21) ? computeFingerStates(landmarksLeft) : null;
  final ffR = featureFromFingerStates(fsR);
  final ffL = featureFromFingerStates(fsL);
  if (ffR == null && ffL == null) return null;

  // Si solo hay una mano, duplicar sus features al otro slot para que
  // el vector sea invariante a si la mano esta en Right o Left.
  // Para una mano, palmNormalZ se hace simetrica con abs() para que el
  // espejo (x invertido) no cambie el signo de la normal.
  if (ffR != null && ffL == null) {
    final wrist = landmarksRight![0];
    final m = landmarksRight[9];
    final scale = _nz(_hypot(m.x - wrist.x, m.y - wrist.y), 1e-9);
    final ffSym = List<double>.from(ffR);
    ffSym[13] = ffSym[13].abs(); // palmNormalZ mirror-symmetric
    return FrameInfo(ffSym, 1, wrist, ffSym, 1, wrist, scale);
  }
  if (ffL != null && ffR == null) {
    final wrist = landmarksLeft![0];
    final m = landmarksLeft[9];
    final scale = _nz(_hypot(m.x - wrist.x, m.y - wrist.y), 1e-9);
    final ffSym = List<double>.from(ffL);
    ffSym[13] = ffSym[13].abs(); // palmNormalZ mirror-symmetric
    return FrameInfo(ffSym, 1, wrist, ffSym, 1, wrist, scale);
  }

  final refLms = ffR != null ? landmarksRight! : landmarksLeft!;
  final wrist = refLms[0];
  final m = refLms[9];
  final scale = _nz(_hypot(m.x - wrist.x, m.y - wrist.y), 1e-9);
  return FrameInfo(
    ffR ?? zeroHand,
    ffR != null ? 1 : 0,
    ffR != null ? landmarksRight![0] : null,
    ffL ?? zeroHand,
    ffL != null ? 1 : 0,
    ffL != null ? landmarksLeft![0] : null,
    scale,
  );
}

List<double> _handVelocity(Landmark? cur, Landmark? prev, double scale) {
  if (cur == null || prev == null) return [0, 0];
  return [(cur.x - prev.x) / scale, (cur.y - prev.y) / scale];
}

/// Construye una secuencia DTW anadiendo velocidad/aceleracion de cada
/// muneca y la posicion relativa entre ambas manos.
List<List<double>> buildSequence(List<FrameInfo?> infos) {
  final seq = <List<double>>[];
  Landmark? prevWristR, prevWristL;
  double prevVxR = 0, prevVyR = 0, prevVxL = 0, prevVyL = 0;
  for (var i = 0; i < infos.length; i++) {
    final cur = infos[i];
    if (cur == null) continue;
    final velR = _handVelocity(cur.wristR, prevWristR, cur.scale);
    final velL = _handVelocity(cur.wristL, prevWristL, cur.scale);
    final vxR = velR[0], vyR = velR[1], vxL = velL[0], vyL = velL[1];
    final axR = vxR - prevVxR, ayR = vyR - prevVyR;
    final axL = vxL - prevVxL, ayL = vyL - prevVyL;
    prevVxR = vxR; prevVyR = vyR; prevVxL = vxL; prevVyL = vyL;
    if (cur.wristR != null) prevWristR = cur.wristR;
    if (cur.wristL != null) prevWristL = cur.wristL;

    double relDx = 0, relDy = 0, relPresent = 0;
    if (cur.wristR != null && cur.wristL != null) {
      relDx = (cur.wristL!.x - cur.wristR!.x) / cur.scale;
      relDy = (cur.wristL!.y - cur.wristR!.y) / cur.scale;
      relPresent = 1;
    }

    seq.add([
      ...cur.ffR, cur.presentR.toDouble(),
      ...cur.ffL, cur.presentL.toDouble(),
      relDx, relDy, relPresent,
      vxR * wristWeight, vyR * wristWeight, axR * accelWeight, ayR * accelWeight,
      vxL * wristWeight, vyL * wristWeight, axL * accelWeight, ayL * accelWeight,
    ]);
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
  // Normalizar por la dimension para que la distancia no crezca con el
  // numero de features. Asi un vector de 35 dims da valores comparables
  // a uno de 12 dims.
  return math.sqrt(sum) / math.sqrt(n.toDouble());
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
  return prev[m] / math.max(n, m);
}

/// Subsequence DTW: encuentra la mejor subsecuencia del buffer que coincide
/// con el patrón completo, ignorando frames idle al inicio.
/// Normaliza por la longitud del match real (no por m) para que un buffer
/// corto no produzca distancias artificialmente bajas.
double _dtwSubseq(List<List<double>> buffer, List<List<double>> pattern) {
  final n = buffer.length, m = pattern.length;
  if (n == 0 || m == 0) return double.infinity;
  // No intentar si el buffer es mucho más corto que el patrón:
  // el subsequence DTW necesita al menos el 60% del patrón para ser fiable.
  if (n < m * 0.6) return double.infinity;

  var prev = List<double>.filled(m + 1, 0);
  var curr = List<double>.filled(m + 1, double.infinity);
  var bestEnd = double.infinity;
  var bestLen = 0;
  // Track de longitud del camino para normalización correcta.
  var prevLen = List<int>.filled(m + 1, 0);
  var currLen = List<int>.filled(m + 1, 0);

  for (var i = 1; i <= n; i++) {
    curr[0] = double.infinity;
    currLen[0] = 0;
    for (var j = 1; j <= m; j++) {
      final cost = _vecDistance(buffer[i - 1], pattern[j - 1]);
      // Elegir el camino minimo y trackear su longitud.
      final candidates = [
        (prev[j], prevLen[j]),
        (curr[j - 1], currLen[j - 1]),
        (prev[j - 1], prevLen[j - 1]),
      ];
      var bestCost = candidates[0].$1;
      var bestL = candidates[0].$2;
      for (var c = 1; c < candidates.length; c++) {
        if (candidates[c].$1 < bestCost) {
          bestCost = candidates[c].$1;
          bestL = candidates[c].$2;
        }
      }
      curr[j] = cost + bestCost;
      currLen[j] = bestL + 1;
    }
    if (curr[m] < bestEnd) {
      bestEnd = curr[m];
      bestLen = currLen[m];
    }
    final tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fillRange(0, curr.length, double.infinity);
    final tmpL = prevLen;
    prevLen = currLen;
    currLen = tmpL;
    currLen.fillRange(0, currLen.length, 0);
  }
  final normLen = bestLen > 0 ? bestLen : m;
  return bestEnd / normLen;
}

class _Pattern {
  final String name;
  final List<List<List<double>>> sequences = [];
  bool oneHanded = false;
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
  final List<Landmark>? landmarksRight;
  final List<Landmark>? landmarksLeft;
  const TrainingFrame(this.landmarksRight, this.landmarksLeft);
}

class DynamicSignDetector {
  final List<_Pattern> _patterns = [];
  final List<List<double>> _buffer = [];
  FrameInfo? _previousInfo;
  bool _twoHandsNow = false;
  double _prevVxR = 0, _prevVyR = 0, _prevVxL = 0, _prevVyL = 0;

  int maxBufferSize = 150;
  int minBufferSize = 30;
  double threshold = 0.25;
  double minMargin = 0.0;

  void loadPattern(String name, List<TrainingFrame> frames) {
    // Detectar si hay desbalance de manos (todo en Left, nada en Right)
    int rightCount = 0, leftOnlyCount = 0, bothCount = 0;
    for (final f in frames) {
      final hasR = f.landmarksRight != null && f.landmarksRight!.length >= 21;
      final hasL = f.landmarksLeft != null && f.landmarksLeft!.length >= 21;
      if (hasR) rightCount++;
      if (hasR && hasL) bothCount++;
      if (hasL && !hasR) leftOnlyCount++;
    }
    final leftTotal = leftOnlyCount + bothCount;
    final shouldSwap = leftTotal > frames.length * 0.7 && rightCount < frames.length * 0.15;

    final normalizedFrames = shouldSwap
        ? frames.map((f) => TrainingFrame(flipHand(f.landmarksLeft), f.landmarksRight)).toList()
        : frames;

    // Detectar señas de una sola mano: o bien solo una mano presente,
    // o bien una mano tiene mucho menos movimiento que la otra.
    final anyHand = normalizedFrames.length;
    int oneHandedCount = 0;
    double totalRightMotion = 0, totalLeftMotion = 0;
    Landmark? prevWR, prevWL;
    for (final f in normalizedFrames) {
      final hasR = f.landmarksRight != null && f.landmarksRight!.length >= 21;
      final hasL = f.landmarksLeft != null && f.landmarksLeft!.length >= 21;
      if ((hasR && !hasL) || (!hasR && hasL)) oneHandedCount++;
      if (hasR && f.landmarksRight!.isNotEmpty) {
        final w = f.landmarksRight![0];
        if (prevWR != null) {
          totalRightMotion += (w.x - prevWR!.x).abs() + (w.y - prevWR!.y).abs();
        }
        prevWR = w;
      }
      if (hasL && f.landmarksLeft!.isNotEmpty) {
        final w = f.landmarksLeft![0];
        if (prevWL != null) {
          totalLeftMotion += (w.x - prevWL!.x).abs() + (w.y - prevWL!.y).abs();
        }
        prevWL = w;
      }
    }
    final oneHandedByPresence = anyHand > 0 && oneHandedCount > anyHand * 0.6;
    // Si una mano tiene >5x mas movimiento que la otra, es seña de una mano.
    final maxMotion = math.max(totalRightMotion, totalLeftMotion);
    final minMotion = math.min(totalRightMotion, totalLeftMotion);
    final oneHandedByMotion = maxMotion > 0 && minMotion / maxMotion < 0.2;
    final isOneHanded = oneHandedByPresence || oneHandedByMotion;

    List<List<double>> build(List<TrainingFrame> fs) {
      final infos = fs
          .map((f) => frameInfo(f.landmarksRight, f.landmarksLeft))
          .whereType<FrameInfo>()
          .toList();
      return buildSequence(infos);
    }

    final seq = build(normalizedFrames);
    if (seq.isEmpty) return;
    final found = _patterns.where((p) => p.name == name).firstOrNull;
    final existing = found ?? _Pattern(name);
    if (found == null) _patterns.add(existing);
    existing.oneHanded = isOneHanded;

    void addSeq(List<List<double>> s) {
      if (s.isEmpty) return;
      final isDup = existing.sequences
          .any((es) => es.length == s.length && _dtw(es, s) < 1e-6);
      if (!isDup) existing.sequences.add(s);
    }

    addSeq(seq);

    if (isOneHanded) {
      final mirroredFrames = normalizedFrames.map((f) {
        final hand = f.landmarksRight ?? f.landmarksLeft;
        final flipped = flipHand(hand);
        return TrainingFrame(
          f.landmarksRight != null ? flipped : null,
          f.landmarksLeft != null ? flipped : null,
        );
      }).toList();
      final mirrorSeq = build(mirroredFrames);
      addSeq(mirrorSeq);
    }
  }

  /// Carga un patron ya como secuencia de frames de dos manos.
  void loadPatternFromLandmarks(String name, List<TrainingFrame> frames) {
    loadPattern(name, frames);
  }

  void clearPatterns() => _patterns.clear();

  void clearBuffer() {
    _buffer.clear();
    _previousInfo = null;
    _prevVxR = 0;
    _prevVyR = 0;
    _prevVxL = 0;
    _prevVyL = 0;
  }

  void pushFrameInfo(FrameInfo? info) {
    if (info == null) return;
    final prev = _previousInfo;
    final velR = _handVelocity(info.wristR, prev?.wristR, info.scale);
    final velL = _handVelocity(info.wristL, prev?.wristL, info.scale);
    final vxR = velR[0], vyR = velR[1], vxL = velL[0], vyL = velL[1];
    final axR = vxR - _prevVxR, ayR = vyR - _prevVyR;
    final axL = vxL - _prevVxL, ayL = vyL - _prevVyL;
    _prevVxR = vxR; _prevVyR = vyR; _prevVxL = vxL; _prevVyL = vyL;
    _previousInfo = info;

    double relDx = 0, relDy = 0, relPresent = 0;
    if (info.wristR != null && info.wristL != null) {
      relDx = (info.wristL!.x - info.wristR!.x) / info.scale;
      relDy = (info.wristL!.y - info.wristR!.y) / info.scale;
      relPresent = 1;
    }

    _pushFrame([
      ...info.ffR, info.presentR.toDouble(),
      ...info.ffL, info.presentL.toDouble(),
      relDx, relDy, relPresent,
      vxR * wristWeight, vyR * wristWeight, axR * accelWeight, ayR * accelWeight,
      vxL * wristWeight, vyL * wristWeight, axL * accelWeight, ayL * accelWeight,
    ]);
    _twoHandsNow = info.presentR == 1 && info.presentL == 1;
  }

  void _pushFrame(List<double> featureVector) {
    _buffer.add(featureVector);
    if (_buffer.length > maxBufferSize) _buffer.removeAt(0);
  }

  /// Ranking de todas las señas ordenadas por distancia DTW (menor = mejor).
  /// Usa DTW completo: compara todo el buffer contra todo el patrón.
  /// Solo evalua patrones cuya longitud es similar al buffer (+/- 50%).
  List<MapEntry<String, double>> detectRanking() {
    if (_buffer.length < minBufferSize) return [];
    final buf = _buffer;
    final bufLen = buf.length;
    final ranking = <MapEntry<String, double>>[];
    for (final pattern in _patterns) {
      // Solo comparar señas del mismo tipo de mano (una vs dos).
      if (pattern.oneHanded && _twoHandsNow) continue;
      if (!pattern.oneHanded && !_twoHandsNow) continue;
      var best = double.infinity;
      for (final seq in pattern.sequences) {
        // Solo comparar si el buffer y el patron tienen longitudes similares.
        // Ratio 0.7-1.3: el buffer debe ser 70%-130% del patron.
        final ratio = bufLen / seq.length;
        if (ratio < 0.7 || ratio > 1.3) continue;
        final score = _dtw(buf, seq);
        if (score < best) best = score;
      }
      if (best == double.infinity) continue;
      ranking.add(MapEntry(pattern.name, best));
    }
    ranking.sort((a, b) => a.value.compareTo(b.value));
    return ranking;
  }

  DetectResult? detect() {
    final ranking = detectRanking();
    if (ranking.isEmpty) return null;
    final bestScore = ranking.first.value;
    final bestMatch = ranking.first.key;
    final margin = ranking.length > 1 ? ranking[1].value - bestScore : double.infinity;
    // Confianza: 0% en threshold, 100% en score 0.
    final confidence = bestScore.isFinite
        ? ((1 - bestScore / threshold) * 100).round().clamp(0, 100)
        : 0;
    return DetectResult(
      matched: bestMatch,
      score: bestScore,
      confidence: confidence,
      margin: margin.isFinite ? margin : double.infinity,
      accepted: bestScore.isFinite && bestScore <= threshold && margin >= minMargin,
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

import 'dart:convert';
import 'package:flutter/services.dart';
import '../engine/landmark.dart';
import '../engine/dynamic_sign_detector.dart';

/// Carga los patrones de senas entrenadas (JSON) empaquetados en
/// assets/training_data/ hacia un DynamicSignDetector.
///
/// Estructura esperada:
///   assets/training_data/manifest.json  -> { categoria: [SIGN, ...], ... }
///   assets/training_data/<categoria>/<SIGN>_<n>.json  (array de frames)
class TrainingDataLoader {
  static const String _base = 'assets/training_data';

  /// Devuelve el numero de patrones (senas) cargados.
  Future<int> loadInto(DynamicSignDetector detector) async {
    final manifest = await _readManifest();
    if (manifest.isEmpty) return 0;

    // Lista de todos los assets disponibles para descubrir los _n.json.
    final assetPaths = await _listAssets();

    var loaded = 0;
    for (final entry in manifest.entries) {
      final category = entry.key;
      final signs = entry.value;
      for (final sign in signs) {
        final files = assetPaths
            .where((p) =>
                p.startsWith('$_base/$category/') &&
                _matchesSign(p, category, sign))
            .toList()
          ..sort();
        var any = false;
        for (final path in files) {
          final frames = await _loadFrames(path);
          if (frames.isNotEmpty) {
            detector.loadPatternFromLandmarks(sign, frames);
            any = true;
          }
        }
        if (any) loaded++;
      }
    }
    return loaded;
  }

  bool _matchesSign(String path, String category, String sign) {
    final name = path.substring('$_base/$category/'.length);
    // <SIGN>.json  o  <SIGN>_<n>.json
    return name == '$sign.json' || RegExp('^${RegExp.escape(sign)}_\\d+\\.json\$').hasMatch(name);
  }

  Future<Map<String, List<String>>> _readManifest() async {
    try {
      final raw = await rootBundle.loadString('$_base/manifest.json');
      final obj = jsonDecode(raw) as Map<String, dynamic>;
      return obj.map((k, v) => MapEntry(
            k,
            (v as List).map((e) => e.toString()).toList(),
          ));
    } catch (_) {
      return {};
    }
  }

  Future<List<String>> _listAssets() async {
    try {
      final raw = await rootBundle.loadString('AssetManifest.json');
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return map.keys.where((k) => k.startsWith(_base)).toList();
    } catch (_) {
      return [];
    }
  }

  List<Landmark>? _parseHand(dynamic lms) {
    if (lms is! List || lms.length < 21) return null;
    return lms.map((p) => Landmark.fromMap(Map<dynamic, dynamic>.from(p as Map))).toList();
  }

  Future<List<TrainingFrame>> _loadFrames(String path) async {
    try {
      final raw = await rootBundle.loadString(path);
      final arr = jsonDecode(raw) as List;
      final frames = <TrainingFrame>[];
      for (final f in arr) {
        final m = f as Map<String, dynamic>;
        // Formato nuevo: landmarksRight/landmarksLeft. Formato viejo (legacy):
        // `landmarks` unico, tratado como mano derecha.
        final right = _parseHand(m['landmarksRight'] ?? m['landmarks']);
        final left = _parseHand(m['landmarksLeft']);
        if (right != null || left != null) {
          frames.add(TrainingFrame(right, left));
        }
      }
      return frames;
    } catch (_) {
      return [];
    }
  }
}

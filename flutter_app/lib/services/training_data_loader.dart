import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../engine/landmark.dart';
import '../engine/dynamic_sign_detector.dart';

/// Carga los patrones de senas entrenadas (JSON) empaquetados en
/// assets/app_movil_de_traduccion/ hacia un DynamicSignDetector.
///
/// Estructura esperada:
///   assets/app_movil_de_traduccion/manifest.json  -> { categoria: [SIGN, ...], ... }
///   assets/app_movil_de_traduccion/<categoria>/<SIGN>_<n>.json  (array de frames)
class TrainingDataLoader {
  static const String _base = 'assets/app_movil_de_traduccion';

  /// Devuelve el numero de patrones (senas) cargados.
  Future<int> loadInto(DynamicSignDetector detector) async {
    final manifest = await _readManifest();
    if (manifest.isEmpty) return 0;

    // Solo cargar estas señas.
    const allowed = {'CAFE', 'PAN'};
    var loaded = 0;
    for (final entry in manifest.entries) {
      final category = entry.key;
      final signs = entry.value;
      for (final sign in signs) {
        if (!allowed.contains(sign)) continue;
        // Probar hasta 10 archivos numerados por seña.
        final files = <String>[];
        for (var n = 1; n <= 10; n++) {
          final path = '$_base/$category/${sign}_$n.json';
          try {
            await rootBundle.loadString(path);
            files.add(path);
          } catch (_) {}
        }
        // También probar sin número.
        final basePath = '$_base/$category/$sign.json';
        try {
          await rootBundle.loadString(basePath);
          files.add(basePath);
        } catch (_) {}
        files.sort();
        debugPrint('Loader: sign=$sign files=${files.length} paths=$files');
        var any = false;
        for (final path in files) {
          final frames = await _loadFrames(path);
          debugPrint('Loader: $path -> ${frames.length} frames');
          if (frames.isNotEmpty) {
            detector.loadPatternFromLandmarks(sign, frames);
            any = true;
          }
        }
        if (any) loaded++;
      }
    }
    debugPrint('Loader: total loaded=$loaded patterns=${detector.getStatus()}');
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
      final result = obj.map((k, v) => MapEntry(
            k,
            (v as List).map((e) => e.toString()).toList(),
          ));
      debugPrint('Loader: manifest=$result');
      return result;
    } catch (e) {
      debugPrint('Loader: manifest error: $e');
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
        final right = _parseHand(m['landmarksRight'] ?? m['landmarks']);
        final left = _parseHand(m['landmarksLeft']);
        if (right != null || left != null) {
          frames.add(TrainingFrame(right, left));
        }
      }
      return frames;
    } catch (e) {
      debugPrint('Loader: error reading $path: $e');
      return [];
    }
  }
}

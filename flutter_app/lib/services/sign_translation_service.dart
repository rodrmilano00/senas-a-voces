import 'dart:async';
import 'package:flutter/foundation.dart';
import '../engine/dynamic_sign_detector.dart';
import '../engine/landmark.dart';
import 'expression_detector.dart';
import 'vision_service.dart';

/// Estado de traduccion emitido continuamente hacia la UI.
/// Una sena confirmada, con la marca de tiempo y confianza con que se capto.
class DetectedGloss {
  final String gloss; // p. ej. "CAFE"
  final double confidence; // 0..1
  final DateTime at;

  const DetectedGloss(this.gloss, this.confidence, this.at);

  String get label => gloss.replaceAll('_', ' ');
}

class TranslationState {
  final String? currentSign; // palabra dinamica recien confirmada
  final double confidence; // 0..1
  final bool handVisible;
  final int handCount; // cuantas manos ve la camara
  final FacialExpression expression;
  final String phrase; // frase acumulada (glosas separadas por espacio)
  final bool isDynamic;

  /// Historial ordenado de senas confirmadas en esta sesion.
  final List<DetectedGloss> glosses;

  const TranslationState({
    this.currentSign,
    this.confidence = 0,
    this.handVisible = false,
    this.handCount = 0,
    this.expression = FacialExpression.neutral,
    this.phrase = '',
    this.isDynamic = false,
    this.glosses = const [],
  });

  TranslationState copyWith({
    String? currentSign,
    double? confidence,
    bool? handVisible,
    int? handCount,
    FacialExpression? expression,
    String? phrase,
    bool? isDynamic,
    List<DetectedGloss>? glosses,
    bool clearSign = false,
  }) {
    return TranslationState(
      currentSign: clearSign ? null : (currentSign ?? this.currentSign),
      confidence: confidence ?? this.confidence,
      handVisible: handVisible ?? this.handVisible,
      handCount: handCount ?? this.handCount,
      expression: expression ?? this.expression,
      phrase: phrase ?? this.phrase,
      isDynamic: isDynamic ?? this.isDynamic,
      glosses: glosses ?? this.glosses,
    );
  }
}

class SignTranslationService {
  final DynamicSignDetector dynamicDetector;
  final ExpressionDetector expressionDetector;

  SignTranslationService({
    required this.dynamicDetector,
    ExpressionDetector? expressionDetector,
  }) : expressionDetector = expressionDetector ?? ExpressionDetector();

  final _controller = StreamController<TranslationState>.broadcast();
  Stream<TranslationState> get stream => _controller.stream;

  StreamSubscription<VisionFrame>? _sub;
  TranslationState _state = const TranslationState();

  // Control para no repetir la misma palabra dinamica.
  String? _lastCommitted;
  int _cooldown = 0;

  // El DTW dinamico es costoso: se evalua 1 de cada N frames en vez de
  // en todos, para mantener la UI fluida.
  static const int _dynamicEveryNFrames = 6;
  int _frameCounter = 0;
  DetectResult? _lastDynResult;

  /// Comienza a consumir el stream de vision.
  void attach(Stream<VisionFrame> frames) {
    _sub = frames.listen(_onFrame);
  }

  void _emit() => _controller.add(_state);

  void _emitIfChanged() {
    final s = _state;
    if (s.currentSign != _lastEmittedSign ||
        s.confidence != _lastEmittedConfidence ||
        s.handVisible != _lastEmittedHandVisible ||
        s.handCount != _lastEmittedHandCount ||
        s.expression != _lastEmittedExpression ||
        s.phrase != _lastEmittedPhrase ||
        s.isDynamic != _lastEmittedIsDynamic ||
        s.glosses.length != _lastEmittedGlossCount) {
      _lastEmittedSign = s.currentSign;
      _lastEmittedConfidence = s.confidence;
      _lastEmittedHandVisible = s.handVisible;
      _lastEmittedHandCount = s.handCount;
      _lastEmittedExpression = s.expression;
      _lastEmittedPhrase = s.phrase;
      _lastEmittedIsDynamic = s.isDynamic;
      _lastEmittedGlossCount = s.glosses.length;
      _controller.add(s);
    }
  }

  String? _lastEmittedSign;
  double _lastEmittedConfidence = -1;
  bool _lastEmittedHandVisible = false;
  int _lastEmittedHandCount = -1;
  FacialExpression _lastEmittedExpression = FacialExpression.neutral;
  String _lastEmittedPhrase = '';
  bool _lastEmittedIsDynamic = false;
  int _lastEmittedGlossCount = 0;

  void _onFrame(VisionFrame frame) {
    _frameCounter++;

    // Expresion facial: solo se recalcula cuando llega un resultado facial
    // nuevo (el nativo infiere la cara 1 de cada N frames).
    if (frame.faceBlendshapes.isNotEmpty) {
      final expr = expressionDetector.classify(frame.faceBlendshapes);
      _state = _state.copyWith(expression: expr);
    }

    if (!frame.hasHand) {
      _state = _state.copyWith(
        handVisible: false,
        handCount: 0,
        confidence: 0,
        clearSign: true,
      );
      // NO limpiar el buffer DTW aqui: MediaPipe puede perder la mano por
      // 1-2 frames durante el gesto y eso borraria todo el progreso.
      // Solo reseteamos el anti-repeticion.
      _lastCommitted = null;
      _emitIfChanged();
      return;
    }

    final rightHand = frame.rightHand;
    final leftHand = frame.leftHand;
    final hand = rightHand ?? leftHand ?? frame.primaryHand!;

    // Los features del DTW (ángulos de dedos, extensión, gaps) son
    // rotación-invariantes. palmNormalZ se hace abs() para una mano.
    // No se necesita rotación 180° para el DTW.
    final info = frameInfo(hand, leftHand);
    dynamicDetector.pushFrameInfo(info);

    if (_cooldown > 0) _cooldown--;

    // 1) Intento dinamico (palabras entrenadas). Throttled: el DTW recorre
    // patrones x secuencias x ventanas, asi que no se corre cada frame.
    if (_frameCounter % _dynamicEveryNFrames == 0) {
      _lastDynResult = dynamicDetector.detect();
      // Logging temporal para diagnostico.
      final r = dynamicDetector.detectRanking();
      if (r.isNotEmpty) {
        debugPrint('DTW: ${r.map((e) => "${e.key}=${e.value.toStringAsFixed(3)}").join(", ")} | buf=${dynamicDetector.getStatus()["bufferSize"]} | accepted=${_lastDynResult?.accepted ?? false}');
      }
    }
    final dyn = _lastDynResult;
    if (dyn != null && dyn.accepted && dyn.matched != null && _cooldown == 0) {
      if (dyn.matched != _lastCommitted) {
        final conf = (dyn.confidence / 100.0).clamp(0.0, 1.0);
        _commit(dyn.matched!, conf);
        _lastCommitted = dyn.matched;
        _cooldown = 40;
        _lastDynResult = null;
        dynamicDetector.clearBuffer();
        _state = _state.copyWith(
          currentSign: dyn.matched,
          confidence: conf,
          handVisible: true,
          handCount: frame.hands.length,
          isDynamic: true,
        );
        _emitIfChanged();
        return;
      }
    }

    // Clasificacion estatica de letras/numeros (alfabeto) deshabilitada:
    // la app solo debe reconocer las palabras dinamicas entrenadas.
    _state = _state.copyWith(
      handVisible: true,
      handCount: frame.hands.length,
    );
    _emitIfChanged();
  }

  void _commit(String sign, double confidence) {
    final entry = DetectedGloss(sign, confidence, DateTime.now());
    final glosses = [..._state.glosses, entry];
    _state = _state.copyWith(
      glosses: glosses,
      phrase: glosses.map((g) => g.gloss).join(' '),
    );
  }

  void clearPhrase() {
    _state = _state.copyWith(phrase: '', glosses: const [], clearSign: true);
    _lastCommitted = null;
    dynamicDetector.clearBuffer();
    _lastDynResult = null;
    _emit();
  }

  void backspace() {
    if (_state.glosses.isEmpty) return;
    final glosses = _state.glosses.sublist(0, _state.glosses.length - 1);
    _state = _state.copyWith(
      glosses: glosses,
      phrase: glosses.map((g) => g.gloss).join(' '),
    );
    _lastCommitted = null;
    _emit();
  }

  void dispose() {
    _sub?.cancel();
    _controller.close();
  }
}

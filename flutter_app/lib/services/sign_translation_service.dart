import 'dart:async';
import 'dart:math' as math;
import '../engine/hand_shape_detector.dart';
import '../engine/dynamic_sign_detector.dart';
import '../engine/landmark.dart';
import 'expression_detector.dart';
import 'vision_service.dart';

/// Estado de traduccion emitido continuamente hacia la UI.
class TranslationState {
  final String? currentSign; // letra/numero estatico o palabra dinamica
  final double confidence; // 0..1
  final bool handVisible;
  final FacialExpression expression;
  final String phrase; // frase acumulada
  final bool isDynamic;

  const TranslationState({
    this.currentSign,
    this.confidence = 0,
    this.handVisible = false,
    this.expression = FacialExpression.neutral,
    this.phrase = '',
    this.isDynamic = false,
  });

  TranslationState copyWith({
    String? currentSign,
    double? confidence,
    bool? handVisible,
    FacialExpression? expression,
    String? phrase,
    bool? isDynamic,
    bool clearSign = false,
  }) {
    return TranslationState(
      currentSign: clearSign ? null : (currentSign ?? this.currentSign),
      confidence: confidence ?? this.confidence,
      handVisible: handVisible ?? this.handVisible,
      expression: expression ?? this.expression,
      phrase: phrase ?? this.phrase,
      isDynamic: isDynamic ?? this.isDynamic,
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

  // Debounce para senas estaticas.
  String? _candidateStatic;
  int _candidateCount = 0;
  static const int _staticStableFrames = 8;
  static const double _staticMinScore = 0.60;

  // Control para no repetir la misma palabra dinamica.
  String? _lastCommitted;
  int _cooldown = 0;

  Landmark? _prevWrist;
  FingerStates? _lastFingerStates;

  // El DTW dinamico es costoso: se evalua 1 de cada N frames en vez de
  // en todos, para mantener la UI fluida.
  static const int _dynamicEveryNFrames = 4;
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
        s.expression != _lastEmittedExpression ||
        s.phrase != _lastEmittedPhrase ||
        s.isDynamic != _lastEmittedIsDynamic) {
      _lastEmittedSign = s.currentSign;
      _lastEmittedConfidence = s.confidence;
      _lastEmittedHandVisible = s.handVisible;
      _lastEmittedExpression = s.expression;
      _lastEmittedPhrase = s.phrase;
      _lastEmittedIsDynamic = s.isDynamic;
      _controller.add(s);
    }
  }

  String? _lastEmittedSign;
  double _lastEmittedConfidence = -1;
  bool _lastEmittedHandVisible = false;
  FacialExpression _lastEmittedExpression = FacialExpression.neutral;
  String _lastEmittedPhrase = '';
  bool _lastEmittedIsDynamic = false;

  void _onFrame(VisionFrame frame) {
    _frameCounter++;

    // Expresion facial: solo se recalcula cuando llega un resultado facial
    // nuevo (el nativo infiere la cara 1 de cada N frames).
    if (frame.faceBlendshapes.isNotEmpty) {
      final expr = expressionDetector.classify(frame.faceBlendshapes);
      _state = _state.copyWith(expression: expr);
    }

    if (!frame.hasHand) {
      _state = _state.copyWith(handVisible: false, confidence: 0, clearSign: true);
      _candidateStatic = null;
      _candidateCount = 0;
      _prevWrist = null;
      _emitIfChanged();
      return;
    }

    final hand = frame.primaryHand!;
    // computeFingerStates es costoso: se ejecuta 1 de cada 2 frames
    // para reducir carga de CPU sin perder precision de tracking.
    FingerStates? states;
    if (_frameCounter % 2 == 0) {
      states = computeFingerStates(hand);
      _lastFingerStates = states;
    } else {
      states = _lastFingerStates ?? computeFingerStates(hand);
    }
    final info = frameInfo(states, hand);
    dynamicDetector.pushFrameInfo(info);

    // Estimacion de movimiento (velocidad de muneca)
    final wrist = hand[0];
    double speed = 0;
    if (_prevWrist != null) {
      speed = _dist(wrist, _prevWrist!);
    }
    _prevWrist = wrist;
    final hasMotion = speed > 0.015;

    if (_cooldown > 0) _cooldown--;

    // 1) Intento dinamico (palabras entrenadas). Throttled: el DTW recorre
    // patrones x secuencias x ventanas, asi que no se corre cada frame.
    if (_frameCounter % _dynamicEveryNFrames == 0) {
      _lastDynResult = dynamicDetector.detect();
    }
    final dyn = _lastDynResult;
    if (dyn != null && dyn.accepted && dyn.matched != null && _cooldown == 0) {
      if (dyn.matched != _lastCommitted) {
        _commit(dyn.matched!, isDynamic: true);
        _lastCommitted = dyn.matched;
        _cooldown = 15;
        _lastDynResult = null;
        _state = _state.copyWith(
          currentSign: dyn.matched,
          confidence: dyn.confidence / 100.0,
          handVisible: true,
          isDynamic: true,
        );
        _emitIfChanged();
        return;
      }
    }

    // 2) Estatico (letras / numeros) cuando la mano esta quieta
    if (!hasMotion) {
      final res = detectBestLetter(states, hasMotion: hasMotion);
      final letter = res[0] as String?;
      final score = (res[1] as num).toDouble();
      _state = _state.copyWith(
        currentSign: letter,
        confidence: score.clamp(0.0, 1.0),
        handVisible: true,
        isDynamic: false,
      );
      if (letter != null && score >= _staticMinScore) {
        if (letter == _candidateStatic) {
          _candidateCount++;
        } else {
          _candidateStatic = letter;
          _candidateCount = 1;
        }
        if (_candidateCount == _staticStableFrames) {
          _commit(letter, isDynamic: false);
          _lastCommitted = null; // permite repetir letras distintas
        }
      } else {
        _candidateStatic = null;
        _candidateCount = 0;
      }
    } else {
      _state = _state.copyWith(handVisible: true);
    }
    _emitIfChanged();
  }

  void _commit(String sign, {required bool isDynamic}) {
    final token = _humanize(sign, isDynamic);
    final sep = _state.phrase.isEmpty ? '' : (isDynamic ? ' ' : '');
    _state = _state.copyWith(phrase: '${_state.phrase}$sep$token');
  }

  String _humanize(String sign, bool isDynamic) {
    if (!isDynamic) return sign; // letras/numeros: se concatenan
    return sign.replaceAll('_', ' ').toLowerCase();
  }

  void clearPhrase() {
    _state = _state.copyWith(phrase: '');
    _lastCommitted = null;
    _emit();
  }

  void backspace() {
    if (_state.phrase.isEmpty) return;
    final p = _state.phrase.trimRight();
    final idx = p.lastIndexOf(' ');
    final newPhrase = idx <= 0 ? '' : p.substring(0, idx);
    _state = _state.copyWith(phrase: newPhrase);
    _emit();
  }

  double _dist(Landmark a, Landmark b) =>
      math.sqrt(math.pow(a.x - b.x, 2) + math.pow(a.y - b.y, 2)).toDouble();

  void dispose() {
    _sub?.cancel();
    _controller.close();
  }
}

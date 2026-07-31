/// Interpreta los blendshapes faciales de MediaPipe FaceLandmarker y devuelve
/// una expresion emocional simple, util para dar contexto a la traduccion
/// (p. ej. una pregunta suele acompanarse de cejas levantadas).

enum FacialExpression { neutral, feliz, triste, sorprendido, enojado, pregunta }

extension FacialExpressionLabel on FacialExpression {
  String get label {
    switch (this) {
      case FacialExpression.neutral:
        return 'Neutral';
      case FacialExpression.feliz:
        return 'Feliz';
      case FacialExpression.triste:
        return 'Triste';
      case FacialExpression.sorprendido:
        return 'Sorprendido';
      case FacialExpression.enojado:
        return 'Enojado';
      case FacialExpression.pregunta:
        return 'Pregunta';
    }
  }

  String get emoji {
    switch (this) {
      case FacialExpression.neutral:
        return '';
      case FacialExpression.feliz:
        return ':)';
      case FacialExpression.triste:
        return ':(';
      case FacialExpression.sorprendido:
        return ':O';
      case FacialExpression.enojado:
        return '>:(';
      case FacialExpression.pregunta:
        return '?';
    }
  }
}

class ExpressionDetector {
  double _v(Map<String, double> b, String key) => b[key] ?? 0.0;

  FacialExpression classify(Map<String, double> b) {
    if (b.isEmpty) return FacialExpression.neutral;

    final smile =
        (_v(b, 'mouthSmileLeft') + _v(b, 'mouthSmileRight')) / 2;
    final frown =
        (_v(b, 'mouthFrownLeft') + _v(b, 'mouthFrownRight')) / 2;
    final jawOpen = _v(b, 'jawOpen');
    final browUp = (_v(b, 'browInnerUp') +
            _v(b, 'browOuterUpLeft') +
            _v(b, 'browOuterUpRight')) /
        3;
    final browDown =
        (_v(b, 'browDownLeft') + _v(b, 'browDownRight')) / 2;
    final eyeWide = (_v(b, 'eyeWideLeft') + _v(b, 'eyeWideRight')) / 2;

    // Sorpresa: boca abierta + cejas arriba + ojos abiertos
    if (jawOpen > 0.45 && (browUp > 0.35 || eyeWide > 0.4)) {
      return FacialExpression.sorprendido;
    }
    // Pregunta: cejas arriba marcadas sin boca muy abierta
    if (browUp > 0.5 && jawOpen < 0.3) {
      return FacialExpression.pregunta;
    }
    // Enojo: cejas hacia abajo
    if (browDown > 0.45 && smile < 0.2) {
      return FacialExpression.enojado;
    }
    // Feliz: sonrisa
    if (smile > 0.4 && smile > frown) {
      return FacialExpression.feliz;
    }
    // Triste: comisuras hacia abajo
    if (frown > 0.35 && frown > smile) {
      return FacialExpression.triste;
    }
    return FacialExpression.neutral;
  }
}

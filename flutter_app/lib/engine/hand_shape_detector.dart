import 'dart:math' as math;
import 'landmark.dart';

/// Puerto Dart de `lsm_detector.js`.
/// Reconoce la forma estatica de la mano (letras y numeros del alfabeto LSM)
/// a partir de los 21 landmarks de MediaPipe HandLandmarker.

const double _extThr = 155; // >= extendido
const double _fistThr = 100; // <= puno compacto

const Map<String, List<int>> _bend = {
  'index': [5, 6, 8],
  'middle': [9, 10, 12],
  'ring': [13, 14, 16],
  'pinky': [17, 18, 20],
};
const List<int> _thumbBend = [2, 3, 4];
const List<String> _fingerOrder = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// ── Utilidades geometricas ───────────────────────────────────────────────
List<double> _v3(List<Landmark> lms, int a, int b) =>
    [lms[b].x - lms[a].x, lms[b].y - lms[a].y, lms[b].z - lms[a].z];

double _dot(List<double> u, List<double> v) =>
    u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

double _norm(List<double> v) =>
    math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);

double _ang3(List<Landmark> lms, int a, int b, int c) {
  final u = _v3(lms, b, a);
  final vv = _v3(lms, b, c);
  final nu = _norm(u), nv = _norm(vv);
  if (nu < 1e-9 || nv < 1e-9) return 180;
  final cosv = (_dot(u, vv) / (nu * nv)).clamp(-1.0, 1.0);
  return (180 / math.pi) * math.acos(cosv);
}

List<double> _cross(List<double> a, List<double> b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];

/// Estado geometrico de la mano usado para puntuar letras.
class FingerStates {
  final bool thumb, index, middle, ring, pinky;
  final bool thumbOut, thumbBetween, kpThumbSlot, pThumbSlot;
  final bool thumbTouchIndex, thumbTouchMiddle;
  final bool thumbInFist, thumbOverTop, thumbBelowMcps, thumbAtLevel;
  final bool thumbSideIndex, thumbSideMiddle, thumbSidePinky;
  final double thumbAxial, thumbLateralPos;
  final bool palmFacingCamera;
  final double palmNormalZ;
  final bool uvTouching, uvClose, uvSpread;
  final double imGap;
  final double palmOriY, fingerOriY, fingerOriZ, orientationY;
  final bool handUp, handDown, handForward;
  final bool pChartPose, fistTight, palmFlat;
  final Map<String, double> ang;

  const FingerStates({
    required this.thumb,
    required this.index,
    required this.middle,
    required this.ring,
    required this.pinky,
    required this.thumbOut,
    required this.thumbBetween,
    required this.kpThumbSlot,
    required this.pThumbSlot,
    required this.thumbTouchIndex,
    required this.thumbTouchMiddle,
    required this.thumbInFist,
    required this.thumbOverTop,
    required this.thumbBelowMcps,
    required this.thumbAtLevel,
    required this.thumbSideIndex,
    required this.thumbSideMiddle,
    required this.thumbSidePinky,
    required this.thumbAxial,
    required this.thumbLateralPos,
    required this.palmFacingCamera,
    required this.palmNormalZ,
    required this.uvTouching,
    required this.uvClose,
    required this.uvSpread,
    required this.imGap,
    required this.palmOriY,
    required this.fingerOriY,
    required this.fingerOriZ,
    required this.orientationY,
    required this.handUp,
    required this.handDown,
    required this.handForward,
    required this.pChartPose,
    required this.fistTight,
    required this.palmFlat,
    required this.ang,
  });

  bool ext(String finger) {
    switch (finger) {
      case 'thumb':
        return thumb;
      case 'index':
        return index;
      case 'middle':
        return middle;
      case 'ring':
        return ring;
      case 'pinky':
        return pinky;
    }
    return false;
  }
}

/// Calcula el estado de los dedos a partir de 21 landmarks.
FingerStates? computeFingerStates(List<Landmark>? lms) {
  if (lms == null || lms.length < 21) return null;

  // 1. Angulos articulares
  final ang = <String, double>{};
  _bend.forEach((name, idx) {
    ang[name] = _ang3(lms, idx[0], idx[1], idx[2]);
  });
  ang['thumb'] = _ang3(lms, _thumbBend[0], _thumbBend[1], _thumbBend[2]);

  // 2. Extension binaria
  final ext = <String, bool>{};
  for (final name in _bend.keys) {
    ext[name] = ang[name]! >= _extThr;
  }

  // 3. Pulgar: lateralidad y contacto
  final ax2 = lms[9].x - lms[0].x, ay2 = lms[9].y - lms[0].y;
  final palm2d = _hypot(ax2, ay2);
  final lx = -ay2 / palm2d, ly = ax2 / palm2d;
  final tx = lms[4].x - lms[0].x, ty = lms[4].y - lms[0].y;
  final thumbLat = (tx * lx + ty * ly).abs() / palm2d;
  var thumbOut = thumbLat > 0.42;
  ext['thumb'] = (ang['thumb']! >= _extThr) || thumbOut;

  final d3norm = _nz(_norm(_v3(lms, 0, 9)), palm2d);
  final thumbTouchIndex = _norm(_v3(lms, 4, 8)) < d3norm * 0.30;
  final thumbTouchMiddle = _norm(_v3(lms, 4, 12)) < d3norm * 0.30;
  if (thumbTouchIndex || thumbTouchMiddle) {
    ext['thumb'] = false;
    thumbOut = false;
  }

  // 4. Separacion indice/medio
  final imGap = _norm(_v3(lms, 8, 12)) / palm2d;
  final uvTouching = imGap < 0.14;
  final uvClose = imGap < 0.38;
  final uvSpread = imGap > 0.45;

  // 5. Orientacion
  final palmVec = _v3(lms, 0, 9);
  final palmLen = _nz(_norm(palmVec), 1e-9);
  final palmOriY = palmVec[1] / palmLen;
  final fi = [
    (lms[8].x + lms[12].x) * 0.5 - lms[0].x,
    (lms[8].y + lms[12].y) * 0.5 - lms[0].y,
    (lms[8].z + lms[12].z) * 0.5 - lms[0].z,
  ];
  final flen = _nz(_norm(fi), 1e-9);
  final fingerOriY = fi[1] / flen;
  final fingerOriZ = fi[2] / flen;
  final orientationY = (ext['index']! && ext['middle']!) ? fingerOriY : palmOriY;
  final handUp = orientationY < -0.46;
  final handDown = orientationY > 0.46;
  final handForward = fingerOriZ < -0.18;

  // 6. Puno / palma plana
  final fistTight = _bend.keys.every((k) => ang[k]! < _fistThr);
  final palmFlat = _bend.keys.every((k) => ang[k]! > _extThr + 5);

  // 7. Pulgar entre indice y medio
  final palmAx = palmVec.map((x) => x / palmLen).toList();
  final tVec = [lms[4].x - lms[0].x, lms[4].y - lms[0].y, lms[4].z - lms[0].z];
  final tAxial = _dot(tVec, palmAx) / palmLen;
  final thumbBetween = (0.35 < tAxial && tAxial < 0.92) && !thumbOut;
  final kpThumbSlot = ext['thumb']! &&
      ext['index']! &&
      ext['middle']! &&
      (-1.28 < tAxial && tAxial < 0.96) &&
      !thumbTouchIndex &&
      !thumbTouchMiddle;
  final indexAboveWrist = lms[8].y < (lms[0].y - 0.010);
  final pChartPose =
      ext['index']! && ext['middle']! && kpThumbSlot && indexAboveWrist;

  // 8. Posicion pulgar dentro del puno
  final mcpMid = [lms[9].x, lms[9].y, lms[9].z];
  final tipRel = [
    lms[4].x - mcpMid[0],
    lms[4].y - mcpMid[1],
    lms[4].z - mcpMid[2]
  ];
  final thumbAxial = _dot(tipRel, palmAx) / palmLen;

  final palmLatRaw = [
    lms[5].x - lms[17].x,
    lms[5].y - lms[17].y,
    lms[5].z - lms[17].z
  ];
  final latLen = _nz(_norm(palmLatRaw), 1e-9);
  final palmLatU = palmLatRaw.map((x) => x / latLen).toList();
  final thumbLateralPos = _dot(tipRel, palmLatU) / palmLen;

  final pThumbSlot = ext['index']! &&
      ext['middle']! &&
      !thumbOut &&
      !thumbTouchIndex &&
      !thumbTouchMiddle &&
      !fistTight &&
      thumbLateralPos > 0.0;

  // 8b. Normal de la palma
  final v1 = _v3(lms, 0, 5), v2 = _v3(lms, 0, 17);
  final normal = _cross(v1, v2);
  final nlen = _nz(_norm(normal), 1e-9);
  final palmNormalZ = normal[2] / nlen;
  final palmFacingCamera = palmNormalZ.abs() > 0.45;

  final thumbInFist = fistTight && !thumbOut && palmFacingCamera;
  final thumbOverTop = thumbInFist && thumbAxial > 0.30;
  final thumbBelowMcps = thumbInFist && thumbAxial < -0.05;
  final thumbAtLevel = thumbInFist && thumbAxial >= -0.05 && thumbAxial <= 0.30;
  final thumbSideIndex = thumbInFist && thumbLateralPos > 0.10;
  final thumbSideMiddle =
      thumbInFist && thumbLateralPos >= -0.10 && thumbLateralPos <= 0.10;
  final thumbSidePinky = thumbInFist && thumbLateralPos < -0.10;

  return FingerStates(
    thumb: ext['thumb']!,
    index: ext['index']!,
    middle: ext['middle']!,
    ring: ext['ring']!,
    pinky: ext['pinky']!,
    thumbOut: thumbOut,
    thumbBetween: thumbBetween,
    kpThumbSlot: kpThumbSlot,
    pThumbSlot: pThumbSlot,
    thumbTouchIndex: thumbTouchIndex,
    thumbTouchMiddle: thumbTouchMiddle,
    thumbInFist: thumbInFist,
    thumbOverTop: thumbOverTop,
    thumbBelowMcps: thumbBelowMcps,
    thumbAtLevel: thumbAtLevel,
    thumbSideIndex: thumbSideIndex,
    thumbSideMiddle: thumbSideMiddle,
    thumbSidePinky: thumbSidePinky,
    thumbAxial: thumbAxial,
    thumbLateralPos: thumbLateralPos,
    palmFacingCamera: palmFacingCamera,
    palmNormalZ: palmNormalZ,
    uvTouching: uvTouching,
    uvClose: uvClose,
    uvSpread: uvSpread,
    imGap: imGap,
    palmOriY: palmOriY,
    fingerOriY: fingerOriY,
    fingerOriZ: fingerOriZ,
    orientationY: orientationY,
    handUp: handUp,
    handDown: handDown,
    handForward: handForward,
    pChartPose: pChartPose,
    fistTight: fistTight,
    palmFlat: palmFlat,
    ang: ang,
  );
}

double _hypot(double a, double b) {
  final h = math.sqrt(a * a + b * b);
  return h == 0 ? 1e-9 : h;
}

double _nz(double v, double fallback) => v == 0 ? fallback : v;

// ── Extras por letra ──────────────────────────────────────────────────────
double _extraA(FingerStates s) =>
    (s.thumbOut ? 0.12 : -0.10) + (s.fistTight ? 0.06 : -0.08);
double _extraL(FingerStates s) =>
    (s.thumbOut ? 0.12 : -0.25) + (s.handUp ? 0.06 : -0.08);
double _extraY(FingerStates s) {
  if (!s.thumbOut) return -0.22;
  if (!s.pinky) return -0.20;
  var sc = 0.18;
  if (s.index) sc -= 0.18;
  if (s.middle) sc -= 0.18;
  if (s.ring) sc -= 0.15;
  return sc;
}

double _extraG(FingerStates s) {
  if (s.uvClose && s.middle) return -0.30;
  return s.handUp ? -0.18 : 0.06;
}

double _extraQ(FingerStates s) {
  if (s.middle || s.ring || s.pinky) return -0.25;
  return (s.thumbTouchIndex ? 0.24 : -0.30) + (s.handDown ? 0.08 : 0);
}

double _extraC(FingerStates s) {
  if (s.index || s.middle || s.ring || s.pinky || s.fistTight) return -0.40;
  return 0.50;
}

double _extraB(FingerStates s) => s.palmFlat ? 0.10 : -0.02;
double _extraO(FingerStates s) {
  if (s.fistTight) return -0.55;
  var sc = 0.0;
  if (s.index) sc -= 0.15;
  if (s.middle) sc -= 0.10;
  if (s.ring) sc -= 0.08;
  if (s.pinky) sc -= 0.08;
  if (s.thumbOut) sc -= 0.30;
  if (s.thumbTouchIndex) {
    sc += 0.35;
  } else if (s.thumbTouchMiddle) {
    sc += 0.10;
  } else {
    sc -= 0.15;
  }
  return sc;
}

double _extraF(FingerStates s) => s.thumbTouchIndex ? 0.18 : -0.12;
double _extraD(FingerStates s) =>
    (s.thumbTouchMiddle ? 0.12 : -0.06) + (s.handUp ? 0.05 : 0);
double _extraH(FingerStates s) {
  if (s.ring) return -0.28;
  if (s.uvSpread) return -0.22;
  if (s.handDown) return -0.20;
  return (s.uvClose ? 0.18 : 0.05) + (s.handUp ? -0.06 : 0.04);
}

double _extraU(FingerStates s) {
  if (s.uvSpread) return -0.20;
  if (s.uvTouching) return -0.18;
  if (s.handDown) return -0.20;
  return (s.uvClose ? 0.16 : -0.10) + (s.handUp ? 0.06 : -0.02);
}

double _extraV(FingerStates s) {
  if (s.handDown) return -0.15;
  if (s.pThumbSlot) return -0.30;
  return s.uvSpread ? 0.14 : -0.18;
}

double _extraR(FingerStates s) {
  if (s.handDown) return -0.15;
  return s.uvTouching ? 0.15 : -0.15;
}

double _extraW(FingerStates s) {
  if (s.handDown) return -0.25;
  return s.handUp ? 0.12 : -0.10;
}

double _extraX(FingerStates s) {
  if (s.index) return -0.50;
  if (s.fistTight) return -0.45;
  var sc = 0.22;
  if (!s.middle) sc += 0.06;
  if (!s.ring) sc += 0.06;
  if (!s.pinky) sc += 0.06;
  if (!s.thumb) sc += 0.04;
  return sc;
}

double _extraZ(FingerStates s) {
  if (!s.index) return -0.40;
  if (s.middle) return -0.22;
  if (s.ring || s.pinky) return -0.18;
  return 0.20 + (s.thumbOut ? -0.10 : 0);
}

double _extraK(FingerStates s) {
  if (s.thumbTouchMiddle || s.thumbTouchIndex) return -0.38;
  if (s.uvClose) return -0.35;
  if (!s.kpThumbSlot) return -0.50;
  var d = s.handUp ? -0.28 : (s.handDown ? -0.24 : 0.30);
  d += s.uvSpread ? 0.06 : 0;
  return d;
}

double _extraP(FingerStates s) {
  if (s.thumbTouchMiddle || s.thumbTouchIndex) return -0.38;
  if (s.uvClose) return -0.30;
  if (s.thumbOut) return -0.28;
  if (!s.pThumbSlot) return -0.50;
  if (s.handDown) return -0.30;
  final upLike = s.handUp || s.pChartPose;
  var d = upLike ? 0.34 : ((s.handForward && !s.handUp) ? -0.14 : 0.10);
  d += s.uvSpread ? 0.06 : 0;
  return d;
}

double _baseFistOk(FingerStates s) =>
    (s.thumbOut ? -0.28 : 0.04) + (s.fistTight ? 0.10 : -0.22);
double _extraS(FingerStates s) {
  final d = _baseFistOk(s);
  if (!s.fistTight) return d - 0.30;
  if (!s.palmFacingCamera) return d + (s.thumbLateralPos > 0.08 ? 0.08 : 0.02);
  if (s.thumbBelowMcps) return d - 0.35;
  if (s.thumbOverTop) return d - 0.18;
  if (s.thumbSideIndex) return d + 0.14;
  if (s.thumbAtLevel) return d + 0.08;
  return d + 0.04;
}

double _extraT(FingerStates s) {
  final d = _baseFistOk(s);
  if (!s.fistTight) return d - 0.30;
  return s.thumbOverTop ? d + 0.18 : d - 0.30;
}

double _scoreMvarA(FingerStates s) {
  if (s.thumbOut || !s.fistTight) return -0.30;
  if (!s.palmFacingCamera) return 0.04;
  if (!s.thumbBelowMcps) return -0.10;
  return s.thumbSidePinky ? 0.18 : 0.06;
}

double _scoreMvarB(FingerStates s) {
  if (s.thumbOut) return -0.25;
  if (!(s.index && s.middle && s.ring)) return -0.20;
  if (s.pinky) return -0.10;
  if (s.handUp) return -0.18;
  return s.handDown ? 0.30 : 0.04;
}

double _extraM(FingerStates s) => math.max(_scoreMvarA(s), _scoreMvarB(s));
double _scoreNvarA(FingerStates s) {
  if (s.thumbOut || !s.fistTight) return -0.30;
  if (!s.palmFacingCamera) return 0.04;
  if (!s.thumbBelowMcps) return -0.10;
  if (s.thumbSideMiddle) return 0.22;
  if (s.thumbAtLevel) return 0.12;
  return 0.06;
}

double _scoreNvarB(FingerStates s) {
  if (s.thumbOut || s.uvSpread) return s.thumbOut ? -0.25 : -0.22;
  if (!(s.index && s.middle)) return -0.20;
  if (s.ring || s.pinky) return -0.12;
  if (s.handUp) return -0.22;
  if (!s.handDown) return 0.00;
  return 0.32;
}

double _extraN(FingerStates s) => math.max(_scoreNvarA(s), _scoreNvarB(s));
double _extraEnye(FingerStates s) => _extraN(s) - 0.10;
double _extraE(FingerStates s) {
  if (!s.fistTight) return -0.50;
  var d = s.thumbOut ? -0.28 : 0.04;
  if (s.thumbBelowMcps) {
    d -= 0.25;
  } else if (s.thumbOverTop) {
    d -= 0.22;
  } else {
    d += 0.20;
  }
  return d;
}

double _extraI(FingerStates s) {
  if (!s.pinky) return -0.40;
  var sc = 0.30;
  if (s.index) sc -= 0.20;
  if (s.middle) sc -= 0.20;
  if (s.ring) sc -= 0.20;
  if (s.thumb) sc -= 0.12;
  if (s.thumbOut) sc -= 0.20;
  return sc;
}

double _extraN1(FingerStates s) {
  if (!s.index) return -0.50;
  var d = 0.20;
  if (s.middle) d -= 0.18;
  if (s.ring) d -= 0.15;
  if (s.pinky) d -= 0.15;
  if (s.thumbOut) d -= 0.10;
  return d;
}

double _extraN2(FingerStates s) {
  if (!(s.index && s.middle)) return -0.45;
  var d = 0.18;
  if (s.ring) d -= 0.18;
  if (s.pinky) d -= 0.18;
  if (s.thumbOut) d -= 0.06;
  return d;
}

double _extraN3(FingerStates s) {
  if (!(s.index && s.middle && s.ring)) return -0.45;
  var d = 0.18;
  if (s.pinky) d -= 0.18;
  if (s.thumbOut) d -= 0.10;
  return d;
}

double _extraN4(FingerStates s) {
  if (!(s.index && s.middle && s.ring && s.pinky)) return -0.45;
  var d = 0.20;
  if (s.thumbOut) d -= 0.08;
  return d;
}

double _extraN5(FingerStates s) {
  final c = ['index', 'middle', 'ring', 'pinky'].where((k) => s.ext(k)).length;
  var d = 0.05 * c - 0.15;
  if (s.thumbOut) d += 0.12;
  if (c < 4) d -= 0.20;
  return d;
}

double _extraN6(FingerStates s) {
  if (!s.index || !s.middle || !s.ring) return -0.40;
  if (!s.pinky) return -0.30;
  if (s.thumbOut) return -0.20;
  return s.thumbTouchIndex ? -0.10 : 0.20;
}

double _extraN7(FingerStates s) {
  if (!s.index || !s.middle) return -0.40;
  if (!s.pinky) return -0.10;
  if (s.ring) return -0.20;
  if (s.thumbOut) return -0.20;
  return 0.22;
}

double _extraN8(FingerStates s) {
  if (!s.index) return -0.40;
  if (!s.ring || !s.pinky) return -0.20;
  if (s.middle) return -0.25;
  if (s.thumbOut) return -0.20;
  return s.thumbTouchMiddle ? 0.28 : 0.18;
}

double _extraN9(FingerStates s) {
  if (!s.middle || !s.ring || !s.pinky) return -0.40;
  if (s.index) return -0.30;
  if (s.thumbOut) return -0.20;
  return s.thumbTouchIndex ? 0.30 : 0.18;
}

typedef _ExtraFn = double Function(FingerStates s);

const Map<String, _ExtraFn> _letterExtra = {
  '1': _extraN1, '2': _extraN2, '3': _extraN3, '4': _extraN4, '5': _extraN5,
  '6': _extraN6, '7': _extraN7, '8': _extraN8, '9': _extraN9,
  'A': _extraA, 'B': _extraB, 'C': _extraC, 'D': _extraD, 'E': _extraE,
  'F': _extraF, 'G': _extraG, 'H': _extraH, 'I': _extraI, 'K': _extraK,
  'L': _extraL, 'M': _extraM, 'N': _extraN, 'Ñ': _extraEnye, 'O': _extraO,
  'P': _extraP, 'Q': _extraQ, 'R': _extraR, 'S': _extraS, 'T': _extraT,
  'U': _extraU, 'V': _extraV, 'W': _extraW, 'X': _extraX, 'Y': _extraY,
  'Z': _extraZ,
};

/// Alfabeto LSM: [letra, plantilla de 5 dedos (E/C/?), esMovimiento].
const List<List<Object>> lsmAlphabet = [
  ['A', 'ECCCC', false], ['B', 'CEEEE', false], ['C', '?????', false],
  ['D', 'CECCC', false], ['E', 'CCCCC', false], ['F', 'CCEEE', false],
  ['G', 'EECCC', false], ['H', '?EECC', false], ['I', 'CCCCE', false],
  ['J', 'CCCCE', true], ['K', 'EEECC', true], ['L', 'EECCC', false],
  ['M', '?????', false], ['N', '?????', false], ['Ñ', '?????', true],
  ['O', 'CCCCC', false], ['P', '?EECC', false], ['Q', 'CCCCC', true],
  ['R', 'CEECC', false], ['S', 'CCCCC', false], ['T', 'CCCCC', false],
  ['U', 'CEECC', false], ['V', 'CEECC', false], ['W', 'CEEEC', false],
  ['X', 'CECCC', true], ['Y', 'ECCCE', false], ['Z', 'CECCC', true],
];

const Map<String, String> numberTemplates = {
  '6': 'CEEEE', '7': 'CEEEC', '8': 'CEECE', '9': 'CECEE',
};

const double matchThr = 0.70;

double scoreLetter(FingerStates? states, String template, String letter) {
  if (states == null || template.length != 5) return 0;
  var ok = 0, nWild = 0;
  for (var i = 0; i < 5; i++) {
    final t = template[i];
    final name = _fingerOrder[i];
    if (t == '?') {
      ok += 1;
      nWild++;
      continue;
    }
    if (states.ext(name) == (t == 'E')) ok += 1;
  }
  var base = ok / 5;
  if (nWild >= 4) base -= 0.25;
  final fn = _letterExtra[letter];
  if (fn != null) base = base + fn(states);
  return math.max(0, base);
}

/// Devuelve [letra, score] de la mejor coincidencia estatica.
List<dynamic> detectBestLetter(FingerStates? states, {bool hasMotion = false}) {
  if (states == null) return [null, 0.0];
  String? best;
  var bestScore = 0.0;
  for (final entry in lsmAlphabet) {
    final letter = entry[0] as String;
    final tpl = entry[1] as String;
    final isMov = entry[2] as bool;
    var s = scoreLetter(states, tpl, letter);
    if (isMov && hasMotion) {
      s += 0.05;
    } else if (isMov) {
      s -= 0.03;
    }
    if (s > bestScore) {
      bestScore = s;
      best = letter;
    }
  }
  return [best, bestScore];
}

double scoreTarget(FingerStates? states, String targetName, [String? template]) {
  if (states == null) return 0;
  final tpl = template ?? numberTemplates[targetName] ?? '?????';
  return scoreLetter(states, tpl, targetName);
}

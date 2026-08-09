import 'dart:async';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../engine/dynamic_sign_detector.dart';
import '../services/expression_detector.dart';
import '../services/sign_translation_service.dart';
import '../services/training_data_loader.dart';
import '../services/tts_service.dart';
import '../services/vision_service.dart';
import '../theme/brand.dart';
import 'hand_overlay_painter.dart';

/// Pantalla principal: traduccion de LSM en vivo por camara.
class LiveTranslationPage extends StatefulWidget {
  const LiveTranslationPage({super.key});

  @override
  State<LiveTranslationPage> createState() => _LiveTranslationPageState();
}

class _LiveTranslationPageState extends State<LiveTranslationPage> {
  final VisionService _vision = VisionService();
  final TtsService _tts = TtsService();
  late final DynamicSignDetector _dynamic;
  late final SignTranslationService _translator;

  int? _textureId;
  TranslationState _state = const TranslationState();
  String _status = 'Iniciando...';
  bool _ready = false;
  bool _isFrontCamera = true;
  // El overlay se repinta via ValueNotifier para no reconstruir toda la
  // pantalla (AppBar, panel de frase, botones) en cada frame de camara.
  final ValueNotifier<VisionFrame?> _liveFrame = ValueNotifier(null);
  StreamSubscription<VisionFrame>? _frameSub;
  int _overlayFrameCount = 0;
  static const int _overlayEveryN = 2; // actualizar overlay 1 de cada 2 frames

  @override
  void initState() {
    super.initState();
    _dynamic = DynamicSignDetector();
    _translator = SignTranslationService(dynamicDetector: _dynamic);
    _init();
  }

  Future<void> _init() async {
    final cam = await Permission.camera.request();
    if (!cam.isGranted) {
      setState(() => _status = 'Permiso de camara denegado');
      return;
    }

    setState(() => _status = 'Cargando senas entrenadas...');
    final loaded = await TrainingDataLoader().loadInto(_dynamic);

    _translator.attach(_vision.frames);
    _translator.stream.listen((s) {
      if (mounted) setState(() => _state = s);
    });
    _frameSub = _vision.frames.listen((f) {
      _overlayFrameCount++;
      if (_overlayFrameCount % _overlayEveryN == 0) {
        _liveFrame.value = f;
      }
    });

    try {
      final id = await _vision.start(lensDirection: 'front');
      if (mounted) {
        setState(() {
          _textureId = id;
          _ready = true;
          _status = '$loaded senas cargadas';
        });
      }
    } catch (e) {
      if (mounted) setState(() => _status = 'Error de camara: $e');
    }
  }

  Future<void> _switchCamera() async {
    final id = await _vision.switchCamera();
    if (mounted && id != null) {
      setState(() {
        _textureId = id;
        _isFrontCamera = !_isFrontCamera;
      });
    }
  }

  Future<void> _speak() async {
    final text = _state.phrase.trim();
    if (text.isNotEmpty) await _tts.speak(text);
  }

  @override
  void dispose() {
    _frameSub?.cancel();
    _liveFrame.dispose();
    _translator.dispose();
    _vision.stop();
    _tts.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.bg,
      appBar: AppBar(
        backgroundColor: Brand.surface,
        elevation: 0,
        title: Row(
          children: [
            Image.asset('assets/images/logo-senas-a-voces.png',
                height: 30, errorBuilder: (_, __, ___) => const SizedBox()),
            const SizedBox(width: 10),
            const Text('Traduccion en vivo',
                style: TextStyle(
                    color: Brand.fg, fontWeight: FontWeight.w800, fontSize: 18)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Cambiar camara',
            icon: const Icon(Icons.cameraswitch, color: Brand.primary),
            onPressed: _ready ? _switchCamera : null,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _buildCameraArea()),
          _buildResultPanel(),
        ],
      ),
    );
  }

  Widget _buildCameraArea() {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Brand.fg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Brand.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (_textureId != null)
            Center(
              child: AspectRatio(
                aspectRatio: 3.0 / 4.0,
                child: ClipRect(
                  child: Texture(textureId: _textureId!),
                ),
              ),
            ),
          Positioned.fill(
            child: RepaintBoundary(
              child: ValueListenableBuilder<VisionFrame?>(
                valueListenable: _liveFrame,
                builder: (_, frame, __) {
                  if (frame == null) return const SizedBox();
                  return CustomPaint(painter: HandOverlayPainter(frame));
                },
              ),
            ),
          ),
          if (_textureId == null)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(color: Brand.accent),
                  const SizedBox(height: 16),
                  Text(_status,
                      style: const TextStyle(color: Colors.white70)),
                ],
              ),
            ),
          // Chip de expresion facial
          Positioned(
            top: 12,
            left: 12,
            child: _expressionChip(_state.expression),
          ),
          // Estado de mano
          Positioned(
            top: 12,
            right: 12,
            child: _pill(
              _state.handVisible ? 'Mano detectada' : 'Sin mano',
              _state.handVisible ? Brand.success : Brand.danger,
            ),
          ),
          // Sena actual (grande)
          if (_state.currentSign != null)
            Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 20),
                child: _currentSignCard(),
              ),
            ),
        ],
      ),
    );
  }

  Widget _currentSignCard() {
    final pct = (_state.confidence * 100).round();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      decoration: BoxDecoration(
        color: Brand.surface.withOpacity(0.92),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            _state.isDynamic
                ? _state.currentSign!.replaceAll('_', ' ')
                : _state.currentSign!,
            style: const TextStyle(
                fontSize: 40, fontWeight: FontWeight.w800, color: Brand.primary),
          ),
          const SizedBox(height: 6),
          SizedBox(
            width: 160,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: _state.confidence.clamp(0, 1),
                minHeight: 8,
                backgroundColor: Brand.border,
                color: pct >= 70 ? Brand.success : Brand.accent,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text('$pct%',
              style: const TextStyle(color: Brand.muted, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildResultPanel() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Brand.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Brand.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Frase',
              style: TextStyle(color: Brand.muted, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Text(
              _state.phrase.isEmpty ? 'Empieza a senar...' : _state.phrase,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: _state.phrase.isEmpty ? Brand.muted : Brand.fg,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _actionBtn(Icons.volume_up, 'Hablar', Brand.primary, _speak),
              const SizedBox(width: 8),
              _actionBtn(Icons.backspace, 'Borrar', Brand.accent,
                  _translator.backspace),
              const SizedBox(width: 8),
              _actionBtn(Icons.clear_all, 'Limpiar', Brand.danger,
                  _translator.clearPhrase),
            ],
          ),
        ],
      ),
    );
  }

  Widget _actionBtn(
      IconData icon, String label, Color color, VoidCallback onTap) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              Icon(icon, color: color),
              const SizedBox(height: 4),
              Text(label,
                  style: TextStyle(
                      color: color, fontWeight: FontWeight.w600, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _expressionChip(FacialExpression expr) {
    if (expr == FacialExpression.neutral) return const SizedBox();
    return _pill('${expr.label} ${expr.emoji}'.trim(), Brand.primary);
  }

  Widget _pill(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.9),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
          style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}

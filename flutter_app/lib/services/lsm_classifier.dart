import 'dart:async';
import 'dart:collection';
import 'dart:math';
import 'package:tflite_flutter/tflite_flutter.dart';
import '../models/sensor_packet.dart';

enum SignType { static, dynamic, none }

class ClassificationResult {
  final String? label;
  final SignType type;
  final double confidence;
  final bool accepted;

  ClassificationResult({
    this.label,
    required this.type,
    required this.confidence,
    required this.accepted,
  });
}

class LsmClassifier {
  Interpreter? _staticInterpreter;
  Interpreter? _dynamicInterpreter;

  final ListQueue<SensorPacket> _buffer = ListQueue();
  static const int _staticWindow = 5;   // 100 ms at 50 Hz
  static const int _dynamicWindow = 60;  // 1.2 s gesture window at 50 Hz

  static const double staticThreshold = 0.75;
  static const double dynamicThreshold = 0.70;
  static const double minMargin = 0.12;

  final StreamController<ClassificationResult> _resultController =
      StreamController.broadcast();
  Stream<ClassificationResult> get results => _resultController.stream;

  Future<void> loadModels() async {
    try {
      _staticInterpreter = await Interpreter.fromAsset('assets/models/static.tflite');
    } catch (e) {
      _resultController.add(ClassificationResult(
        label: null,
        type: SignType.none,
        confidence: 0,
        accepted: false,
      ));
    }
    try {
      _dynamicInterpreter = await Interpreter.fromAsset('assets/models/dynamic.tflite');
    } catch (e) {
      // model not yet present
    }
  }

  void onPacket(SensorPacket packet) {
    _buffer.addLast(packet);
    if (_buffer.length > _dynamicWindow) _buffer.removeFirst();

    final features = _extractFeatures(_buffer.toList());
    if (features == null) return;

    ClassificationResult? result;

    // Try dynamic model first if buffer is long enough and movement is detected
    if (_buffer.length >= _dynamicWindow && _dynamicInterpreter != null && _hasMovement(_buffer.toList())) {
      result = _runDynamic(_buffer.toList());
    }

    // Fallback to static if no dynamic or low confidence
    if ((result == null || !result.accepted) && _staticInterpreter != null && _buffer.length >= _staticWindow) {
      result = _runStatic(features);
    }

    if (result != null) {
      _resultController.add(result);
    }
  }

  // -----------------------------------------------------------------------
  // Feature vector matching firmware Python pipeline
  // 16 float features: 5 flex normalized + 3 accel + 3 gyro + 5 first-order diffs
  // -----------------------------------------------------------------------
  List<double>? _extractFeatures(List<SensorPacket> packets) {
    if (packets.isEmpty) return null;
    final last = packets.last;

    final flexNorm = last.flex.map((v) => v / 4095.0).toList();

    final accelNorm = last.accel.map((v) => v / 1000.0).toList();
    final gyroNorm = last.gyro.map((v) => v / 1000.0).toList();

    List<double> diffs = List.filled(5, 0.0);
    if (packets.length >= 2) {
      final prev = packets[packets.length - 2];
      for (int i = 0; i < 5; i++) {
        diffs[i] = (last.flex[i] - prev.flex[i]) / 4095.0;
      }
    }

    return [...flexNorm, ...accelNorm, ...gyroNorm, ...diffs];
  }

  bool _hasMovement(List<SensorPacket> packets) {
    if (packets.length < 10) return false;
    double total = 0;
    final recent = packets.sublist(packets.length - 10);
    for (int i = 1; i < recent.length; i++) {
      final prev = recent[i - 1];
      final cur = recent[i];
      for (int j = 0; j < 5; j++) {
        total += pow((cur.flex[j] - prev.flex[j]) / 4095.0, 2).toDouble();
      }
      for (int j = 0; j < 3; j++) {
        total += pow((cur.accel[j] - prev.accel[j]) / 1000.0, 2).toDouble();
      }
    }
    return total > 0.05; // tune per dataset
  }

  ClassificationResult _runStatic(List<double> features) {
    final input = [features]; // [1, 16]
    final output = List<double>.filled(_staticInterpreter!.getOutputTensor(0).shape[1], 0)
        .reshape([1, _staticInterpreter!.getOutputTensor(0).shape[1]]);
    _staticInterpreter!.run(input, output);

    final probs = output[0];
    final sorted = probs.asMap().entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final best = sorted[0];
    final second = sorted.length > 1 ? sorted[1].value : 0.0;
    final margin = best.value - second;

    return ClassificationResult(
      label: 'LABEL_${best.key}', // replace with label map from metadata
      type: SignType.static,
      confidence: best.value,
      accepted: best.value >= staticThreshold && margin >= minMargin,
    );
  }

  ClassificationResult _runDynamic(List<SensorPacket> packets) {
    // Dynamic model input: [1, 60, 11] = [batch, time, channels]
    // channels: 5 flex + 3 accel + 3 gyro, all normalized
    const int timeSteps = 60;
    const int channels = 11;
    final input = List.generate(
      1,
      (_) => List.generate(timeSteps, (t) {
        final idx = packets.length - timeSteps + t;
        if (idx < 0) return List.filled(channels, 0.0);
        final p = packets[idx];
        return [
          ...p.flex.map((v) => v / 4095.0),
          ...p.accel.map((v) => v / 1000.0),
          ...p.gyro.map((v) => v / 1000.0),
        ];
      }),
    );

    final outShape = _dynamicInterpreter!.getOutputTensor(0).shape;
    final output = List<double>.filled(outShape[1], 0).reshape([1, outShape[1]]);
    _dynamicInterpreter!.run(input, output);

    final probs = output[0];
    final sorted = probs.asMap().entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final best = sorted[0];
    final second = sorted.length > 1 ? sorted[1].value : 0.0;

    return ClassificationResult(
      label: 'LABEL_${best.key}',
      type: SignType.dynamic,
      confidence: best.value,
      accepted: best.value >= dynamicThreshold && (best.value - second) >= minMargin,
    );
  }

  void dispose() {
    _staticInterpreter?.close();
    _dynamicInterpreter?.close();
    _resultController.close();
  }
}

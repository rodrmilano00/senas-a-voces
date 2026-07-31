import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/sensor_packet.dart';
import '../services/ble_manager.dart';
import '../services/lsm_classifier.dart';

final bleManagerProvider = Provider<BleManager>((ref) {
  final manager = BleManager();
  ref.onDispose(() => manager.dispose());
  return manager;
});

final scanResultsProvider = StreamProvider<List<ScanResult>>((ref) {
  return FlutterBluePlus.scanResults;
});

final packetStreamProvider = StreamProvider<SensorPacket>((ref) {
  final ble = ref.watch(bleManagerProvider);
  return ble.packetStream;
});

final bleStatusProvider = StreamProvider<String>((ref) {
  final ble = ref.watch(bleManagerProvider);
  return ble.statusStream;
});

final classifierProvider = Provider<LsmClassifier>((ref) {
  final classifier = LsmClassifier();
  final ble = ref.watch(bleManagerProvider);
  final packetSubscription = ble.packetStream.listen(classifier.onPacket);
  classifier.loadModels();
  ref.onDispose(() {
    packetSubscription.cancel();
    classifier.dispose();
  });
  return classifier;
});

final classificationProvider = StreamProvider<ClassificationResult>((ref) {
  final classifier = ref.watch(classifierProvider);
  return classifier.results;
});

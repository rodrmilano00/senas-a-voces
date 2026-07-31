import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import '../providers/app_providers.dart';
import '../services/lsm_classifier.dart';
import '../services/tts_service.dart';
import 'calibration_page.dart';
import 'conversation_page.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  final TtsService _tts = TtsService(
    apiKey: const String.fromEnvironment('ELEVENLABS_API_KEY'),
  );
  final List<String> _phrase = [];
  bool _scanning = false;
  String _lastSign = '---';
  double _lastConfidence = 0;
  DateTime? _lastAcceptedAt;

  void _acceptClassification(ClassificationResult result) {
    if (!result.accepted || result.label == null || !mounted) return;
    final now = DateTime.now();
    final elapsed = _lastAcceptedAt == null
        ? const Duration(days: 1)
        : now.difference(_lastAcceptedAt!);
    if (elapsed < const Duration(milliseconds: 1200)) return;
    if (result.label == _lastSign && elapsed < const Duration(milliseconds: 2500)) {
      return;
    }
    final word = result.label!.replaceAll('LABEL_', 'SEÑA ').replaceAll('_', ' ');
    setState(() {
      _lastSign = result.label!;
      _lastConfidence = result.confidence;
      _lastAcceptedAt = now;
      _phrase.add(word);
    });
  }

  Future<void> _speakPhrase() async {
    if (_phrase.isEmpty) return;
    await _tts.speak(_phrase.join(' '));
  }

  @override
  void dispose() {
    _tts.dispose();
    super.dispose();
  }

  Future<void> _requestPermissions() async {
    await [
      Permission.bluetooth,
      Permission.bluetoothScan,
      Permission.bluetoothConnect,
      Permission.locationWhenInUse,
    ].request();
  }

  Future<void> _startScan() async {
    await _requestPermissions();
    final ble = ref.read(bleManagerProvider);
    setState(() => _scanning = true);
    await ble.startScan();
    await Future.delayed(const Duration(seconds: 5));
    setState(() => _scanning = false);
  }

  Future<void> _connect(BluetoothDevice device) async {
    final ble = ref.read(bleManagerProvider);
    final ok = await ble.connect(device);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo conectar')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scanResults = ref.watch(scanResultsProvider);
    final packets = ref.watch(packetStreamProvider);
    final bleStatus = ref.watch(bleStatusProvider);
    ref.listen(classificationProvider, (_, next) {
      next.whenData(_acceptClassification);
    });

    return Scaffold(
      appBar: AppBar(
        title: FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset('assets/images/app-icon.png', width: 36, height: 36),
              const SizedBox(width: 6),
              const Text('Señas a Voces'),
            ],
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Escuchar a la persona',
            icon: const Icon(Icons.hearing),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ConversationPage()),
              );
            },
          ),
          IconButton(
            tooltip: 'Calibrar guante',
            icon: const Icon(Icons.settings),
            onPressed: () {
              final ble = ref.read(bleManagerProvider);
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => CalibrationPage(ble: ble),
                ),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Classification display
          Container(
            width: double.infinity,
            color: Theme.of(context).colorScheme.primaryContainer,
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.bluetooth),
                    const SizedBox(width: 8),
                    Text(
                      bleStatus.valueOrNull?.startsWith('connected:') == true
                          ? 'Guante conectado'
                          : 'Guante desconectado',
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text('Seña detectada', style: Theme.of(context).textTheme.titleSmall),
                Text(
                  _lastSign,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
                if (_lastConfidence > 0)
                  Text('Confianza: ${(_lastConfidence * 100).toStringAsFixed(0)}%'),
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    _phrase.isEmpty ? 'La frase aparecerá aquí' : _phrase.join(' '),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton.filledTonal(
                      tooltip: 'Borrar última seña',
                      onPressed: _phrase.isEmpty
                          ? null
                          : () => setState(() => _phrase.removeLast()),
                      icon: const Icon(Icons.backspace_outlined),
                    ),
                    const SizedBox(width: 10),
                    FilledButton.icon(
                      onPressed: _phrase.isEmpty ? null : _speakPhrase,
                      icon: const Icon(Icons.volume_up),
                      label: const Text('Decir frase'),
                    ),
                    const SizedBox(width: 10),
                    IconButton.filledTonal(
                      tooltip: 'Borrar frase',
                      onPressed: _phrase.isEmpty
                          ? null
                          : () => setState(_phrase.clear),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Live packet preview
          packets.when(
            data: (pkt) => Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                'Flex: ${pkt.flex.map((v) => v.toString().padLeft(4)).join(' ')}  '
                'A: ${pkt.accel.map((v) => v.toString().padLeft(4)).join(' ')}',
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
            ),
            loading: () => const Text('Esperando datos...'),
            error: (e, _) => Text('Error: $e'),
          ),

          // Scan results
          Expanded(
            child: scanResults.when(
              data: (results) {
                final devices = results
                    .where((r) => r.device.platformName.isNotEmpty)
                    .toList();
                if (devices.isEmpty) {
                  return const Center(child: Text('No se encontraron dispositivos'));
                }
                return ListView.builder(
                  itemCount: devices.length,
                  itemBuilder: (_, i) {
                    final d = devices[i].device;
                    return ListTile(
                      title: Text(d.platformName.isEmpty ? 'Desconocido' : d.platformName),
                      subtitle: Text(d.remoteId.str),
                      trailing: ElevatedButton(
                        onPressed: () => _connect(d),
                        child: const Text('Conectar'),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _scanning ? null : _startScan,
        icon: _scanning ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.bluetooth_searching),
        label: Text(_scanning ? 'Buscando...' : 'Buscar guante'),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import '../services/ble_manager.dart';

class CalibrationPage extends StatefulWidget {
  final BleManager ble;
  const CalibrationPage({super.key, required this.ble});

  @override
  State<CalibrationPage> createState() => _CalibrationPageState();
}

class _CalibrationPageState extends State<CalibrationPage> {
  String _status = 'Conecta el guante y sigue los pasos';

  Future<void> _send(int command, String msg) async {
    try {
      await widget.ble.sendCommand(command);
      setState(() => _status = msg);
    } catch (e) {
      setState(() => _status = 'Error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Calibración del guante')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _status,
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => _send(0x01, 'Manten la mano ABIERTA...'),
              child: const Text('1. Mano abierta'),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => _send(0x02, 'Cierra el PUNO...'),
              child: const Text('2. Puño cerrado'),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => _send(0x03, 'Calibración guardada'),
              child: const Text('3. Guardar calibración'),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => _send(0x04, 'Calibración borrada'),
              child: const Text('Borrar calibración'),
            ),
          ],
        ),
      ),
    );
  }
}

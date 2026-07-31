import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import '../models/sensor_packet.dart';

class BleManager {
  static final BleManager _instance = BleManager._internal();
  factory BleManager() => _instance;
  BleManager._internal();

  // Uuids from firmware/config.h
  static final Guid serviceUuid = Guid('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
  static final Guid dataCharUuid = Guid('6e400002-b5a3-f393-e0a9-e50e24dcca9e');
  static final Guid commandCharUuid = Guid('6e400003-b5a3-f393-e0a9-e50e24dcca9e');

  static const String devicePrefix = 'SenasAVoces-Glove';

  BluetoothDevice? _device;
  BluetoothCharacteristic? _dataChar;
  BluetoothCharacteristic? _commandChar;

  final StreamController<List<ScanResult>> _scanController = StreamController.broadcast();
  Stream<List<ScanResult>> get scanResults => _scanController.stream;

  final StreamController<SensorPacket> _packetController = StreamController.broadcast();
  Stream<SensorPacket> get packetStream => _packetController.stream;

  final StreamController<String> _statusController = StreamController.broadcast();
  Stream<String> get statusStream => _statusController.stream;

  bool get isConnected => _device != null && _device!.isConnected;
  BluetoothDevice? get connectedDevice => _device;

  // -----------------------------------------------------------------------
  // Scanning
  // -----------------------------------------------------------------------
  Future<void> startScan({Duration timeout = const Duration(seconds: 4)}) async {
    final subscription = FlutterBluePlus.scanResults.listen(_scanController.add);
    try {
      await FlutterBluePlus.startScan(
        withServices: [], // some Android versions filter too aggressively; filter in UI
        timeout: timeout,
      );
    } finally {
      await subscription.cancel();
    }
  }

  Future<void> stopScan() async {
    await FlutterBluePlus.stopScan();
  }

  // -----------------------------------------------------------------------
  // Connection / subscription
  // -----------------------------------------------------------------------
  Future<bool> connect(BluetoothDevice device) async {
    try {
      await device.connect(autoConnect: false, mtu: 185);
      _device = device;

      // discover services
      List<BluetoothService> services = await device.discoverServices();
      BluetoothService? gloveService;
      for (var s in services) {
        if (s.uuid == serviceUuid) {
          gloveService = s;
          break;
        }
      }
      if (gloveService == null) {
        throw Exception('Glove service not found');
      }

      for (var c in gloveService.characteristics) {
        if (c.uuid == dataCharUuid) _dataChar = c;
        if (c.uuid == commandCharUuid) _commandChar = c;
      }

      if (_dataChar == null || _commandChar == null) {
        throw Exception('Required characteristics not found');
      }

      // negotiate MTU
      await _dataChar!.setNotifyValue(true);
      _dataChar!.lastValueStream.listen(_onData);

      // Listen to connection state for auto-reconnect
      device.connectionState.listen((state) {
        if (state == BluetoothConnectionState.disconnected) {
          _onDisconnected();
          Future.delayed(const Duration(seconds: 2), () => _autoReconnect(device));
        }
      });

      _statusController.add('connected:${device.remoteId.str}');
      return true;
    } catch (e) {
      _statusController.add('error:$e');
      return false;
    }
  }

  Future<void> disconnect() async {
    if (_device != null) {
      await _device!.disconnect();
      _onDisconnected();
    }
  }

  Future<void> _autoReconnect(BluetoothDevice device) async {
    if (isConnected) return;
    try {
      await connect(device);
    } catch (_) {
      // will retry on next disconnect event if applicable
    }
  }

  void _onDisconnected() {
    _dataChar = null;
    _commandChar = null;
    _device = null;
    _statusController.add('disconnected');
  }

  void _onData(List<int> raw) {
    if (raw.length < 30) return;
    try {
      final pkt = SensorPacket.fromBytes(Uint8List.fromList(raw));
      _packetController.add(pkt);
    } catch (_) {
      // malformed packet
    }
  }

  // -----------------------------------------------------------------------
  // Commands
  // -----------------------------------------------------------------------
  Future<void> sendCommand(int commandByte) async {
    if (_commandChar == null) throw Exception('Not connected');
    await _commandChar!.write([commandByte]);
  }

  Future<void> startOpenCalibration() => sendCommand(0x01);
  Future<void> startFistCalibration() => sendCommand(0x02);
  Future<void> saveCalibration() => sendCommand(0x03);
  Future<void> clearCalibration() => sendCommand(0x04);
  Future<void> ledOn() => sendCommand(0x10);
  Future<void> ledOff() => sendCommand(0x11);

  void dispose() {
    _scanController.close();
    _packetController.close();
    _statusController.close();
  }
}

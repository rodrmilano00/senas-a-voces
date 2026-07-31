import 'dart:typed_data';

class SensorPacket {
  final int seq;
  final List<int> flex;    // 5 flex sensors, 12-bit ADC
  final List<int> accel;   // 3-axis accel (mg)
  final List<int> gyro;    // 3-axis gyro
  final int timestamp;     // ESP32 millis()
  final int handId;        // 0 = right, 1 = left
  final int status;        // bit 0 = calibrated, bit 1 = connected

  SensorPacket({
    required this.seq,
    required this.flex,
    required this.accel,
    required this.gyro,
    required this.timestamp,
    required this.handId,
    required this.status,
  });

  factory SensorPacket.fromBytes(Uint8List bytes) {
    if (bytes.length < 30) {
      throw ArgumentError('SensorPacket requires 30 bytes, got ${bytes.length}');
    }
    final b = ByteData.sublistView(bytes);
    return SensorPacket(
      seq: b.getUint16(0, Endian.little),
      flex: [for (int i = 0; i < 5; i++) b.getUint16(2 + i * 2, Endian.little)],
      accel: [for (int i = 0; i < 3; i++) b.getInt16(12 + i * 2, Endian.little)],
      gyro: [for (int i = 0; i < 3; i++) b.getInt16(18 + i * 2, Endian.little)],
      timestamp: b.getUint32(24, Endian.little),
      handId: b.getUint8(28),
      status: b.getUint8(29),
    );
  }

  bool get isCalibrated => (status & 0x01) != 0;
  bool get isConnected  => (status & 0x02) != 0;

  Map<String, dynamic> toJson() => {
    'seq': seq,
    'flex': flex,
    'accel': accel,
    'gyro': gyro,
    'timestamp': timestamp,
    'handId': handId,
    'status': status,
  };

  @override
  String toString() =>
      'SensorPacket(seq=$seq, flex=$flex, accel=$accel, gyro=$gyro, ts=$timestamp, calibrated=$isCalibrated)';
}

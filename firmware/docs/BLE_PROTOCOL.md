# Protocolo BLE/GATT — Guante Señas a Voces

Documento de interfaz entre el guante ESP32-S3 (periférico/servidor) y la app Flutter (central/cliente).

## 1. Generalidades

- **Stack:** NimBLE-Arduino en el ESP32, `flutter_blue_plus` o `nordic_nrf_mesh` en Flutter. Recomendado `flutter_blue_plus`.
- **Perfil:** GATT, sin emparejamiento (Just Works).
- **Conexión:** el ESP32 siempre es servidor. Publica el service UUID listado abajo. La app escanea, conecta, se suscribe a Data Char (Notify) y escribe en Command Char.
- **MTU:** por defecto 23 bytes; negociar a 517 bytes si la central lo permite. El paquete de datos cabe en 23 bytes (30 bytes payload + overhead requiere fragmentación o MTU > 53).

## 2. Identificadores BLE

```text
Device name: "SenasAVoces-Glove-R"
Service UUID:        6e400001-b5a3-f393-e0a9-e50e24dcca9e
Data Char (Notify):  6e400002-b5a3-f393-e0a9-e50e24dcca9e
Command Char (Write):6e400003-b5a3-f393-e0a9-e50e24dcca9e
```

## 3. Paquete binario `SensorPacket` (30 bytes)

El ESP32 envía un notify por muestra. Orden de bytes: **little-endian**.

| Offset | Tipo     | Campo      | Descripción                                      |
|--------|----------|------------|--------------------------------------------------|
| 0      | uint16_t | seq        | Contador de paquete, se incrementa cada muestra  |
| 2      | uint16_t | flex[0]    | Pulgar (thumb) — ADC suavizado                   |
| 4      | uint16_t | flex[1]    | Índice                                           |
| 6      | uint16_t | flex[2]    | Medio                                            |
| 8      | uint16_t | flex[3]    | Anular                                           |
| 10     | uint16_t | flex[4]    | Meñique                                          |
| 12     | int16_t  | accel[0]   | Acelerómetro X (mg)                              |
| 14     | int16_t  | accel[1]   | Acelerómetro Y                                   |
| 16     | int16_t  | accel[2]   | Acelerómetro Z                                   |
| 18     | int16_t  | gyro[0]    | Giroscopio X                                     |
| 20     | int16_t  | gyro[1]    | Giroscopio Y                                     |
| 22     | int16_t  | gyro[2]    | Giroscopio Z                                     |
| 24     | uint32_t | timestamp  | `millis()` del ESP32 en ms                       |
| 28     | uint8_t  | hand_id    | 0 = mano derecha (MVP), 1 = reservado izquierda  |
| 29     | uint8_t  | status     | Bit 0 = calibrado, Bit 1 = BLE conectado         |

### Ejemplo de parsing en Dart

```dart
import 'dart:typed_data';

class SensorPacket {
  final int seq;
  final List<int> flex;     // 5 values
  final List<int> accel;    // 3 values, mg
  final List<int> gyro;     // 3 values
  final int timestamp;
  final int handId;
  final int status;

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
    final b = ByteData.sublistView(bytes);
    return SensorPacket(
      seq: b.getUint16(0, Endian.little),
      flex: [for (int i = 0; i < 5; i++) b.getUint16(2 + i * 2, Endian.little)],
      accel: [for (int i = 0; i < 3; i++) b.getInt16(12 + i * 2, Endian.little)],
      gyro:  [for (int i = 0; i < 3; i++) b.getInt16(18 + i * 2, Endian.little)],
      timestamp: b.getUint32(24, Endian.little),
      handId: b.getUint8(28),
      status: b.getUint8(29),
    );
  }

  bool get isCalibrated => (status & 0x01) != 0;
  bool get isConnected  => (status & 0x02) != 0;
}
```

## 4. Comandos (app → ESP32, 1 byte)

Escribir exactamente 1 byte en la `Command Char`:

| Valor | Constante            | Acción                                          | Respuesta status (Notify en Command Char) |
|-------|----------------------|-------------------------------------------------|-------------------------------------------|
| 0x00  | `NONE`               | Sin operación                                   | —                                         |
| 0x01  | `CALIBRATE_OPEN`     | Colecta 32 muestras de mano abierta            | `cal:open:done`                           |
| 0x02  | `CALIBRATE_FIST`     | Colecta 32 muestras de puño cerrado             | `cal:fist:done`                           |
| 0x03  | `SAVE_CALIBRATION`   | Guarda min/max en NVS y aplica calibración    | `cal:ok` o `cal:err`                      |
| 0x04  | `CLEAR_CALIBRATION`  | Borra calibración de NVS                       | `cal:cleared`                             |
| 0x10  | `SET_LED_ON`         | Fuerza LED encendido                            | —                                         |
| 0x11  | `SET_LED_OFF`        | Fuerza LED apagado                              | —                                         |

### Flujo de calibración recomendado

1. App escribe `0x01`.
2. Usuario mantiene mano abierta ~1 s.
3. ESP32 envía string `cal:open:done`.
4. App escribe `0x02`.
5. Usuario cierra el puño ~1 s.
6. ESP32 envía `cal:fist:done`.
7. App escribe `0x03`.
8. ESP32 envía `cal:ok` y a partir de ahora `status` bit 0 = 1.

## 5. Frecuencia de muestreo

- **50 Hz** (= 1 muestra cada 20 ms).
- Si la conexión BLE no puede notificar a 50 Hz, el ESP32 sigue muestreando pero descarta la notify fallida. Se recomienda negociar MTU 185 o 517 para reducir overhead.

## 6. Señalizaciones de estado

- **LED onboard:**
  - Apagado: en reposo / calibrando
  - Parpadeo rápido (500 ms): publicitando, esperando conexión
  - Fijo: central conectada
- **`status` byte:**
  - bit 0 → `1` si existe calibración válida
  - bit 1 → `1` mientras haya conexión BLE
- **Strings en Command Char:**
  - `cal:open:done`, `cal:fist:done`, `cal:ok`, `cal:err`, `cal:cleared`

## 7. Extensión a mano izquierda

El campo `hand_id` ya está reservado. El firmware futuro de la mano izquierda usará:

```text
Device name: "SenasAVoces-Glove-L"
hand_id: 1
```

La app puede usar el mismo `BLEManager` y discriminar por `hand_id` y `device.name`.

## 8. Notas de implementación Flutter

- El `Notify` puede llegar fraccionado si MTU es 23 bytes. `flutter_blue_plus` reensambla automáticamente el payload completo.
- Filtrar dispositivos por `device.name.startsWith("SenasAVoces-Glove")`.
- Después de `setNotifyValue(true)`, empezarán a llegar `Uint8List` de 30 bytes.
- Para enviar comando: `await commandCharacteristic.write([0x01])`.
- Si la conexión se pierde, el ESP32 vuelve a publicitar. La app debe reconectar automáticamente cuando reaparezca.

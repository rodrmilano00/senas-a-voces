# Firmware ESP32-S3 — Guante Señas a Voces (mano derecha)

> **[← Volver al README principal](../README.md)**

Proyecto **PlatformIO** para el guante instrumentado basado en ESP32-S3-WROOM-1 N16R8.
Los números de pin coinciden con la serigrafía física 1..44 de tu placa.

## Hardware conectado

| Componente          | Pin (físico) | GPIO real | Notas                              |
|---------------------|--------------|-----------|------------------------------------|
| Flex pulgar         | —            | GPIO15    | divisor ZD10-100 + 10kΩ a GND     |
| Flex índice         | —            | GPIO7     | idem                               |
| Flex medio          | —            | GPIO6     | idem                               |
| Flex anular         | —            | GPIO5     | idem                               |
| Flex meñique        | —            | GPIO4     | idem                               |
| BMI160 SDA          | 16           | GPIO16    | I2C, CS del BMI160 a 3.3V          |
| BMI160 SCL          | 17           | GPIO17    | I2C                                |
| BMI160 INT1         | 18           | GPIO18    | reservado                          |
| LED onboard         | —            | GPIO47    | RGB LED integrado                  |

## BLE GATT

- **Service UUID:** `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **Data char (Notify):** `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- **Command char (Write):** `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

### Comandos desde la app (1 byte)

| Código | Hex | Acción                                      |
|--------|-----|---------------------------------------------|
| NONE   | 0x00| sin operación                               |
| OPEN   | 0x01| inicia captura mano abierta (32 muestras)   |
| FIST   | 0x02| inicia captura puño (32 muestras)           |
| SAVE   | 0x03| guarda min/max en NVS                       |
| CLEAR  | 0x04| borra calibración                           |
| LED ON | 0x10| enciende LED                                |
| LED OFF| 0x11| apaga LED                                   |

## Paquete binario de datos (30 bytes, little-endian)

```
 uint16_t seq;            // contador de paquete
 uint16_t flex[5];        // valores ADC suavizados (12-bit)
 int16_t  accel[3];       // acelerómetro (mg)
 int16_t  gyro[3];        // giroscopio
 uint32_t timestamp;       // millis()
 uint8_t  hand_id;        // 0 = derecha, 1 = izquierda (reservado)
 uint8_t  status;         // bit 0 = calibrado, bit 1 = BLE conectado
```

## Calibración

1. Encender el guante y conectar la app.
2. Abrir la mano cómodamente y enviar comando `0x01` (OPEN). Esperar "cal:open:done".
3. Cerrar el puño y enviar comando `0x02` (FIST). Esperar "cal:fist:done".
4. Enviar `0x03` (SAVE). La app recibirá "cal:ok" y los valores se guardan en NVS.

La calibración persiste entre reinicios. Si quieres forzar recalibración, envía `0x04` (CLEAR).

## Compilar y subir

```bash
cd firmware
pio run -t upload
pio device monitor
```

## Siguientes pasos

- Implementar app Flutter `BLEManager` que se suscriba al data char y reconstruya `SensorPacket`.
- Implementar `LSMClassifier` en Flutter con modelos TFLite (estático y dinámico).
- Implementar `TTSService` con ElevenLabs y caché local.
- Scripts Python para capturar, entrenar y exportar modelos a `.tflite`.

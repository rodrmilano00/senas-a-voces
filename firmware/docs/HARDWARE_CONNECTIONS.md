# Conexiones físicas — Guante ESP32-S3 (mano derecha MVP)

Basado en `firmware/include/config.h` y la serigrafía física de tu placa.

## Conector de alimentación

| Fuente | Conectar a |
|--------|------------|
| 5V     | VCC de los 5 sensores flex (pin `+` o `VCC` del sensor) |
| 3.3V   | VCC del módulo BMI160 |
| GND    | Todos los GND de sensores flex, módulo BMI160 y placa |

## Sensores flex (5 unidades, mano derecha)

Cada sensor flex se cablea como divisor de voltaje con una resistencia de **10 kΩ a GND**:

```
+5V  ----[ Sensor flex ]----+----> GPIO (señal)
                            |
                           [10kΩ]
                            |
                           GND
```

Asignación de dedos a GPIO y serigrafía física:

| Dedo     | GPIO | Pin físico en placa | Ubicación aprox. |
|----------|------|---------------------|------------------|
| Pulgar   | 15   | 15                  | Lado izquierdo   |
| Índice   | 7    | 7                   | Lado izquierdo   |
| Medio    | 6    | 6                   | Lado izquierdo   |
| Anular   | 5    | 5                   | Lado izquierdo   |
| Meñique  | 4    | 4                   | Lado izquierdo   |

## BMI160 (mano derecha, I2C)

| Señal BMI160 | Conectar a ESP32 | Notas |
|--------------|------------------|-------|
| VCC          | 3.3V             |       |
| GND          | GND              |       |
| SDA          | GPIO16 / pin 16  | Lado izquierdo de la placa |
| SCL          | GPIO17 / pin 17  | Lado izquierdo de la placa |
| CS / SA0     | 3.3V             | Fuerza modo I2C y dirección 0x68 |
| INT          | GPIO18 / pin 18  | Opcional; no se usa en el firmware actual |

> Si el módulo BMI160 no tiene pull-ups SDA/SCL integrados, añade dos resistencias de 4.7 kΩ entre SDA↔3.3V y SCL↔3.3V.

## LED de estado

El firmware usa **GPIO47** (LED RGB integrado en la placa). No requiere cableado externo.

## Resumen rápido

| Componente          | GPIO / Pin físico |
|---------------------|-------------------|
| Flex pulgar         | GPIO15 (pin 15)   |
| Flex índice         | GPIO7  (pin 7)    |
| Flex medio          | GPIO6  (pin 6)    |
| Flex anular         | GPIO5  (pin 5)    |
| Flex meñique        | GPIO4  (pin 4)    |
| BMI160 SDA          | GPIO16 (pin 16)   |
| BMI160 SCL          | GPIO17 (pin 17)   |
| BMI160 INT          | GPIO18 (pin 18)   |
| LED onboard         | GPIO47            |

## Notas

- Todos los sensores flex comparten el mismo +5V y GND.
- El BMI160 se alimenta con 3.3V, **nunca** con 5V.
- El firmware MVP solo maneja la mano derecha. Para agregar la mano izquierda se requiere un segundo BMI160 con SA0 a GND (dirección 0x69) y 5 sensores flex adicionales.

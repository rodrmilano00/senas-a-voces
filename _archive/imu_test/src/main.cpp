#include <Arduino.h>
#include <Wire.h>

// ---------------------------------------------------------------------------
// Prueba de giroscopio + acelerometro BMI160 (Bosch) en ESP32 clasico.
// El BMI160 usa registros distintos al MPU6050 y datos en little-endian.
// Direccion I2C: 0x68 (SDO->GND) o 0x69 (SDO->VCC).
// ---------------------------------------------------------------------------
constexpr uint8_t SDA_PIN = 21;
constexpr uint8_t SCL_PIN = 22;
uint8_t IMU_ADDR = 0x68;                 // se autodetecta 0x68/0x69

constexpr uint8_t REG_CHIP_ID = 0x00;    // debe devolver 0xD1
constexpr uint8_t REG_ERR = 0x02;
constexpr uint8_t REG_PMU_STATUS = 0x03; // estado de energia acc/gyr
constexpr uint8_t REG_DATA_GYR = 0x0C;   // GYR_X_L..ACC_Z_H (12 bytes)
constexpr uint8_t REG_ACC_CONF = 0x40;
constexpr uint8_t REG_ACC_RANGE = 0x41;
constexpr uint8_t REG_GYR_CONF = 0x42;
constexpr uint8_t REG_GYR_RANGE = 0x43;
constexpr uint8_t REG_CMD = 0x7E;

constexpr uint8_t CHIP_ID_BMI160 = 0xD1;
constexpr uint8_t CMD_SOFT_RESET = 0xB6; // reinicio por software
constexpr uint8_t CMD_ACC_NORMAL = 0x11; // acelerometro modo normal
constexpr uint8_t CMD_GYR_NORMAL = 0x15; // giroscopio modo normal

// Escalas por defecto: acc +-2g, gyro +-2000 dps
constexpr float ACC_LSB_PER_G = 16384.0f;      // 2g
constexpr float GYR_LSB_PER_DPS = 16.384f;     // 2000 dps

bool imuReady = false;

bool writeRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(IMU_ADDR);
    Wire.write(reg);
    Wire.write(value);
    return Wire.endTransmission() == 0;
}

bool readRegisters(uint8_t reg, uint8_t* buffer, uint8_t length) {
    Wire.beginTransmission(IMU_ADDR);
    Wire.write(reg);
    if (Wire.endTransmission() != 0) {
        return false;
    }
    if (Wire.requestFrom(IMU_ADDR, length) != length) {
        return false;
    }
    for (uint8_t index = 0; index < length; ++index) {
        buffer[index] = Wire.read();
    }
    return true;
}

bool i2cLinesIdle() {
    return digitalRead(SDA_PIN) == HIGH && digitalRead(SCL_PIN) == HIGH;
}

void configureI2c() {
    Wire.begin(SDA_PIN, SCL_PIN);
    Wire.setTimeOut(50);
    Wire.setClock(100000);
}

bool detectAddress() {
    for (uint8_t addr : {0x68, 0x69}) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            IMU_ADDR = addr;
            return true;
        }
    }
    return false;
}

bool initBmi160() {
    if (!detectAddress()) {
        Serial.println("[BMI160] no responde en 0x68 ni 0x69");
        return false;
    }
    uint8_t chipId = 0;
    if (!readRegisters(REG_CHIP_ID, &chipId, 1)) {
        return false;
    }
    Serial.printf("[BMI160] address=0x%02X CHIP_ID=0x%02X (esperado 0xD1)\n", IMU_ADDR, chipId);
    if (chipId != CHIP_ID_BMI160) {
        Serial.println("[BMI160] CHIP_ID incorrecto, revisa el modulo");
        return false;
    }

    // Reinicio por software para partir de un estado conocido
    writeRegister(REG_CMD, CMD_SOFT_RESET);
    delay(100);

    // Encender acelerometro y esperar a modo normal
    writeRegister(REG_CMD, CMD_ACC_NORMAL);
    delay(50);
    // Encender giroscopio y esperar a modo normal
    writeRegister(REG_CMD, CMD_GYR_NORMAL);
    delay(100);

    // Verificar PMU_STATUS: acc en bits 5:4, gyr en bits 3:2 (01 = normal)
    uint8_t pmu = 0;
    for (uint8_t intento = 0; intento < 10; ++intento) {
        readRegisters(REG_PMU_STATUS, &pmu, 1);
        const uint8_t accStatus = (pmu >> 4) & 0x03;
        const uint8_t gyrStatus = (pmu >> 2) & 0x03;
        if (accStatus == 0x01 && gyrStatus == 0x01) {
            break;
        }
        delay(20);
    }
    uint8_t err = 0;
    readRegisters(REG_ERR, &err, 1);
    Serial.printf("[BMI160] PMU_STATUS=0x%02X ERR=0x%02X\n", pmu, err);

    // ODR 100Hz, rangos por defecto (acc +-2g, gyro +-2000dps)
    writeRegister(REG_ACC_CONF, 0x28);
    writeRegister(REG_ACC_RANGE, 0x03);
    writeRegister(REG_GYR_CONF, 0x28);
    writeRegister(REG_GYR_RANGE, 0x00);
    delay(20);
    return true;
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n[BOOT] ESP32 classic - BMI160 gyroscope + accel test");
    pinMode(SDA_PIN, INPUT_PULLUP);
    pinMode(SCL_PIN, INPUT_PULLUP);
    delay(10);
    Serial.printf("[I2C] idle SDA=%d SCL=%d\n", digitalRead(SDA_PIN), digitalRead(SCL_PIN));
    if (i2cLinesIdle()) {
        configureI2c();
        imuReady = initBmi160();
    }
}

void loop() {
    if (!imuReady) {
        const int sdaLevel = digitalRead(SDA_PIN);
        const int sclLevel = digitalRead(SCL_PIN);
        Serial.printf("[ERROR] BMI160 unavailable | SDA=%d SCL=%d\n", sdaLevel, sclLevel);
        if (sdaLevel == HIGH && sclLevel == HIGH) {
            configureI2c();
            imuReady = initBmi160();
        }
        delay(1000);
        return;
    }

    // 12 bytes: GYR X/Y/Z + ACC X/Y/Z, little-endian (low byte primero)
    uint8_t raw[12];
    if (!readRegisters(REG_DATA_GYR, raw, sizeof(raw))) {
        Serial.println("[ERROR] IMU read failed");
        imuReady = false;
        return;
    }

    const int16_t gyroX = static_cast<int16_t>(raw[0] | (raw[1] << 8));
    const int16_t gyroY = static_cast<int16_t>(raw[2] | (raw[3] << 8));
    const int16_t gyroZ = static_cast<int16_t>(raw[4] | (raw[5] << 8));
    const int16_t accX = static_cast<int16_t>(raw[6] | (raw[7] << 8));
    const int16_t accY = static_cast<int16_t>(raw[8] | (raw[9] << 8));
    const int16_t accZ = static_cast<int16_t>(raw[10] | (raw[11] << 8));

    Serial.printf("gyro_dps x=%8.2f y=%8.2f z=%8.2f | acc_g x=%6.2f y=%6.2f z=%6.2f\n",
                  gyroX / GYR_LSB_PER_DPS,
                  gyroY / GYR_LSB_PER_DPS,
                  gyroZ / GYR_LSB_PER_DPS,
                  accX / ACC_LSB_PER_G,
                  accY / ACC_LSB_PER_G,
                  accZ / ACC_LSB_PER_G);
    delay(100);
}

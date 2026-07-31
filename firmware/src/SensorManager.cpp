#include "SensorManager.h"
#include <Arduino.h>

SensorManager::SensorManager() = default;

bool SensorManager::begin() {
    // Configure ADC resolution and pins
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);  // 0-3.3V range
    for (int i = 0; i < 5; ++i) {
        pinMode(flexPins[i], INPUT);
    }

    // Initialize history buffers
    for (int ch = 0; ch < 5; ++ch) {
        for (int i = 0; i < FLEX_SMOOTH_WINDOW; ++i) {
            history[ch][i] = 0;
        }
        histIndex[ch] = 0;
        histSum[ch] = 0;
        lastSmoothed[ch] = 0;
    }

    // Initialize BMI160
    pinMode(IMU_SDA, INPUT_PULLUP);
    pinMode(IMU_SCL, INPUT_PULLUP);
    delay(10);
    const int sdaLevel = digitalRead(IMU_SDA);
    const int sclLevel = digitalRead(IMU_SCL);
    Serial.printf("[I2C] idle levels SDA=%d SCL=%d\n", sdaLevel, sclLevel);

    Wire.begin(IMU_SDA, IMU_SCL);
    Wire.setTimeOut(50);
    Wire.setClock(400000);
    uint8_t deviceCount = 0;
    if (sdaLevel == HIGH && sclLevel == HIGH) {
        for (uint8_t address = 1; address < 127; ++address) {
            Wire.beginTransmission(address);
            if (Wire.endTransmission() == 0) {
                Serial.printf("[I2C] device found at 0x%02X\n", address);
                ++deviceCount;
            }
        }
    } else {
        Serial.println("[I2C] bus blocked: disconnect power and check SDA/SCL wiring");
        return false;
    }
    if (deviceCount == 0) {
        Serial.printf("[I2C] no devices found on SDA=%u SCL=%u\n", IMU_SDA, IMU_SCL);
    }

    uint8_t detectedAddress = IMU_ADDR;
    imu_ok = mpu6050.begin(detectedAddress, &Wire);
    if (!imu_ok) {
        detectedAddress = IMU_ADDR == 0x68 ? 0x69 : 0x68;
        imu_ok = mpu6050.begin(detectedAddress, &Wire);
    }
    if (imu_ok) {
        Serial.printf("[IMU] MPU6050 ready at 0x%02X\n", detectedAddress);
        mpu6050.setAccelerometerRange(MPU6050_RANGE_4_G);
        mpu6050.setGyroRange(MPU6050_RANGE_250_DEG);
        mpu6050.setFilterBandwidth(MPU6050_BAND_21_HZ);
    } else {
        Serial.println("[IMU] MPU6050 not found at 0x68 or 0x69");
    }
    return imu_ok;
}

uint16_t SensorManager::movingAverage(uint8_t ch, uint16_t newSample) {
    if (histSum[ch] == 0) {
        for (int i = 0; i < FLEX_SMOOTH_WINDOW; ++i) {
            history[ch][i] = newSample;
        }
        histSum[ch] = static_cast<uint32_t>(newSample) * FLEX_SMOOTH_WINDOW;
    }
    histSum[ch] -= history[ch][histIndex[ch]];
    history[ch][histIndex[ch]] = newSample;
    histSum[ch] += newSample;
    histIndex[ch] = (histIndex[ch] + 1) % FLEX_SMOOTH_WINDOW;
    uint16_t avg = static_cast<uint16_t>(histSum[ch] / FLEX_SMOOTH_WINDOW);
    lastSmoothed[ch] = avg;
    return avg;
}

uint16_t SensorManager::rawFlex(uint8_t channel) const {
    if (channel >= 5) return 0;
    return analogRead(flexPins[channel]);
}

uint16_t SensorManager::smoothFlex(uint8_t channel) const {
    if (channel >= 5) return 0;
    return lastSmoothed[channel];
}

float SensorManager::normFlex(uint8_t channel) const {
    if (channel >= 5) return 0.0f;
    uint16_t v = lastSmoothed[channel];
    uint16_t minV = flexMin[channel];
    uint16_t maxV = flexMax[channel];
    if (maxV <= minV) return 0.0f;
    float n = static_cast<float>(v - minV) / static_cast<float>(maxV - minV);
    if (n < 0.0f) n = 0.0f;
    if (n > 1.0f) n = 1.0f;
    return n;
}

void SensorManager::setFlexMin(uint16_t minVals[5]) {
    for (int i = 0; i < 5; ++i) flexMin[i] = minVals[i];
}

void SensorManager::setFlexMax(uint16_t maxVals[5]) {
    for (int i = 0; i < 5; ++i) flexMax[i] = maxVals[i];
}

void SensorManager::getFlexMin(uint16_t out[5]) const {
    for (int i = 0; i < 5; ++i) out[i] = flexMin[i];
}

void SensorManager::getFlexMax(uint16_t out[5]) const {
    for (int i = 0; i < 5; ++i) out[i] = flexMax[i];
}

bool SensorManager::read(SensorPacket& out) {
    // Read and smooth flex sensors
    for (int i = 0; i < 5; ++i) {
        uint16_t raw = analogRead(flexPins[i]);
        uint16_t smooth = movingAverage(i, raw);
        out.flex[i] = smooth;  // raw 12-bit left at lower bits, upper bits 0; keeps 16-bit alignment
    }

    // Read IMU
    if (imu_ok) {
        sensors_event_t accelEvent;
        sensors_event_t gyroEvent;
        sensors_event_t temperatureEvent;
        if (mpu6050.getEvent(&accelEvent, &gyroEvent, &temperatureEvent)) {
            constexpr float gravity = 9.80665f;
            constexpr float radiansToDegrees = 57.2957795f;
            for (int i = 0; i < 3; ++i) {
                out.accel[i] = static_cast<int16_t>(
                    constrain(accelEvent.acceleration.v[i] * 1000.0f / gravity, -32768.0f, 32767.0f));
                out.gyro[i] = static_cast<int16_t>(
                    constrain(gyroEvent.gyro.v[i] * radiansToDegrees * 100.0f, -32768.0f, 32767.0f));
            }
        } else {
            out.accel[0] = out.accel[1] = out.accel[2] = 0;
            out.gyro[0] = out.gyro[1] = out.gyro[2] = 0;
        }
    } else {
        out.accel[0] = out.accel[1] = out.accel[2] = 0;
        out.gyro[0]  = out.gyro[1]  = out.gyro[2]  = 0;
    }

    return true;
}

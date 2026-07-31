#pragma once

#include "config.h"
#include <Adafruit_MPU6050.h>
#include <cstdint>

// ---------------------------------------------------------------------------
// Encapsulates flex sensor + BMI160 acquisition and normalization.
// ---------------------------------------------------------------------------
class SensorManager {
public:
    SensorManager();
    bool begin();
    bool read(SensorPacket& out);

    // calibration helpers
    void setFlexMin(uint16_t minVals[5]);
    void setFlexMax(uint16_t maxVals[5]);
    void getFlexMin(uint16_t out[5]) const;
    void getFlexMax(uint16_t out[5]) const;

    uint16_t rawFlex(uint8_t channel) const;    // last raw ADC
    uint16_t smoothFlex(uint8_t channel) const; // last smoothed raw
    float    normFlex(uint8_t channel) const;   // 0.0 .. 1.0 after calibration

    bool imuOk() const { return imu_ok; }

private:
    Adafruit_MPU6050 mpu6050;
    bool imu_ok = false;

    uint8_t flexPins[5] = {
        FLEX_PIN_THUMB, FLEX_PIN_INDEX, FLEX_PIN_MIDDLE,
        FLEX_PIN_RING, FLEX_PIN_PINKY
    };

    uint16_t flexMin[5] = { ADC_DEFAULT_MIN, ADC_DEFAULT_MIN, ADC_DEFAULT_MIN, ADC_DEFAULT_MIN, ADC_DEFAULT_MIN };
    uint16_t flexMax[5] = { ADC_DEFAULT_MAX, ADC_DEFAULT_MAX, ADC_DEFAULT_MAX, ADC_DEFAULT_MAX, ADC_DEFAULT_MAX };

    // circular buffer for moving average
    uint16_t history[5][FLEX_SMOOTH_WINDOW] = {};
    uint8_t  histIndex[5] = {0,0,0,0,0};
    uint32_t histSum[5]   = {0,0,0,0,0};
    uint16_t lastSmoothed[5] = {0,0,0,0,0};

    uint16_t movingAverage(uint8_t ch, uint16_t newSample);
};

#include "Calibration.h"
#include <Arduino.h>

Calibration::Calibration() = default;

bool Calibration::begin() {
    prefs_ok = prefs.begin(NVS_NS, false);
    return prefs_ok;
}

bool Calibration::isCalibrated() const {
    return calibrated;
}

void Calibration::captureOpenSample(const SensorManager& sensors) {
    if (open_count >= CALIBRATION_SAMPLES) return;
    uint16_t vals[5] = {0};
    for (int i = 0; i < 5; ++i) vals[i] = sensors.smoothFlex(i);
    for (int i = 0; i < 5; ++i) openSum[i] += vals[i];
    ++open_count;
}

void Calibration::captureFistSample(const SensorManager& sensors) {
    if (fist_count >= CALIBRATION_SAMPLES) return;
    uint16_t vals[5] = {0};
    for (int i = 0; i < 5; ++i) vals[i] = sensors.smoothFlex(i);
    for (int i = 0; i < 5; ++i) fistSum[i] += vals[i];
    ++fist_count;
}

bool Calibration::save(SensorManager& sensors) {
    if (!prefs_ok || open_count == 0 || fist_count == 0) return false;

    uint16_t openMin[5];
    uint16_t fistMax[5];
    for (int i = 0; i < 5; ++i) {
        openMin[i] = static_cast<uint16_t>(openSum[i] / open_count);
        fistMax[i] = static_cast<uint16_t>(fistSum[i] / fist_count);
    }

    prefs.putBytes("flexMin", openMin, sizeof(openMin));
    prefs.putBytes("flexMax", fistMax, sizeof(fistMax));
    prefs.putBool("calibrated", true);
    prefs.putUChar("openCnt", open_count);
    prefs.putUChar("fistCnt", fist_count);

    sensors.setFlexMin(openMin);
    sensors.setFlexMax(fistMax);

    // reset accumulators
    for (int i = 0; i < 5; ++i) { openSum[i] = 0; fistSum[i] = 0; }
    open_count = 0;
    fist_count = 0;
    calibrated = true;

    return true;
}

bool Calibration::load(SensorManager& sensors) {
    if (!prefs_ok) return false;

    calibrated = prefs.getBool("calibrated", false);
    if (!calibrated) return false;

    uint16_t mins[5];
    uint16_t maxs[5];
    size_t readLen = prefs.getBytes("flexMin", mins, sizeof(mins));
    if (readLen != sizeof(mins)) return false;
    readLen = prefs.getBytes("flexMax", maxs, sizeof(maxs));
    if (readLen != sizeof(maxs)) return false;

    sensors.setFlexMin(mins);
    sensors.setFlexMax(maxs);
    return true;
}

bool Calibration::clear(SensorManager& sensors) {
    if (prefs_ok) {
        prefs.clear();
    }
    uint16_t mins[5] = { ADC_DEFAULT_MIN, ADC_DEFAULT_MIN, ADC_DEFAULT_MIN, ADC_DEFAULT_MIN, ADC_DEFAULT_MIN };
    uint16_t maxs[5] = { ADC_DEFAULT_MAX, ADC_DEFAULT_MAX, ADC_DEFAULT_MAX, ADC_DEFAULT_MAX, ADC_DEFAULT_MAX };
    sensors.setFlexMin(mins);
    sensors.setFlexMax(maxs);
    calibrated = false;
    for (int i = 0; i < 5; ++i) { openSum[i] = 0; fistSum[i] = 0; }
    open_count = 0;
    fist_count = 0;
    return true;
}

#pragma once

#include "config.h"
#include "SensorManager.h"
#include <Preferences.h>
#include <cstdint>

// ---------------------------------------------------------------------------
// Stores and applies flex sensor calibration (open hand vs fist)
// using ESP32 NVS (Preferences.h)
// ---------------------------------------------------------------------------
class Calibration {
public:
    Calibration();
    bool begin();

    bool isCalibrated() const;

    // Capture a single sample from sensor manager into temporary accumulators
    void captureOpenSample(const SensorManager& sensors);
    void captureFistSample(const SensorManager& sensors);

    // Commit accumulated min/max to NVS and apply to SensorManager
    bool save(SensorManager& sensors);

    // Load saved calibration from NVS into SensorManager
    bool load(SensorManager& sensors);

    // Reset to factory defaults and clear NVS
    bool clear(SensorManager& sensors);

    // helpers for UI feedback
    uint8_t openSamples() const { return open_count; }
    uint8_t fistSamples() const { return fist_count; }

private:
    Preferences prefs;
    bool prefs_ok = false;
    bool calibrated = false;

    uint32_t openSum[5] = {0,0,0,0,0};
    uint32_t fistSum[5] = {0,0,0,0,0};
    uint8_t  open_count = 0;
    uint8_t  fist_count = 0;

    static constexpr const char* NVS_NS = "senas_cal";
};

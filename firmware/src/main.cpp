#include <Arduino.h>
#include "config.h"
#include "SensorManager.h"
#include "Calibration.h"
#include "BLEGloveServer.h"

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
SensorManager sensors;
Calibration   calibration;
BLEGloveServer ble;

uint32_t lastSampleMs = 0;
uint32_t packetSeq = 0;

enum class State {
    NORMAL,           // streaming sensor data
    CAL_OPEN,         // collecting open-hand samples
    CAL_FIST,         // collecting fist samples
};

State currentState = State::NORMAL;

// ---------------------------------------------------------------------------
// LED helpers
// ---------------------------------------------------------------------------
void setLed(bool on) {
    digitalWrite(LED_PIN, on ? HIGH : LOW);
}

void blinkLed(uint32_t periodMs) {
    static uint32_t lastToggle = 0;
    static bool ledState = false;
    if (millis() - lastToggle >= periodMs / 2) {
        ledState = !ledState;
        setLed(ledState);
        lastToggle = millis();
    }
}

// ---------------------------------------------------------------------------
// Command dispatcher (from BLE central / app)
// ---------------------------------------------------------------------------
void onCommand(Command cmd) {
    switch (cmd) {
        case Command::CALIBRATE_OPEN:
            currentState = State::CAL_OPEN;
            Serial.println("[CMD] start open-hand calibration");
            break;

        case Command::CALIBRATE_FIST:
            currentState = State::CAL_FIST;
            Serial.println("[CMD] start fist calibration");
            break;

        case Command::SAVE_CALIBRATION:
            if (calibration.save(sensors)) {
                Serial.println("[CMD] calibration saved");
                ble.sendStatus("cal:ok");
            } else {
                Serial.println("[CMD] calibration save failed");
                ble.sendStatus("cal:err");
            }
            currentState = State::NORMAL;
            break;

        case Command::CLEAR_CALIBRATION:
            calibration.clear(sensors);
            Serial.println("[CMD] calibration cleared");
            ble.sendStatus("cal:cleared");
            currentState = State::NORMAL;
            break;

        case Command::SET_LED_ON:
            setLed(true);
            break;

        case Command::SET_LED_OFF:
            setLed(false);
            break;

        default:
            break;
    }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n[BOOT] Senas a Voces - ESP32-S3 Glove Firmware");

    pinMode(LED_PIN, OUTPUT);
    setLed(false);

    // Init sensor manager
    if (!sensors.begin()) {
        Serial.println("[ERR] sensor init failed (IMU not responding)");
    } else {
        Serial.println("[OK] sensor manager ready");
    }

    // Init calibration storage
    if (calibration.begin()) {
        if (calibration.load(sensors)) {
            Serial.println("[OK] calibration loaded from NVS");
        } else {
            Serial.println("[WARN] no calibration found; use app to calibrate");
        }
    } else {
        Serial.println("[ERR] NVS init failed");
    }

    // Init BLE
    if (!ble.begin(DEVICE_NAME, onCommand)) {
        Serial.println("[ERR] BLE init failed");
    } else {
        Serial.println("[OK] BLE advertising started");
    }

    lastSampleMs = millis();
}

// ---------------------------------------------------------------------------
// Main loop @ 50Hz
// ---------------------------------------------------------------------------
void loop() {
    ble.loop();

    uint32_t now = millis();
    if (now - lastSampleMs < SAMPLE_PERIOD_MS) {
        // small yield so BLE stack can process events
        delay(1);
        return;
    }
    lastSampleMs += SAMPLE_PERIOD_MS;

    // LED status
    if (ble.isConnected()) {
        setLed(true);
    } else {
        blinkLed(500);  // 500ms blink = searching
    }

    // Calibration collection
    if (currentState == State::CAL_OPEN) {
        if (calibration.openSamples() < CALIBRATION_SAMPLES) {
            calibration.captureOpenSample(sensors);
            Serial.printf("[CAL-OPEN] %d/%d\n", calibration.openSamples(), CALIBRATION_SAMPLES);
            if (calibration.openSamples() >= CALIBRATION_SAMPLES) {
                ble.sendStatus("cal:open:done");
                currentState = State::NORMAL;
            }
        }
    } else if (currentState == State::CAL_FIST) {
        if (calibration.fistSamples() < CALIBRATION_SAMPLES) {
            calibration.captureFistSample(sensors);
            Serial.printf("[CAL-FIST] %d/%d\n", calibration.fistSamples(), CALIBRATION_SAMPLES);
            if (calibration.fistSamples() >= CALIBRATION_SAMPLES) {
                ble.sendStatus("cal:fist:done");
                currentState = State::NORMAL;
            }
        }
    }

    // Read sensors and build packet
    SensorPacket pkt = {};
    pkt.seq = packetSeq++;
    pkt.timestamp = now;
    pkt.hand_id = 0;  // right hand MVP
    pkt.status = calibration.isCalibrated() ? 0x01 : 0x00;
    if (ble.isConnected()) pkt.status |= 0x02;

    if (!sensors.read(pkt)) {
        Serial.println("[ERR] sensor read failed");
    } else if ((pkt.seq % 5) == 0) {
        Serial.printf(
            "[DATA] seq=%u flex=%u,%u,%u,%u,%u accel=%d,%d,%d gyro=%d,%d,%d cal=%u ble=%u imu=%u sda=%u scl=%u\n",
            pkt.seq,
            pkt.flex[0], pkt.flex[1], pkt.flex[2], pkt.flex[3], pkt.flex[4],
            pkt.accel[0], pkt.accel[1], pkt.accel[2],
            pkt.gyro[0], pkt.gyro[1], pkt.gyro[2],
            (pkt.status & 0x01) != 0,
            (pkt.status & 0x02) != 0,
            sensors.imuOk(), digitalRead(IMU_SDA), digitalRead(IMU_SCL));
    }

    // Send via BLE
    if (ble.isConnected()) {
        if (!ble.notify(pkt)) {
            Serial.println("[WARN] BLE notify failed");
        }
    }
}

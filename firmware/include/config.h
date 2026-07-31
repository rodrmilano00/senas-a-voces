#pragma once

#include <cstdint>

// ---------------------------------------------------------------------------
// Hardware configuration: ESP32-S3-WROOM-1 N16R8, single right-hand glove
// Pin numbers correspond to the silkscreen labels 1..44 printed on the board.
// Flex: GPIO16/15/7/4/8; I2C: GPIO18 (SDA) / GPIO17 (SCL); interrupt unused.
// ---------------------------------------------------------------------------

// Flex sensors (ZD10-100 + 10k pull-down)
constexpr uint8_t FLEX_PIN_THUMB  = 16;  // ADC2_CH5
constexpr uint8_t FLEX_PIN_INDEX  = 15;  // ADC2_CH4
constexpr uint8_t FLEX_PIN_MIDDLE = 7;   // ADC1_CH6
constexpr uint8_t FLEX_PIN_RING   = 4;   // ADC1_CH3
constexpr uint8_t FLEX_PIN_PINKY  = 8;   // ADC1_CH7

// HW-290 MPU6050 I2C
constexpr uint8_t IMU_SDA  = 18;
constexpr uint8_t IMU_SCL  = 17;
constexpr uint8_t IMU_INT1 = 255;
constexpr uint8_t IMU_ADDR = 0x68;     // 0x68 (default) or 0x69

// Status LED (onboard RGB LED controlled by GPIO47)
constexpr uint8_t LED_PIN = 47;

// ---------------------------------------------------------------------------
// Sampling & timing
// ---------------------------------------------------------------------------
constexpr uint32_t SAMPLE_RATE_HZ = 50;          // target Hz
constexpr uint32_t SAMPLE_PERIOD_MS = 1000 / SAMPLE_RATE_HZ;
constexpr uint8_t FLEX_SMOOTH_WINDOW = 5;        // moving average samples

// ---------------------------------------------------------------------------
// BLE GATT service & characteristics UUIDs
// ---------------------------------------------------------------------------
constexpr const char* SERVICE_UUID         = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* CHAR_DATA_UUID       = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* CHAR_COMMAND_UUID    = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// BLE device name
constexpr const char* DEVICE_NAME = "SenasAVoces-Glove-R";

// ---------------------------------------------------------------------------
// Command opcodes (1 byte, written from central -> command characteristic)
// ---------------------------------------------------------------------------
enum class Command : uint8_t {
    NONE              = 0x00,
    CALIBRATE_OPEN    = 0x01,   // capture hand-open flex values
    CALIBRATE_FIST    = 0x02,   // capture hand-fist flex values
    SAVE_CALIBRATION  = 0x03,   // store current min/max to NVS
    CLEAR_CALIBRATION = 0x04,   // reset calibration to defaults
    SET_LED_ON        = 0x10,
    SET_LED_OFF       = 0x11,
};

// ---------------------------------------------------------------------------
// Binary packet struct (16-bit aligned, little-endian)
// Total payload size: 2 + 10 + 12 + 4 + 1 = 29 bytes
// ---------------------------------------------------------------------------
#pragma pack(push, 1)
struct SensorPacket {
    uint16_t seq;            // packet sequence counter
    uint16_t flex[5];        // 5 flex sensors, 12-bit ADC left-justified to 16-bit
    int16_t  accel[3];       // accel X/Y/Z, mg
    int16_t  gyro[3];        // gyro X/Y/Z, millidegrees per second scaled
    uint32_t timestamp;      // millis() at capture
    uint8_t  hand_id;        // 0 = right (MVP), 1 = reserved for left
    uint8_t  status;         // bit 0: calibrated, bit 1: connected
};
#pragma pack(pop)

static_assert(sizeof(SensorPacket) == 30, "SensorPacket size must be 30 bytes");

// ---------------------------------------------------------------------------
// Calibration defaults
// ---------------------------------------------------------------------------
constexpr uint16_t ADC_DEFAULT_MIN = 0;       // straight/flexed low
constexpr uint16_t ADC_DEFAULT_MAX = 4095;    // bent/flexed high
constexpr uint8_t  CALIBRATION_SAMPLES = 32;

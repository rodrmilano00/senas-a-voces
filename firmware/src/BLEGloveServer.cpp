#include "BLEGloveServer.h"
#include <Arduino.h>

// ---------------------------------------------------------------------------
// Internal BLE callbacks
// ---------------------------------------------------------------------------
class BLEGloveServer::ServerCallbacks : public NimBLEServerCallbacks {
    BLEGloveServer& parent;
public:
    explicit ServerCallbacks(BLEGloveServer& p) : parent(p) {}

    void onConnect(NimBLEServer* pServer, ble_gap_conn_desc* desc) override {
        parent.connected = true;
        Serial.println("[BLE] client connected");
        // Stop advertising while connected; central may subscribe
        if (parent.advertising && parent.advertising->isAdvertising()) {
            parent.advertising->stop();
        }
    }

    void onDisconnect(NimBLEServer* pServer, ble_gap_conn_desc* desc) override {
        parent.connected = false;
        Serial.println("[BLE] client disconnected, restarting advertising");
        parent.restartAdvertising();
    }
};

class BLEGloveServer::CommandCallbacks : public NimBLECharacteristicCallbacks {
    BLEGloveServer& parent;
public:
    explicit CommandCallbacks(BLEGloveServer& p) : parent(p) {}

    void onWrite(NimBLECharacteristic* pCharacteristic, ble_gap_conn_desc* desc) override {
        std::string value = pCharacteristic->getValue();
        if (value.empty()) return;
        if (parent.commandCb) {
            parent.commandCb(static_cast<Command>(static_cast<uint8_t>(value[0])));
        }
    }
};

// ---------------------------------------------------------------------------
// BLEGloveServer implementation
// ---------------------------------------------------------------------------
BLEGloveServer::BLEGloveServer() = default;

bool BLEGloveServer::begin(const char* deviceName, CommandCallback onCommand) {
    commandCb = onCommand;

    NimBLEDevice::init(deviceName);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);  // +9 dBm for long range

    server = NimBLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks(*this));

    service = server->createService(SERVICE_UUID);

    // Data characteristic: notify only, from ESP32 to phone
    dataChar = service->createCharacteristic(
        CHAR_DATA_UUID,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);

    // Command characteristic: write only, from phone to ESP32
    cmdChar = service->createCharacteristic(
        CHAR_COMMAND_UUID,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::WRITE |
        NIMBLE_PROPERTY::NOTIFY);
    cmdChar->setCallbacks(new CommandCallbacks(*this));

    service->start();

    startAdvertising();
    return true;
}

void BLEGloveServer::startAdvertising() {
    advertising = NimBLEDevice::getAdvertising();
    NimBLEAdvertisementData advData;
    advData.setName(DEVICE_NAME);
    advData.setCompleteServices(NimBLEUUID(SERVICE_UUID));
    advertising->setAdvertisementData(advData);

    NimBLEAdvertisementData scanResponse;
    scanResponse.setName(DEVICE_NAME);
    advertising->setScanResponseData(scanResponse);

    advertising->addServiceUUID(SERVICE_UUID);
    advertising->start();
    advertisingOn = true;
}

void BLEGloveServer::restartAdvertising() {
    if (advertising) {
        advertising->start();
        advertisingOn = true;
    }
}

void BLEGloveServer::loop() {
    if (!connected && advertisingOn && !advertising->isAdvertising()) {
        restartAdvertising();
    }
}

bool BLEGloveServer::isConnected() const {
    return connected;
}

size_t BLEGloveServer::getMTU() const {
    return connected ? NimBLEDevice::getMTU() : 23;
}

bool BLEGloveServer::notify(const SensorPacket& packet) {
    if (!connected || !dataChar) return false;
    dataChar->setValue(reinterpret_cast<const uint8_t*>(&packet), sizeof(packet));
    dataChar->notify(true);
    return true;
}

bool BLEGloveServer::sendStatus(const char* msg) {
    if (!connected || !cmdChar) return false;
    cmdChar->setValue(reinterpret_cast<const uint8_t*>(msg), strlen(msg));
    cmdChar->notify(true);
    return true;
}

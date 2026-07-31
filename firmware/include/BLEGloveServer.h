#pragma once

#include "config.h"
#include <NimBLEDevice.h>
#include <functional>
#include <cstdint>

using CommandCallback = std::function<void(Command)>;

// ---------------------------------------------------------------------------
// BLE peripheral exposing a custom GATT service for the smart glove.
// ---------------------------------------------------------------------------
class BLEGloveServer {
public:
    BLEGloveServer();
    bool begin(const char* deviceName, CommandCallback onCommand);
    void loop();

    bool isConnected() const;
    size_t getMTU() const;

    // Send a sensor packet; returns true if notification queued.
    bool notify(const SensorPacket& packet);

    // Send a small status string over the command characteristic (Indicate)
    bool sendStatus(const char* msg);

private:
    class ServerCallbacks;
    class CommandCallbacks;

    NimBLEServer*        server   = nullptr;
    NimBLEService*       service  = nullptr;
    NimBLECharacteristic* dataChar = nullptr;
    NimBLECharacteristic* cmdChar  = nullptr;
    NimBLEAdvertising*   advertising = nullptr;

    CommandCallback commandCb;
    bool connected = false;
    bool advertisingOn = false;

    void startAdvertising();
    void restartAdvertising();

    friend class ServerCallbacks;
    friend class CommandCallbacks;
};

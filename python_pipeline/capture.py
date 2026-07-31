"""Capture raw sensor streams from the ESP32-S3 glove via BLE.

Example:
    python capture.py --label POR_FAVOR --duration 10 --out dataset/raw
"""

import argparse
import asyncio
import json
import os
import struct
import time
from datetime import datetime

import numpy as np
from bleak import BleakClient, BleakScanner

import config


def parse_packet(data: bytes):
    """Unpack the 30-byte SensorPacket from firmware."""
    if len(data) < 30:
        return None
    seq, *flex, ax, ay, az, gx, gy, gz, timestamp, hand_id, status = struct.unpack_from(
        "<HHHHHHhhh hhh IBB", data, 0
    )
    return {
        "seq": seq,
        "flex": flex,
        "accel": [ax, ay, az],
        "gyro": [gx, gy, gz],
        "timestamp": timestamp,
        "hand_id": hand_id,
        "status": status,
        "time": time.time(),
    }


async def capture_device(address: str, label: str, duration: float, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    records = []

    def notification_handler(sender, data: bytearray):
        pkt = parse_packet(bytes(data))
        if pkt:
            records.append(pkt)
            if len(records) % 50 == 0:
                print(f"  captured {len(records)} samples", end="\r")

    print(f"Connecting to {address}...")
    async with BleakClient(address) as client:
        print("Connected. Streaming...")
        await client.start_notify(config.DATA_CHAR_UUID, notification_handler)
        await asyncio.sleep(duration)
        await client.stop_notify(config.DATA_CHAR_UUID)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = os.path.join(out_dir, f"{label}_{ts}.json")
    with open(out_file, "w") as f:
        json.dump(records, f)
    print(f"\nSaved {len(records)} samples to {out_file}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True, help="Sign label for this recording")
    parser.add_argument("--duration", type=float, default=10.0, help="Capture duration in seconds")
    parser.add_argument("--out", default=config.RAW_DIR)
    parser.add_argument("--address", default=None, help="BLE MAC address; if omitted, scans for device name prefix")
    args = parser.parse_args()

    address = args.address
    if not address:
        print("Scanning for glove...")
        devices = await BleakScanner.discover(timeout=5.0)
        for d in devices:
            if d.name and "SenasAVoces" in d.name:
                address = d.address
                print(f"Found {d.name} at {address}")
                break
        if not address:
            print("No SenasAVoces glove found.")
            return

    await capture_device(address, args.label, args.duration, args.out)


if __name__ == "__main__":
    asyncio.run(main())

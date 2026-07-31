"""Shared configuration for the LSM training pipeline."""

# BLE identifiers (same as firmware)
SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
DATA_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
COMMAND_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

# Sampling
SAMPLE_RATE = 50  # Hz
DT_MS = 1000 / SAMPLE_RATE

# Channels
N_FLEX = 5
N_ACCEL = 3
N_GYRO = 3
N_STATIC_FEATURES = N_FLEX + N_ACCEL + N_GYRO + N_FLEX  # 5 flex + 3 accel + 3 gyro + 5 diffs = 16
N_DYNAMIC_FEATURES = N_FLEX + N_ACCEL + N_GYRO  # 11

# Window sizes
DYNAMIC_WINDOW = 60  # 1.2s
STATIC_WINDOW = 5

# Model / training
RANDOM_SEED = 42
TEST_SIZE = 0.15
VAL_SIZE = 0.15  # of remaining after test split

# File paths
RAW_DIR = "dataset/raw"
PROCESSED_DIR = "dataset/processed"
STATIC_MODEL_PATH = "../flutter_app/assets/models/static.tflite"
DYNAMIC_MODEL_PATH = "../flutter_app/assets/models/dynamic.tflite"
LABEL_MAP_PATH = "dataset/label_map.json"

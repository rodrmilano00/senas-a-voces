"""Preprocess raw recordings into static/dynamic training datasets.

Static dataset: 16-feature vectors from small windows.
Dynamic dataset: segmented gesture windows of length DYNAMIC_WINDOW.
"""

import argparse
import json
import os
from glob import glob

import numpy as np
import yaml

import config


def normalize_flex(v):
    return v / 4095.0


def extract_static_features(window):
    """16-D feature vector matching Flutter LsmClassifier."""
    last = window[-1]
    flex_norm = normalize_flex(np.array(last["flex"]))
    accel_norm = np.array(last["accel"]) / 1000.0
    gyro_norm = np.array(last["gyro"]) / 1000.0
    diffs = np.zeros(config.N_FLEX)
    if len(window) >= 2:
        prev = window[-2]
        diffs = normalize_flex(np.array(last["flex"]) - np.array(prev["flex"]))
    return np.concatenate([flex_norm, accel_norm, gyro_norm, diffs]).astype(np.float32)


def extract_dynamic_window(window):
    """[T, 11] normalized tensor."""
    arr = []
    for frame in window:
        flex_norm = normalize_flex(np.array(frame["flex"]))
        accel_norm = np.array(frame["accel"]) / 1000.0
        gyro_norm = np.array(frame["gyro"]) / 1000.0
        arr.append(np.concatenate([flex_norm, accel_norm, gyro_norm]))
    return np.array(arr, dtype=np.float32)


def segment_gesture(records, threshold=0.08, min_len=config.DYNAMIC_WINDOW):
    """Very simple motion-based segmentation. Returns list of windows."""
    motion = np.array([
        np.linalg.norm(np.diff(np.array(r["flex"])) / 4095.0) +
        np.linalg.norm(np.diff(np.array(r["accel"])) / 1000.0)
        for r in records
    ])
    # binary mask
    active = motion > threshold
    # find contiguous regions
    regions = []
    start = None
    for i, a in enumerate(active):
        if a and start is None:
            start = i
        if not a and start is not None:
            if i - start >= min_len:
                regions.append((start, i))
            start = None
    if start is not None and len(records) - start >= min_len:
        regions.append((start, len(records)))

    windows = []
    for s, e in regions:
        # take the last DYNAMIC_WINDOW frames of the region
        w = records[max(0, e - config.DYNAMIC_WINDOW):e]
        if len(w) == config.DYNAMIC_WINDOW:
            windows.append(w)
    return windows


def process_label(label_dir, label, label_idx):
    raw_files = glob(os.path.join(label_dir, "*.json"))
    static_X, static_y = [], []
    dynamic_X, dynamic_y = [], []

    for f in raw_files:
        with open(f) as fp:
            records = json.load(fp)

        # static: sliding window over whole recording
        for i in range(config.STATIC_WINDOW, len(records), 2):
            feat = extract_static_features(records[i - config.STATIC_WINDOW:i + 1])
            static_X.append(feat)
            static_y.append(label_idx)

        # dynamic: motion segmented windows
        for w in segment_gesture(records):
            dynamic_X.append(extract_dynamic_window(w))
            dynamic_y.append(label_idx)

    return np.array(static_X), np.array(static_y), np.array(dynamic_X), np.array(dynamic_y)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", default=config.RAW_DIR)
    parser.add_argument("--out", default=config.PROCESSED_DIR)
    parser.add_argument("--map", default=config.LABEL_MAP_PATH)
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    labels = sorted([d for d in os.listdir(args.raw) if os.path.isdir(os.path.join(args.raw, d))])
    label_to_idx = {l: i for i, l in enumerate(labels)}
    with open(args.map, "w") as f:
        json.dump(label_to_idx, f, indent=2)

    all_sx, all_sy, all_dx, all_dy = [], [], [], []
    for label in labels:
        print(f"Processing {label}...")
        sx, sy, dx, dy = process_label(os.path.join(args.raw, label), label, label_to_idx[label])
        if len(sx):
            all_sx.append(sx); all_sy.append(sy)
        if len(dx):
            all_dx.append(dx); all_dy.append(dy)

    if all_sx:
        np.savez(os.path.join(args.out, "static.npz"),
                 X=np.concatenate(all_sx), y=np.concatenate(all_sy), labels=labels)
    if all_dx:
        np.savez(os.path.join(args.out, "dynamic.npz"),
                 X=np.concatenate(all_dx), y=np.concatenate(all_dy), labels=labels)

    print(f"Static samples: {sum(len(a) for a in all_sx)}")
    print(f"Dynamic samples: {sum(len(a) for a in all_dx)}")
    print(f"Label map saved to {args.map}")


if __name__ == "__main__":
    main()

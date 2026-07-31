"""Train a static sign classifier and export to TFLite.

Input: dataset/processed/static.npz
Output: ../flutter_app/assets/models/static.tflite
"""

import argparse
import json
import os

import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split

import config


def build_model(input_dim, num_classes):
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(input_dim,)),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def representative_dataset(X):
    def _generator():
        for i in range(min(1000, len(X))):
            yield [X[i:i + 1].astype(np.float32)]
    return _generator


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=os.path.join(config.PROCESSED_DIR, "static.npz"))
    parser.add_argument("--out", default=config.STATIC_MODEL_PATH)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--int8", action="store_true", help="Quantize to INT8")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out), exist_ok=True)

    data = np.load(args.data, allow_pickle=True)
    X, y = data["X"], data["y"]
    labels = list(data["labels"])
    num_classes = len(labels)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=config.TEST_SIZE, random_state=config.RANDOM_SEED, stratify=y
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_train, y_train, test_size=config.VAL_SIZE, random_state=config.RANDOM_SEED, stratify=y_train
    )

    model = build_model(config.N_STATIC_FEATURES, num_classes)
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=args.epochs,
        batch_size=32,
        callbacks=[tf.keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True)],
        verbose=1,
    )

    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"Test accuracy: {test_acc:.4f}")

    # Save standard float32 TFLite
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()
    with open(args.out.replace(".tflite", "_fp32.tflite"), "wb") as f:
        f.write(tflite_model)

    if args.int8:
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.representative_dataset = representative_dataset(X_train)
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type = tf.int8
        converter.inference_output_type = tf.int8
        tflite_model = converter.convert()
        out_path = args.out
    else:
        out_path = args.out

    with open(out_path, "wb") as f:
        f.write(tflite_model)
    print(f"Static model saved to {out_path}")


if __name__ == "__main__":
    main()

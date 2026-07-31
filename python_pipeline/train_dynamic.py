"""Train a dynamic sign classifier (LSTM) and export to TFLite.

Input: dataset/processed/dynamic.npz
Output: ../flutter_app/assets/models/dynamic.tflite
"""

import argparse
import os

import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split

import config


def build_model(time_steps, features, num_classes):
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(time_steps, features)),
        tf.keras.layers.Conv1D(64, 5, activation="relu", padding="same"),
        tf.keras.layers.MaxPooling1D(2),
        tf.keras.layers.LSTM(64, return_sequences=True),
        tf.keras.layers.LSTM(64),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(0.3),
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
        for i in range(min(500, len(X))):
            yield [X[i:i + 1].astype(np.float32)]
    return _generator


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=os.path.join(config.PROCESSED_DIR, "dynamic.npz"))
    parser.add_argument("--out", default=config.DYNAMIC_MODEL_PATH)
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

    model = build_model(config.DYNAMIC_WINDOW, config.N_DYNAMIC_FEATURES, num_classes)
    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=args.epochs,
        batch_size=32,
        callbacks=[tf.keras.callbacks.EarlyStopping(patience=12, restore_best_weights=True)],
        verbose=1,
    )

    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"Test accuracy: {test_acc:.4f}")

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

    with open(args.out, "wb") as f:
        f.write(tflite_model)
    print(f"Dynamic model saved to {args.out}")


if __name__ == "__main__":
    main()

"""Evaluate exported TFLite models."""

import argparse
import json
import os

import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix

import config


def load_interpreter(path):
    interpreter = tf.lite.Interpreter(model_path=path)
    interpreter.allocate_tensors()
    return interpreter


def predict(interpreter, X):
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    out_shape = output_details[0]["shape"][1]

    preds = []
    for x in X:
        inp = np.expand_dims(x, axis=0).astype(input_details[0]["dtype"])
        interpreter.set_tensor(input_details[0]["index"], inp)
        interpreter.invoke()
        out = interpreter.get_tensor(output_details[0]["index"])
        preds.append(np.argmax(out, axis=-1)[0])
    return np.array(preds)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to .tflite model")
    parser.add_argument("--data", required=True, help="Path to .npz dataset")
    parser.add_argument("--map", default=config.LABEL_MAP_PATH)
    args = parser.parse_args()

    data = np.load(args.data, allow_pickle=True)
    X, y = data["X"], data["y"]
    labels = list(data["labels"])

    interpreter = load_interpreter(args.model)
    preds = predict(interpreter, X)

    print("Classification report:")
    print(classification_report(y, preds, target_names=labels, zero_division=0))

    print("Confusion matrix:")
    print(confusion_matrix(y, preds))


if __name__ == "__main__":
    main()

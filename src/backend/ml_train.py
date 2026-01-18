import json
import os
import sys
from datetime import datetime

import numpy as np
import tensorflow as tf


def _safe_parse_timestamp(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def load_events(path):
    with open(path, "r", encoding="utf-8") as handle:
        events = json.load(handle)
    return events


def build_sequences(labels, seq_len):
    sequences = []
    targets = []
    for idx in range(len(labels) - seq_len):
        sequences.append(labels[idx : idx + seq_len])
        targets.append(labels[idx + seq_len])
    return np.array(sequences, dtype=np.int32), np.array(targets, dtype=np.int32)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing events file path."}))
        return 0

    events = load_events(sys.argv[1])
    if not events:
        print(json.dumps({"error": "No events found for training."}))
        return 0

    # Ensure chronological order if timestamps are available.
    parsed = [
        (event, _safe_parse_timestamp(event.get("timestamp", "")))
        for event in events
    ]
    if any(ts is not None for _, ts in parsed):
        parsed.sort(key=lambda item: item[1] or datetime.min)
        events = [event for event, _ in parsed]

    labels = [event.get("type") for event in events if event.get("type")]
    if len(labels) < 2:
        print(json.dumps({"error": "Not enough labeled events to train."}))
        return 0

    unique_labels = sorted(set(labels))
    label_to_idx = {label: idx for idx, label in enumerate(unique_labels)}
    idx_to_label = {idx: label for label, idx in label_to_idx.items()}

    encoded = [label_to_idx[label] for label in labels]

    seq_len = 5
    if len(encoded) <= seq_len:
        print(json.dumps({"error": "Collect more events before training."}))
        return 0

    x, y = build_sequences(encoded, seq_len)

    num_classes = len(unique_labels)
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Embedding(num_classes, 8, input_length=seq_len),
            tf.keras.layers.LSTM(32),
            tf.keras.layers.Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    callbacks = []
    validation_split = 0.2 if len(x) >= 10 else 0.0
    if validation_split:
        callbacks.append(
            tf.keras.callbacks.EarlyStopping(
                monitor="val_loss",
                patience=3,
                restore_best_weights=True,
            )
        )

    model.fit(
        x,
        y,
        epochs=25,
        batch_size=16,
        validation_split=validation_split,
        verbose=0,
        callbacks=callbacks,
    )

    model_dir = os.path.join(os.path.dirname(__file__), "ml_model")
    os.makedirs(model_dir, exist_ok=True)
    model.save(os.path.join(model_dir, "model.keras"))
    with open(os.path.join(model_dir, "meta.json"), "w", encoding="utf-8") as handle:
        json.dump(
            {"labels": unique_labels, "seq_len": seq_len},
            handle,
            ensure_ascii=True,
        )

    last_seq = np.array(encoded[-seq_len:], dtype=np.int32)[None, :]
    probs = model.predict(last_seq, verbose=0)[0]
    result = {idx_to_label[i]: float(probs[i]) for i in range(num_classes)}
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

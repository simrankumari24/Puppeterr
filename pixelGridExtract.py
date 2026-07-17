#!/usr/bin/env python3
import base64
import json
import sys

import cv2
import numpy as np


def read_input_b64() -> str:
    if len(sys.argv) > 3:
        return sys.argv[3]
    if len(sys.argv) > 1 and sys.argv[1].strip() and len(sys.argv) > 2:
        return sys.stdin.read().strip() or sys.argv[1].strip()
    data = sys.stdin.read().strip()
    return data or (sys.argv[1].strip() if len(sys.argv) > 1 else "")


def decode_image(image_b64: str):
    payload = image_b64.strip()
    if payload.startswith("data:") and "," in payload:
        payload = payload.split(",", 1)[1]
    raw = base64.b64decode(payload)
    array = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError("unable to decode image")
    return image


def build_symbolic_grid(image, columns: int, rows: int):
    columns = max(1, int(columns))
    rows = max(1, int(rows))
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (columns, rows), interpolation=cv2.INTER_AREA)
    flat = resized.reshape(-1).astype(np.float32)
    threshold = float(np.median(flat))
    grid = []
    for row_index in range(rows):
        line = []
        for column_index in range(columns):
            value = float(resized[row_index, column_index])
            line.append("R" if value >= threshold else "G")
        grid.append("".join(line))
    return {
        "grid": grid,
        "width": width,
        "height": height,
        "columns": columns,
        "rows": rows,
        "threshold": threshold,
    }


def main():
    try:
        columns = int(sys.argv[1]) if len(sys.argv) > 1 else 48
        rows = int(sys.argv[2]) if len(sys.argv) > 2 else 24
        image_b64 = read_input_b64()
        if not image_b64:
            raise RuntimeError("image base64 input required")
        image = decode_image(image_b64)
        result = build_symbolic_grid(image, columns, rows)
        sys.stdout.write(json.dumps(result))
    except Exception as error:
        sys.stderr.write(str(error))
        sys.exit(1)


if __name__ == "__main__":
    main()

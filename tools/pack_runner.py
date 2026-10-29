"""Pack 128x128 runner frames into the game's sprite sheets.

Usage: python tools/pack_runner.py art/runner public/sprites

Reads runner_01.png .. runner_08.png (the run cycle), drops stray
specks by keeping the largest connected region of each frame, adds a
ground shadow and writes one sheet per animation plus manifest.json.
Idle, dip and celebrate reuse single run frames until they have art.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
FW = FH = 128
FOOT_Y = 121


def largest_component(m):
    h, w = m.shape
    label = np.zeros((h, w), dtype=np.int32)
    best, best_n, n = 0, 0, 0
    for sy, sx in zip(*np.where(m)):
        if label[sy, sx]:
            continue
        n += 1
        stack = [(sy, sx)]
        label[sy, sx] = n
        size = 0
        while stack:
            y, x = stack.pop()
            size += 1
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not label[yy, xx]:
                    label[yy, xx] = n
                    stack.append((yy, xx))
        if size > best_n:
            best, best_n = n, size
    return label == best


def load(i):
    a = np.array(Image.open(f"{SRC}/runner_{i:02d}.png").convert("RGBA"))
    keep = largest_component(a[..., 3] > 0)
    a[~keep] = 0
    img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse(
        [FW // 2 - 26, FOOT_Y - 3, FW // 2 + 24, FOOT_Y + 4], fill=(10, 8, 20, 70)
    )
    img.alpha_composite(Image.fromarray(a, "RGBA"))
    return img


frames = [load(i) for i in range(1, 9)]


def sheet(idx):
    img = Image.new("RGBA", (FW * len(idx), FH), (0, 0, 0, 0))
    for i, k in enumerate(idx):
        img.paste(frames[k], (i * FW, 0))
    return img


ANIMS = {
    "idle": ([1], 2, True),
    "jog": (list(range(8)), 10, True),
    "sprint": (list(range(8)), 16, True),
    "dip": ([5], 8, False),
    "celebrate": ([1], 5, True),
}
manifest = {}
for name, (idx, fps, loop) in ANIMS.items():
    sheet(idx).save(f"{OUT}/{name}.png")
    entry = {
        "src": f"/sprites/{name}.png",
        "frames": len(idx),
        "frameWidth": FW,
        "frameHeight": FH,
        "fps": fps,
    }
    if not loop:
        entry["loop"] = False
    manifest[name] = entry
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=2)

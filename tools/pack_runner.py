"""Pack 128x128 runner frames into the game's sprite sheets.

Usage: python tools/pack_runner.py art/runner public/sprites

Frames come from the generated sets in art/runner (runner_NN,
idle_bouncing_NN, exhausted_stop_NN, trip_and_fall_NN,
finish_line_lean_NN, celebration_NN). Thin
vertical line artifacts are dropped, dust and breath puffs are kept,
a ground shadow is added, and one sheet per animation is written with
manifest.json. A `next` entry chains a play-once animation into
another when it finishes.
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
FW = FH = 128
FOOT_Y = 121

# name: (file prefix, 1-based frame numbers, fps, loop, next)
# Celebration frames 4, 9, 10 and 11 came out corrupted and are skipped.
ANIMS = {
    "idle": ("idle_bouncing", range(1, 9), 8, True, None),
    "rest": ("exhausted_stop", range(9, 13), 5, True, None),
    "jog": ("runner", range(1, 9), 10, True, None),
    "sprint": ("runner", range(1, 9), 16, True, None),
    "stop": ("exhausted_stop", range(1, 9), 10, False, "rest"),
    "fall": ("trip_and_fall", range(1, 13), 10, False, None),
    "dip": ("finish_line_lean", range(1, 9), 10, False, "celebrate"),
    "celebrate": ("celebration", [5, 6, 7, 8, 1, 2, 3, 12], 8, True, None),
}


def components(m):
    """Label 4-connected regions; returns (label map, count)."""
    h, w = m.shape
    label = np.zeros((h, w), dtype=np.int32)
    n = 0
    for sy, sx in zip(*np.where(m)):
        if label[sy, sx]:
            continue
        n += 1
        stack = [(sy, sx)]
        label[sy, sx] = n
        while stack:
            y, x = stack.pop()
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not label[yy, xx]:
                    label[yy, xx] = n
                    stack.append((yy, xx))
    return label, n


def clean(a):
    """Drop the generator's line artifacts: tall vertical runs of
    pixels whose horizontal extent is at most 4px, whether or not they
    touch the figure. No body part is that thin for that long."""
    solid = a[..., 3] > 0
    h, w = solid.shape
    thin = np.zeros_like(solid)
    for y in range(h):
        x = 0
        while x < w:
            if not solid[y, x]:
                x += 1
                continue
            x0 = x
            while x < w and solid[y, x]:
                x += 1
            if x - x0 <= 4:
                thin[y, x0:x] = True
    for x in range(w):
        run = 0
        for y in range(h + 1):
            if y < h and thin[y, x]:
                run += 1
            else:
                if run >= 12:
                    a[y - run:y, x] = 0
                run = 0
    # Then drop any detached crumbs that are left behind.
    label, n = components(a[..., 3] > 0)
    for k in range(1, n + 1):
        if (label == k).sum() < 12:
            a[label == k] = 0
    return a


def load(prefix, i):
    a = np.array(Image.open(f"{SRC}/{prefix}_{i:02d}.png").convert("RGBA"))
    a = clean(a)
    img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse(
        [FW // 2 - 26, FOOT_Y - 3, FW // 2 + 24, FOOT_Y + 4], fill=(10, 8, 20, 70)
    )
    img.alpha_composite(Image.fromarray(a, "RGBA"))
    return img


manifest = {}
for name, (prefix, nums, fps, loop, nxt) in ANIMS.items():
    frames = [load(prefix, i) for i in nums]
    sheet = Image.new("RGBA", (FW * len(frames), FH), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.paste(fr, (i * FW, 0))
    sheet.save(f"{OUT}/{name}.png")
    entry = {
        "src": f"/sprites/{name}.png",
        "frames": len(frames),
        "frameWidth": FW,
        "frameHeight": FH,
        "fps": fps,
    }
    if not loop:
        entry["loop"] = False
    if nxt:
        entry["next"] = nxt
    manifest[name] = entry
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=2)

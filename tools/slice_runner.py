"""Slice an AI-generated 4x2 run-cycle sheet into 128x128 game frames."""
import json, sys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
FW = FH = 128
FOOT_Y = 118
TARGET_H = 106

src = Image.open(SRC).convert("RGB")
a = np.array(src).astype(int)
bg = np.array([22, 52, 64])
dist = np.abs(a - bg).sum(2)
teal = (a[..., 2] > a[..., 0] + 8) & (a[..., 1] > a[..., 0] + 5) & (a[..., 0] < 60)
keep = (dist > 45) & ~teal
# Fill small holes inside the figure (dark pixels that matched teal).
from PIL import ImageFilter
km = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
keep = (np.array(km) > 0) & (dist > 20)

def largest_component(m):
    """Keep only the biggest 4-connected region (drops shadow specks)."""
    h, w = m.shape
    label = np.zeros((h, w), dtype=np.int32)
    best, best_n = 0, 0
    n = 0
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

W, H = src.size
cols, rows = 4, 2
cw, ch = W // cols, H // rows
frames = []
for r in range(rows):
    for c in range(cols):
        m = keep[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]
        m = largest_component(m)
        ys, xs = np.where(m)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rgb = a[r * ch + y0:r * ch + y1, c * cw + x0:c * cw + x1]
        alpha = m[y0:y1, x0:x1]
        rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
        frames.append(rgba)

scale = TARGET_H / max(f.shape[0] for f in frames)

def shrink(rgba):
    # Premultiply so the background never bleeds into edges, then
    # re-threshold alpha for a crisp pixel edge.
    f = rgba.astype(float)
    al = f[..., 3:4] / 255
    pm = Image.fromarray(np.dstack([f[..., :3] * al, f[..., 3:4]]).astype(np.uint8), "RGBA")
    w, h = pm.size
    small = np.array(pm.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BOX)).astype(float)
    al = small[..., 3:4] / 255
    rgb = np.clip(small[..., :3] / np.maximum(al, 1e-3), 0, 255)
    solid = (al[..., 0] > 0.45)
    out = np.zeros_like(small, dtype=np.uint8)
    out[..., :3] = rgb
    out[..., 3] = solid * 255
    return out

def place(f):
    canvas = np.zeros((FH, FW, 4), dtype=np.uint8)
    h, w = f.shape[:2]
    ys, xs = np.where(f[..., 3] > 0)
    bottom = ys.max() + 1
    cx = (xs.min() + xs.max()) // 2
    oy = FOOT_Y - bottom
    ox = FW // 2 - cx
    for y in range(h):
        for x in range(w):
            if f[y, x, 3] and 0 <= y + oy < FH and 0 <= x + ox < FW:
                canvas[y + oy, x + ox] = f[y, x]
    # Ground shadow under the figure.
    img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    from PIL import ImageDraw
    ImageDraw.Draw(img).ellipse([FW // 2 - 26, FOOT_Y - 2, FW // 2 + 24, FOOT_Y + 5], fill=(10, 8, 20, 70))
    img.alpha_composite(Image.fromarray(canvas, "RGBA"))
    return img

placed = [place(shrink(f)) for f in frames]

def sheet(idx):
    img = Image.new("RGBA", (FW * len(idx), FH), (0, 0, 0, 0))
    for i, k in enumerate(idx):
        img.paste(placed[k], (i * FW, 0))
    return img

anims = {
    "idle": ([1], 2, True),
    "jog": (list(range(8)), 10, True),
    "sprint": (list(range(8)), 16, True),
    "dip": ([5], 8, False),
    "celebrate": ([1], 5, True),
}
manifest = {}
for name, (idx, fps, loop) in anims.items():
    sheet(idx).save(f"{OUT}/{name}.png")
    e = {"src": f"/sprites/{name}.png", "frames": len(idx), "frameWidth": FW, "frameHeight": FH, "fps": fps}
    if not loop:
        e["loop"] = False
    manifest[name] = e
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=2)

prev = Image.new("RGBA", (FW * 8, FH), (181, 80, 60, 255))
prev.alpha_composite(sheet(list(range(8))))
prev.resize((FW * 16, FH * 2), Image.NEAREST).save(f"{OUT}/preview.png")

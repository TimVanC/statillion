"""Render the runner sprite sheets (128x128 frames) as PNGs.

Each body part is a tapered polygon drawn into a part-id map. Colors
come afterwards from that map: four tones per material chosen by how
deep a pixel sits from the lit (upper-right) and shaded (lower-left)
edges of its part, far-side limbs pushed darker, a soft outline in
each material's darkest tone, and a ground shadow.
Usage: python runner_art.py OUT_DIR
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw

W = H = 128
FOOT_Y = 118  # ground line inside the frame

# Material palette, darkest to lightest: outline, shadow, base, light, rim.
MAT = {
    "skin": ("#5a2f24", "#b8734c", "#e9a87a", "#f5c79d", "#ffe3c4"),
    "hair": ("#1d1210", "#3a241a", "#5b3a2a", "#7a5038", "#9a6a4c"),
    "singlet": ("#4a1408", "#a6321a", "#e9502a", "#ff7a52", "#ffa58a"),
    "stripe": ("#4a1408", "#c9b7a0", "#f3e6d0", "#fff8ec", "#ffffff"),
    "shorts": ("#0f1730", "#1c2a4f", "#2f416e", "#45598a", "#6376a8"),
    "shoe": ("#3a3630", "#b6ad9c", "#eee8da", "#fbf7ee", "#ffffff"),
    "sole": ("#5a3c12", "#c48c3a", "#fac775", "#ffd99a", "#ffe9c0"),
    "face": ("#5a2f24", "#a8663f", "#c9875c", "#d99a70", "#d99a70"),
}
MOTION = (242, 237, 228, 140)

HIP = (58.0, 64.0)
TORSO = 27.0
NECK = 5.0
THIGH = 22.0
SHIN = 22.0
UPPER_ARM = 14.0
FOREARM = 13.0
HEAD_R = 10.5


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def pt(x, y, ang, length):
    """Angles from straight down, positive toward screen right."""
    return x + math.sin(ang) * length, y + math.cos(ang) * length


def up(x, y, lean, length):
    return x + math.sin(lean) * length, y - math.cos(lean) * length


class Frame:
    def __init__(self):
        self.part = np.zeros((H, W), dtype=np.int32)
        self.mat = np.empty((H, W), dtype=object)
        self.far = np.zeros((H, W), dtype=bool)
        self.extra = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.next_id = 1
        self.ground_x = HIP[0]

    def _stamp(self, mask, material, far, merge_with=None):
        m = np.array(mask) > 0
        pid = merge_with if merge_with else self.next_id
        self.part[m] = pid
        self.mat[m] = material
        self.far[m] = far
        if not merge_with:
            self.next_id += 1
        return pid

    def poly(self, points, material, far=False, merge_with=None):
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon([(round(x), round(y)) for x, y in points], fill=255)
        return self._stamp(mask, material, far, merge_with)

    def ellipse(self, cx, cy, rx, ry, material, far=False, merge_with=None):
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
        return self._stamp(mask, material, far, merge_with)

    def tapered(self, x0, y0, x1, y1, w0, w1, material, far=False, bulge=None, round_end=True):
        """Limb segment: quad (or hexagon with a mid bulge) plus a round joint."""
        dx, dy = x1 - x0, y1 - y0
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        pts = [(x0 + nx * w0 / 2, y0 + ny * w0 / 2)]
        if bulge:
            t, wb = bulge
            bx, by = x0 + dx * t, y0 + dy * t
            pts.append((bx + nx * wb / 2, by + ny * wb / 2))
        pts.append((x1 + nx * w1 / 2, y1 + ny * w1 / 2))
        pts.append((x1 - nx * w1 / 2, y1 - ny * w1 / 2))
        if bulge:
            pts.append((bx - nx * wb / 2, by - ny * wb / 2))
        pts.append((x0 - nx * w0 / 2, y0 - ny * w0 / 2))
        pid = self.poly(pts, material, far)
        if round_end:
            self.ellipse(x1, y1, w1 / 2, w1 / 2, material, far, merge_with=pid)
        return pid

    def render(self):
        out = np.zeros((H, W, 4), dtype=np.uint8)
        solid = self.part > 0

        def same(pid, x, y):
            return 0 <= x < W and 0 <= y < H and self.part[y, x] == pid

        def depth(pid, x, y, dx, dy, limit=4):
            d = 0
            while d < limit and same(pid, x + dx * (d + 1), y + dy * (d + 1)):
                d += 1
            return d

        for y in range(H):
            for x in range(W):
                if not solid[y, x]:
                    continue
                pid = self.part[y, x]
                tones = [rgb(c) for c in MAT[self.mat[y, x]]]
                d_shade = min(depth(pid, x, y, -1, 1), depth(pid, x, y, 0, 1), depth(pid, x, y, -1, 0))
                d_light = min(depth(pid, x, y, 1, -1), depth(pid, x, y, 1, 0), depth(pid, x, y, 0, -1))
                if d_light == 0:
                    tone = 4 if d_shade >= 2 else 3
                elif d_shade == 0:
                    tone = 1
                elif d_shade == 1:
                    tone = 1 if d_light >= 3 else 2
                elif d_light == 1:
                    tone = 3
                else:
                    tone = 2
                color = tones[tone]
                if self.far[y, x]:
                    color = tuple(int(c * 0.68) for c in color)
                out[y, x] = (*color, 255)

        # Outline in the darkest tone of the material it touches.
        for y in range(H):
            for x in range(W):
                if solid[y, x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < W and 0 <= yy < H and solid[yy, xx]:
                        c = rgb(MAT[self.mat[yy, xx]][0])
                        if self.far[yy, xx]:
                            c = tuple(int(v * 0.8) for v in c)
                        out[y, x] = (*c, 255)
                        break

        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        shadow = ImageDraw.Draw(img)
        shadow.ellipse([self.ground_x - 22, FOOT_Y - 2, self.ground_x + 20, FOOT_Y + 5], fill=(10, 8, 20, 70))
        img.alpha_composite(Image.fromarray(out, "RGBA"))
        img.alpha_composite(self.extra)
        return img


def draw_runner(f, lean, hip_dy, legs, arms, arms_up=False, motion=False, head_tilt=0.0):
    """legs/arms: ((thigh, bend), (thigh, bend)) for near, far.
    Knees bend backward (shin = thigh - bend); elbows forward."""
    hx, hy = HIP[0], HIP[1] + hip_dy
    sx, sy = up(hx, hy, lean, TORSO)
    f.ground_x = hx + 2

    if motion:
        d = ImageDraw.Draw(f.extra)
        for i, (ox, L) in enumerate(((4, 16), (0, 22), (6, 14))):
            yy = int(hy - 26 + i * 12)
            d.rectangle([ox, yy, ox + L, yy + 1], fill=MOTION)

    def draw_leg(thigh, bend, far):
        ox = hx - (2 if far else -2)
        kx, ky = pt(ox, hy + 3, thigh, THIGH)
        shin = thigh - bend
        ax, ay = pt(kx, ky, shin, SHIN)
        f.tapered(ox, hy + 3, kx, ky, 11, 7, "skin", far)
        f.tapered(kx, ky, ax, ay, 7, 4, "skin", far, bulge=(0.3, 8))
        toe = math.pi / 2 - max(-0.15, min(0.7, -shin * 0.35))
        heel = (ax - 4 * math.sin(toe), ay + 1)
        tx, ty = pt(ax, ay + 1, toe, 12)
        pid = f.tapered(heel[0], heel[1], tx, ty, 8, 5, "shoe", far, round_end=True)
        bx, by = pt(ax, ay + 4, toe, 12)
        f.tapered(heel[0], heel[1] + 3, bx, by, 3, 3, "sole", far, round_end=False)

    def draw_arm(upper, bend, far):
        ox = sx - (3 if far else -3)
        ex, ey = pt(ox, sy + 3, upper, UPPER_ARM)
        wx, wy = pt(ex, ey, upper + bend, FOREARM)
        f.tapered(ox, sy + 3, ex, ey, 8, 5, "skin", far)
        f.tapered(ex, ey, wx, wy, 5, 4, "skin", far)
        f.ellipse(wx, wy, 3.5, 3.5, "skin", far)

    (nl, fl), (na, fa) = legs, arms
    if arms_up:
        draw_arm(math.pi + 0.5, 0.3, True)
    else:
        draw_arm(fa[0], fa[1], True)
    draw_leg(fl[0], fl[1], True)

    px, py = math.cos(lean), math.sin(lean)  # across the body

    def across(x, y, w):
        return (x - px * w / 2, y - py * w / 2), (x + px * w / 2, y + py * w / 2)

    # Torso: wide shoulders, narrow waist, hips.
    s0, s1 = across(sx, sy, 19)
    w0, w1 = across(*up(hx, hy, lean, 9), 13)
    h0, h1 = across(hx, hy, 15)
    f.poly([s0, s1, w1, h1, h0, w0], "singlet")
    # Front stripe on the jersey.
    f.poly([across(sx, sy + 2, 12)[1], across(sx, sy + 2, 6)[1],
            across(*up(hx, hy, lean, 6), 1)[1], across(*up(hx, hy, lean, 6), 7)[1]], "stripe")
    # Shorts.
    q0, q1 = across(*up(hx, hy, lean, 2), 16)
    f.poly([q0, q1, (hx + 10, hy + 11), (hx - 9, hy + 11)], "shorts")
    f.poly([(hx + 6, hy + 2), (hx + 8, hy + 2), (hx + 10, hy + 11), (hx + 8, hy + 11)], "stripe")

    draw_leg(nl[0], nl[1], False)
    if arms_up:
        draw_arm(math.pi - 0.5, -0.3, False)
    else:
        draw_arm(na[0], na[1], False)

    # Neck, head, hair. The face is a soft shadow with no features.
    cx, cy = up(sx, sy, lean, NECK)
    f.tapered(sx, sy, cx, cy, 8, 7, "skin", round_end=False)
    tilt = lean * 0.6 + head_tilt
    hx2, hy2 = up(cx, cy, tilt, HEAD_R)
    f.ellipse(hx2 + 1, hy2, HEAD_R, HEAD_R + 1, "skin")
    # Featureless face: a soft shadow under the fringe.
    f.poly([(hx2 + 2, hy2 - 2), (hx2 + 11, hy2 - 1), (hx2 + 10, hy2 + 6), (hx2 + 3, hy2 + 7)], "face")
    # Hair: a bob. Crown, back fall to the jaw line, fringe over the brow.
    f.ellipse(hx2 - 1, hy2 - 5, HEAD_R + 2, 7, "hair")
    f.poly([(hx2 - 12, hy2 - 5), (hx2 - 2, hy2 - 4), (hx2 - 3, hy2 + 9), (hx2 - 8, hy2 + 10), (hx2 - 13, hy2 + 5)], "hair")
    f.poly([(hx2 - 2, hy2 - 11), (hx2 + 10, hy2 - 8), (hx2 + 12, hy2 - 4), (hx2 + 9, hy2 - 2), (hx2 + 4, hy2 - 3), (hx2 - 2, hy2 - 5)], "hair")


STRIDE = [
    (0.55, 0.15), (0.2, 0.35), (-0.2, 0.4), (-0.6, 1.2),
    (-0.45, 2.1), (0.15, 1.9), (0.7, 1.3), (0.8, 0.6),
]
BOB = [0, 1, 0, -1, -3, -2, 0, -1]


def run_frames(amp, lean, motion):
    frames = []
    for i in range(8):
        ft, fb = STRIDE[i]
        bt, bb = STRIDE[(i + 4) % 8]
        f = Frame()
        draw_runner(
            f, lean, BOB[i],
            legs=((ft * amp, fb * amp), (bt * amp, bb * amp)),
            arms=((-ft * amp * 0.9 - 0.2, 1.5), (-bt * amp * 0.9 - 0.2, 1.5)),
            motion=motion and i % 2 == 0,
        )
        frames.append(f.render())
    return frames


def idle_frames():
    out = []
    for i in range(2):
        f = Frame()
        draw_runner(f, 0.03, i, legs=((0.05, 0.1), (-0.05, 0.05)),
                    arms=((0.12, 0.45), (-0.12, 0.45)))
        out.append(f.render())
    return out


def dip_frames():
    out = []
    for i, lean in enumerate((0.35, 0.55, 0.75, 0.9)):
        f = Frame()
        draw_runner(f, lean, i, legs=((0.7 - i * 0.1, 0.3), (-0.6, 0.9)),
                    arms=((-1.4 - i * 0.2, 0.3), (-1.4 - i * 0.2, 0.3)),
                    motion=True, head_tilt=0.2)
        out.append(f.render())
    return out


def celebrate_frames():
    out = []
    for i in (0, 1, 0, 1):
        f = Frame()
        draw_runner(f, 0.0, i, legs=((0.1, 0.1), (-0.1, 0.05)),
                    arms=((0, 0), (0, 0)), arms_up=True, head_tilt=-0.1)
        out.append(f.render())
    return out


def sheet(frames):
    img = Image.new("RGBA", (W * len(frames), H), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        img.paste(fr, (i * W, 0))
    return img


if __name__ == "__main__":
    out = sys.argv[1]
    anims = {
        "idle": (idle_frames(), 4, True),
        "jog": (run_frames(0.75, 0.12, False), 10, True),
        "sprint": (run_frames(1.0, 0.3, True), 14, True),
        "dip": (dip_frames(), 8, False),
        "celebrate": (celebrate_frames(), 5, True),
    }
    manifest = {}
    for name, (frames, fps, loop) in anims.items():
        sheet(frames).save(f"{out}/{name}.png")
        entry = {"src": f"/sprites/{name}.png", "frames": len(frames),
                 "frameWidth": W, "frameHeight": H, "fps": fps}
        if not loop:
            entry["loop"] = False
        manifest[name] = entry
    json.dump(manifest, open(f"{out}/manifest.json", "w"), indent=2)

    rows = [sheet(fr) for fr, _, _ in anims.values()]
    pw = max(r.width for r in rows)
    prev = Image.new("RGBA", (pw, H * len(rows)), (181, 80, 60, 255))
    for i, r in enumerate(rows):
        prev.alpha_composite(r, (0, i * H))
    prev.resize((pw * 2, H * len(rows) * 2), Image.NEAREST).save(f"{out}/preview.png")

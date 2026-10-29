/**
 * Scene drawing for the game canvas. Everything is drawn in low-res
 * "pixel" coordinates and scaled up with nearest-neighbor by the canvas,
 * giving the chunky pixel look. Pure functions; no React here.
 */

import { LANDMARKS } from "@/lib/scoring";

export const PX_PER_METER = 0.35;

// Layout fractions of the scene height.
const SKY_END = 0.36;
const STANDS_END = 0.54;
const GRASS_END = 0.64;

export interface SceneMetrics {
  w: number;
  h: number;
  skyEnd: number;
  standsEnd: number;
  grassEnd: number;
  trackTop: number;
  runnerScreenX: number;
  runnerFootY: number;
}

export function metrics(w: number, h: number): SceneMetrics {
  const skyEnd = Math.round(h * SKY_END);
  const standsEnd = Math.round(h * STANDS_END);
  const grassEnd = Math.round(h * GRASS_END);
  return {
    w,
    h,
    skyEnd,
    standsEnd,
    grassEnd,
    trackTop: grassEnd,
    runnerScreenX: Math.round(w * 0.22),
    runnerFootY: Math.round(h * 0.95),
  };
}

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

export function drawSky(
  ctx: CanvasRenderingContext2D,
  m: SceneMetrics,
  cameraX: number,
  timeMs: number
) {
  ctx.fillStyle = "#8ecae6";
  ctx.fillRect(0, 0, m.w, m.skyEnd);

  // Drifting clouds on slow parallax.
  const drift = timeMs * 0.004 + cameraX * 0.06;
  ctx.fillStyle = "#f4f9fc";
  for (let i = 0; i < 6; i++) {
    const span = m.w + 60;
    const cx = span - (((drift + i * 97) % span) + 30) + 15;
    const cy = 6 + hash(i * 31) * (m.skyEnd - 22);
    const s = 8 + Math.round(hash(i * 77) * 10);
    ctx.fillRect(Math.round(cx - s), Math.round(cy), s * 2, 5);
    ctx.fillRect(Math.round(cx - s * 0.6), Math.round(cy - 3), Math.round(s * 1.2), 3);
  }
}

const CROWD_COLORS = ["#d96d4f", "#e7b45a", "#7da0c9", "#9b7fb8", "#6fae7f", "#c9c0ae", "#b8626f"];

export function drawStands(
  ctx: CanvasRenderingContext2D,
  m: SceneMetrics,
  cameraX: number
) {
  const top = m.skyEnd;
  const height = m.standsEnd - top;

  // Stadium wall and roofline.
  ctx.fillStyle = "#3a4a6b";
  ctx.fillRect(0, top, m.w, height);
  ctx.fillStyle = "#2c3a57";
  ctx.fillRect(0, top, m.w, 2);

  // Crowd scrolls slower than the track (parallax).
  const crowdScroll = Math.floor(cameraX * 0.35);
  const rows = Math.max(3, Math.floor((height - 4) / 4));
  for (let r = 0; r < rows; r++) {
    const y = top + 3 + r * 4;
    for (let x = 0; x < m.w; x += 3) {
      const worldCol = Math.floor((x + crowdScroll) / 3);
      const h1 = hash(worldCol * 131 + r * 7);
      if (h1 > 0.22) {
        ctx.fillStyle = CROWD_COLORS[Math.floor(h1 * CROWD_COLORS.length) % CROWD_COLORS.length];
        const bob = hash(worldCol * 17 + r) > 0.5 ? 0 : 1;
        ctx.fillRect(x, y + bob, 2, 2);
      }
    }
  }
}

export function drawGrass(
  ctx: CanvasRenderingContext2D,
  m: SceneMetrics,
  cameraX: number,
  distanceMeters: number
) {
  const top = m.standsEnd;
  const height = m.grassEnd - top;
  ctx.fillStyle = "#5a9e4b";
  ctx.fillRect(0, top, m.w, height);
  ctx.fillStyle = "#4d8a40";
  for (let x = 0; x < m.w; x += 7) {
    const worldCol = Math.floor((x + cameraX) / 7);
    if (hash(worldCol * 53) > 0.5) ctx.fillRect(x, top + 2 + (worldCol % 3), 2, 1);
  }

  // Milestone flags planted on the infield once passed.
  for (const lm of LANDMARKS) {
    if (distanceMeters < lm.meters) continue;
    const screenX = Math.round(lm.meters * PX_PER_METER - cameraX);
    if (screenX < -40 || screenX > m.w + 40) continue;
    drawFlag(ctx, screenX, top + height - 1, lm.flag);
  }
}

function drawFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  label: string
) {
  const poleH = 20;
  ctx.fillStyle = "#e8e3d8";
  ctx.fillRect(x, baseY - poleH, 2, poleH);
  ctx.fillStyle = "#e9502a";
  ctx.fillRect(x + 2, baseY - poleH, 24, 10);
  ctx.fillStyle = "#b23616";
  ctx.fillRect(x + 2, baseY - poleH + 9, 24, 1);
  ctx.fillStyle = "#ffffff";
  ctx.font = "7px monospace";
  ctx.textBaseline = "top";
  ctx.fillText(label, x + 4, baseY - poleH + 2);
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  m: SceneMetrics,
  cameraX: number
) {
  const top = m.trackTop;
  const height = m.h - top;

  // Red-brown surface with speckle texture.
  ctx.fillStyle = "#b5503c";
  ctx.fillRect(0, top, m.w, height);
  ctx.fillStyle = "#a04433";
  for (let x = 0; x < m.w; x += 2) {
    for (let y = top; y < m.h; y += 3) {
      const worldX = Math.floor(x + cameraX);
      if (hash(worldX * 7 + y * 13) > 0.82) ctx.fillRect(x, y, 1, 1);
    }
  }

  // Lane lines (horizontal, lanes stacked toward the viewer).
  ctx.fillStyle = "#e8e3d8";
  const lanes = 3;
  for (let i = 1; i <= lanes; i++) {
    const y = top + Math.round((height * i) / (lanes + 1));
    ctx.fillRect(0, y, m.w, 1);
  }

  // Hash marks scrolling with the track.
  const hashSpacing = 26;
  const offset = Math.floor(cameraX) % hashSpacing;
  for (let x = -offset; x < m.w; x += hashSpacing) {
    ctx.fillRect(x, top + 2, 1, 3);
    ctx.fillRect(x + 13, m.h - 5, 1, 3);
  }

  // Painted chevron arrows pointing in the running direction.
  const chevSpacing = 52;
  const chevOffset = Math.floor(cameraX) % chevSpacing;
  ctx.fillStyle = "rgba(250, 199, 117, 0.75)";
  const cy = top + Math.round(height * 0.55);
  for (let x = -chevOffset; x < m.w; x += chevSpacing) {
    // Vertex on the right so the arrow points in the running direction.
    for (let s = 0; s < 4; s++) {
      ctx.fillRect(x + s, cy - (3 - s), 2, 2);
      ctx.fillRect(x + s, cy + (3 - s), 2, 2);
    }
  }
}

export function drawLandmarkLines(
  ctx: CanvasRenderingContext2D,
  m: SceneMetrics,
  cameraX: number
) {
  for (const lm of LANDMARKS) {
    const screenX = Math.round(lm.meters * PX_PER_METER - cameraX);
    if (screenX < -30 || screenX > m.w + 30) continue;

    const isFinish = lm.flag === "FULL";
    if (isFinish) {
      // Checkered finish line.
      for (let y = m.trackTop; y < m.h; y += 3) {
        for (let i = 0; i < 2; i++) {
          const even = (Math.floor(y / 3) + i) % 2 === 0;
          ctx.fillStyle = even ? "#ffffff" : "#1c1c28";
          ctx.fillRect(screenX + i * 3, y, 3, 3);
        }
      }
    } else {
      ctx.fillStyle = "#f4f1ea";
      ctx.fillRect(screenX, m.trackTop, 2, m.h - m.trackTop);
    }

    // Distance stenciled on the track beside the line.
    ctx.fillStyle = "#f4f1ea";
    ctx.font = "8px monospace";
    ctx.textBaseline = "top";
    ctx.fillText(lm.flag, screenX + 6, m.h - 11);
  }
}

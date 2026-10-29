/**
 * Runner sprite sheets.
 *
 * The runner is swappable art: loadRunnerSprites() first looks for
 * /sprites/manifest.json describing final PNG sprite sheets (one row
 * per animation, transparent background). When the manifest is absent
 * it generates a code-drawn placeholder with the same interface, so
 * dropping in final art later needs no code changes.
 *
 * Manifest format (public/sprites/manifest.json):
 * {
 *   "idle":      { "src": "/sprites/idle.png",      "frames": 4, "frameWidth": 48, "frameHeight": 48, "fps": 5 },
 *   "jog":       { "src": "/sprites/jog.png",       "frames": 6, "frameWidth": 48, "frameHeight": 48, "fps": 10 },
 *   "sprint":    { "src": "/sprites/sprint.png",    "frames": 8, "frameWidth": 48, "frameHeight": 48, "fps": 14 },
 *   "dip":       { "src": "/sprites/dip.png",       "frames": 4, "frameWidth": 48, "frameHeight": 48, "fps": 8, "loop": false },
 *   "celebrate": { "src": "/sprites/celebrate.png", "frames": 4, "frameWidth": 48, "frameHeight": 48, "fps": 6 }
 * }
 */

export type RunnerAnimation = "idle" | "jog" | "sprint" | "dip" | "celebrate";

export interface SpriteSheet {
  image: CanvasImageSource;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  loop: boolean;
}

export type RunnerSprites = Record<RunnerAnimation, SpriteSheet>;

const SIZE = 48;

// Placeholder palette per the PRD character spec.
const BODY = "#f2ede4";
const BODY_DARK = "#cfc7b8"; // far limbs
const BODY_OUTLINE = "#b3a996";
const SINGLET = "#e9502a";
const SINGLET_DARK = "#b23616";
const SHORTS = "#2f416e";
const SHORTS_DARK = "#1f2c4e";
const SHOES = "#fac775";
const SHOES_DARK = "#d39a3e";
const MOTION = "rgba(242, 237, 228, 0.5)";

interface Pose {
  lean: number; // radians, forward lean of torso
  hipY: number;
  frontThigh: number; // radians from straight down, + is forward
  frontShin: number; // knee bend
  backThigh: number;
  backShin: number;
  frontArm: number; // radians from straight down at shoulder, + forward
  backArm: number;
  armBend: number;
  motionLines?: boolean;
  armsUp?: boolean;
}

function limb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  upperAngle: number,
  upperLen: number,
  lowerAngle: number,
  lowerLen: number,
  color: string,
  tipColor: string | null,
  width: number
) {
  // Angles measured from straight down.
  const kx = x + Math.sin(upperAngle) * upperLen;
  const ky = y + Math.cos(upperAngle) * upperLen;
  const fx = kx + Math.sin(lowerAngle) * lowerLen;
  const fy = ky + Math.cos(lowerAngle) * lowerLen;
  drawThickLine(ctx, x, y, kx, ky, color, width);
  drawThickLine(ctx, kx, ky, fx, fy, color, width);
  if (tipColor) {
    ctx.fillStyle = tipColor;
    ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 5, 3);
  }
  return { fx, fy };
}

function drawThickLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number
) {
  // Pixelated line: stamp squares along the segment.
  ctx.fillStyle = color;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    ctx.fillRect(x - Math.floor(width / 2), y - Math.floor(width / 2), width, width);
  }
}

function drawPose(ctx: CanvasRenderingContext2D, pose: Pose) {
  const cx = 22;
  const hipY = pose.hipY;
  const torsoLen = 13;
  const shoulderX = cx + Math.sin(pose.lean) * torsoLen;
  const shoulderY = hipY - Math.cos(pose.lean) * torsoLen;

  if (pose.motionLines) {
    ctx.fillStyle = MOTION;
    ctx.fillRect(2, Math.round(hipY - 12), 7, 2);
    ctx.fillRect(0, Math.round(hipY - 6), 9, 2);
    ctx.fillRect(3, Math.round(hipY - 18), 5, 2);
  }

  // Far arm and far leg first (darker for depth).
  if (pose.armsUp) {
    limb(ctx, shoulderX - 1, shoulderY, Math.PI + 0.5, 8, Math.PI - 0.3, 7, BODY_DARK, null, 3);
  } else {
    limb(
      ctx,
      shoulderX - 1,
      shoulderY + 1,
      pose.backArm,
      7,
      pose.backArm + pose.armBend,
      6,
      BODY_DARK,
      null,
      3
    );
  }
  limb(
    ctx,
    cx - 1,
    hipY,
    pose.backThigh,
    9,
    pose.backShin,
    9,
    BODY_DARK,
    SHOES_DARK,
    4
  );

  // Shorts and torso singlet.
  drawThickLine(ctx, cx, hipY, shoulderX, shoulderY, SINGLET, 7);
  ctx.fillStyle = SHORTS;
  ctx.fillRect(Math.round(cx) - 4, Math.round(hipY) - 3, 9, 6);
  ctx.fillStyle = SHORTS_DARK;
  ctx.fillRect(Math.round(cx) - 4, Math.round(hipY) + 2, 9, 2);
  ctx.fillStyle = SINGLET_DARK;
  ctx.fillRect(Math.round(shoulderX) - 3, Math.round(shoulderY) + 2, 7, 2);

  // Near leg.
  limb(ctx, cx + 1, hipY, pose.frontThigh, 9, pose.frontShin, 9, BODY, SHOES, 4);

  // Near arm.
  if (pose.armsUp) {
    limb(ctx, shoulderX + 1, shoulderY, Math.PI - 0.5, 8, Math.PI + 0.3, 7, BODY, null, 3);
  } else {
    limb(
      ctx,
      shoulderX + 1,
      shoulderY + 1,
      pose.frontArm,
      7,
      pose.frontArm + pose.armBend,
      6,
      BODY,
      null,
      3
    );
  }

  // Round head, no face, with the darker self-color outline.
  const headX = shoulderX + Math.sin(pose.lean) * 5;
  const headY = shoulderY - Math.cos(pose.lean) * 5 - 2;
  ctx.fillStyle = BODY_OUTLINE;
  ctx.beginPath();
  ctx.arc(Math.round(headX), Math.round(headY), 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.arc(Math.round(headX), Math.round(headY) - 1, 4, 0, Math.PI * 2);
  ctx.fill();
}

function makeSheet(
  poses: Pose[],
  fps: number,
  loop: boolean
): SpriteSheet {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * poses.length;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  poses.forEach((pose, i) => {
    ctx.save();
    ctx.translate(i * SIZE, 0);
    drawPose(ctx, pose);
    ctx.restore();
  });
  return {
    image: canvas,
    frames: poses.length,
    frameWidth: SIZE,
    frameHeight: SIZE,
    fps,
    loop,
  };
}

function runCycle(
  count: number,
  amp: number,
  lean: number,
  hipY: number,
  motionLines: boolean
): Pose[] {
  const poses: Pose[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const swing = Math.sin(t) * amp;
    poses.push({
      lean,
      hipY: hipY + Math.round(Math.abs(Math.cos(t)) * -1),
      frontThigh: swing,
      frontShin: swing + Math.max(0.2, -Math.sin(t)) * amp * 0.9,
      backThigh: -swing,
      backShin: -swing + Math.max(0.2, Math.sin(t)) * amp * 0.9,
      frontArm: -swing * 0.8,
      backArm: swing * 0.8,
      armBend: -0.9,
      motionLines: motionLines && i % 2 === 0,
    });
  }
  return poses;
}

export function generatePlaceholderSprites(): RunnerSprites {
  const idle: Pose[] = [0, 1].map((i) => ({
    lean: 0.05,
    hipY: 28 + i,
    frontThigh: 0.08,
    frontShin: 0.12,
    backThigh: -0.08,
    backShin: -0.04,
    frontArm: 0.15,
    backArm: -0.15,
    armBend: -0.6,
  }));

  const dip: Pose[] = [0.25, 0.45, 0.65, 0.8].map((lean, i) => ({
    lean,
    hipY: 28 + i,
    frontThigh: 0.6 - i * 0.1,
    frontShin: 0.7,
    backThigh: -0.5,
    backShin: -0.2,
    frontArm: -1.2 - i * 0.2,
    backArm: -1.2 - i * 0.2,
    armBend: -0.2,
    motionLines: true,
  }));

  const celebrate: Pose[] = [0, 1, 0, 1].map((i) => ({
    lean: 0,
    hipY: 27 + i,
    frontThigh: 0.1,
    frontShin: 0.1,
    backThigh: -0.1,
    backShin: -0.05,
    frontArm: 0,
    backArm: 0,
    armBend: 0,
    armsUp: true,
  }));

  return {
    idle: makeSheet(idle, 4, true),
    jog: makeSheet(runCycle(6, 0.55, 0.12, 28, false), 10, true),
    sprint: makeSheet(runCycle(8, 0.95, 0.3, 27, true), 14, true),
    dip: makeSheet(dip, 8, false),
    celebrate: makeSheet(celebrate, 5, true),
  };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

interface ManifestEntry {
  src: string;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  loop?: boolean;
}

export async function loadRunnerSprites(): Promise<RunnerSprites> {
  try {
    const res = await fetch("/sprites/manifest.json");
    if (res.ok) {
      const manifest = (await res.json()) as Record<RunnerAnimation, ManifestEntry>;
      const names: RunnerAnimation[] = ["idle", "jog", "sprint", "dip", "celebrate"];
      const sheets = await Promise.all(
        names.map(async (name) => {
          const m = manifest[name];
          const image = await loadImage(m.src);
          return [
            name,
            {
              image,
              frames: m.frames,
              frameWidth: m.frameWidth,
              frameHeight: m.frameHeight,
              fps: m.fps,
              loop: m.loop !== false,
            },
          ] as const;
        })
      );
      return Object.fromEntries(sheets) as RunnerSprites;
    }
  } catch {
    // Fall through to the placeholder.
  }
  return generatePlaceholderSprites();
}

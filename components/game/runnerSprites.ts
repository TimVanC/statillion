/**
 * Runner sprite sheets.
 *
 * The runner is swappable art: loadRunnerSprites() first looks for
 * /sprites/manifest.json describing final PNG sprite sheets (one row
 * per animation, transparent background). When the manifest is absent
 * it generates a code-drawn placeholder with the same interface, so
 * dropping in final art later needs no code changes.
 *
 * Manifest format (public/sprites/manifest.json), built by
 * tools/pack_runner.py from the frames in art/runner:
 * {
 *   "jog":  { "src": "/sprites/jog.png",  "frames": 8, "frameWidth": 128, "frameHeight": 128, "fps": 10 },
 *   "stop": { "src": "/sprites/stop.png", "frames": 8, "frameWidth": 128, "frameHeight": 128, "fps": 10, "loop": false, "next": "idle" }
 * }
 */

export type RunnerAnimation =
  | "idle" // bouncing on the line before the run
  | "rest" // hands on knees, breathing (between prompts)
  | "jog"
  | "sprint"
  | "stop" // pulls up after a scored answer, then rest
  | "fall" // trips after a timeout
  | "dip" // finish-line lean, then celebrate
  | "celebrate"
  | "getup" // kneel to standing after a fall, then idle
  | "stretch"; // start-screen stretch, then idle
export const RUNNER_ANIMATIONS: RunnerAnimation[] = [
  "idle", "rest", "jog", "sprint", "stop", "fall", "dip", "celebrate", "getup", "stretch",
];

export interface SpriteSheet {
  image: CanvasImageSource;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  loop: boolean;
  /** For play-once sheets: the animation to continue with afterwards. */
  next?: RunnerAnimation;
}

export type RunnerSprites = Record<RunnerAnimation, SpriteSheet>;

const SIZE = 64;

// Placeholder palette: 2-3 shades per material plus a single dark
// outline, like the reference pixel art.
const OUTLINE = "#2a2235";
const SKIN = "#f1c197";
const SKIN_DARK = "#d49a6a";
const HAIR = "#3b2a1f";
const SINGLET = "#e9502a";
const SINGLET_LIGHT = "#ff7a52";
const SINGLET_DARK = "#b23616";
const SHORTS = "#2f416e";
const SHORTS_DARK = "#1f2c4e";
const SHOES = "#f6f1e6";
const SHOES_DARK = "#c9c0ae";
const SOLE = "#fac775";
const MOTION = "rgba(242, 237, 228, 0.55)";

// Angles are radians from straight down; positive swings toward the
// running direction (screen right). `bend` flexes the knee backward
// and the elbow forward, which is all a runner's joints do.
interface Pose {
  lean: number;
  hipY: number;
  frontThigh: number;
  frontBend: number;
  backThigh: number;
  backBend: number;
  frontArm: number;
  backArm: number;
  armBend: number;
  motionLines?: boolean;
  armsUp?: boolean;
}

const HIP_X = 30;
const TORSO = 15;
const THIGH = 11;
const SHIN = 11;
const UPPER_ARM = 9;
const FOREARM = 8;

const discCache = new Map<number, [number, number][]>();
function disc(r: number): [number, number][] {
  let d = discCache.get(r);
  if (!d) {
    d = [];
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + r * 0.5) d.push([x, y]);
      }
    }
    discCache.set(r, d);
  }
  return d;
}

/** Capsule: a line of stamped discs, giving rounded pixel limbs. */
function capsule(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  radius: number
) {
  ctx.fillStyle = color;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const d = disc(radius);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (const [dx, dy] of d) ctx.fillRect(x + dx, y + dy, 1, 1);
  }
}

function leg(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  thigh: number,
  bend: number,
  skin: string,
  shoe: string,
  sole: string
) {
  const kx = x + Math.sin(thigh) * THIGH;
  const ky = y + Math.cos(thigh) * THIGH;
  const shin = thigh - bend;
  const fx = kx + Math.sin(shin) * SHIN;
  const fy = ky + Math.cos(shin) * SHIN;
  capsule(ctx, x, y, kx, ky, skin, 3);
  capsule(ctx, kx, ky, fx, fy, skin, 2);
  // Shoe: a short capsule pointing forward from the ankle, toe up a
  // touch when the foot trails behind.
  const toeAngle = Math.PI / 2 - Math.min(0.5, Math.max(-0.1, shin * 0.3));
  const tx = fx + Math.sin(toeAngle) * 5;
  const ty = fy + Math.cos(toeAngle) * 5;
  capsule(ctx, fx - 1, fy + 1, tx, ty, shoe, 2);
  capsule(ctx, fx - 1, fy + 2, tx, ty + 1, sole, 1);
}

function arm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  upper: number,
  bend: number,
  skin: string
) {
  const ex = x + Math.sin(upper) * UPPER_ARM;
  const ey = y + Math.cos(upper) * UPPER_ARM;
  const fore = upper + bend;
  const hx = ex + Math.sin(fore) * FOREARM;
  const hy = ey + Math.cos(fore) * FOREARM;
  capsule(ctx, x, y, ex, ey, skin, 2);
  capsule(ctx, ex, ey, hx, hy, skin, 2);
  // Fist.
  capsule(ctx, hx, hy, hx, hy, skin, 2);
}

function drawPose(ctx: CanvasRenderingContext2D, pose: Pose) {
  const hipX = HIP_X;
  const hipY = pose.hipY;
  const shoulderX = hipX + Math.sin(pose.lean) * TORSO;
  const shoulderY = hipY - Math.cos(pose.lean) * TORSO;

  if (pose.motionLines) {
    ctx.fillStyle = MOTION;
    ctx.fillRect(2, Math.round(hipY - 16), 10, 2);
    ctx.fillRect(0, Math.round(hipY - 8), 13, 2);
    ctx.fillRect(3, Math.round(hipY), 8, 2);
  }

  // Far limbs first, in the darker skin shade.
  if (pose.armsUp) {
    arm(ctx, shoulderX - 2, shoulderY + 1, Math.PI + 0.45, 0.35, SKIN_DARK);
  } else {
    arm(ctx, shoulderX - 2, shoulderY + 2, pose.backArm, pose.armBend, SKIN_DARK);
  }
  leg(ctx, hipX - 1, hipY, pose.backThigh, pose.backBend, SKIN_DARK, SHOES_DARK, SOLE);

  // Torso: singlet with a highlight stripe down the front.
  capsule(ctx, hipX, hipY - 2, shoulderX, shoulderY, SINGLET, 5);
  capsule(ctx, hipX + 2, hipY - 3, shoulderX + 2, shoulderY + 1, SINGLET_LIGHT, 1);
  capsule(ctx, hipX - 3, hipY - 1, shoulderX - 3, shoulderY + 2, SINGLET_DARK, 1);

  // Shorts hang off the hips, following the lean.
  capsule(ctx, hipX - 1, hipY - 1, hipX + Math.sin(pose.lean) * 2, hipY + 3, SHORTS, 6);
  capsule(ctx, hipX - 4, hipY + 3, hipX + 1, hipY + 5, SHORTS_DARK, 2);

  // Near limbs in the full skin tone.
  leg(ctx, hipX + 1, hipY, pose.frontThigh, pose.frontBend, SKIN, SHOES, SOLE);
  if (pose.armsUp) {
    arm(ctx, shoulderX + 2, shoulderY + 1, Math.PI - 0.45, -0.35, SKIN);
  } else {
    arm(ctx, shoulderX + 2, shoulderY + 2, pose.frontArm, pose.armBend, SKIN);
  }

  // Neck and head. Hair covers the top and back; face looks right.
  const neckX = shoulderX + Math.sin(pose.lean) * 3;
  const neckY = shoulderY - Math.cos(pose.lean) * 3;
  capsule(ctx, shoulderX, shoulderY, neckX, neckY, SKIN, 2);
  const headX = Math.round(neckX + Math.sin(pose.lean) * 5 + 1);
  const headY = Math.round(neckY - Math.cos(pose.lean) * 5 - 1);
  capsule(ctx, headX, headY, headX, headY, SKIN, 5);
  capsule(ctx, headX - 2, headY - 2, headX - 1, headY - 3, HAIR, 4);
  capsule(ctx, headX - 4, headY, headX - 4, headY + 3, HAIR, 2);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(headX + 3, headY - 1, 1, 2); // eye
  ctx.fillStyle = SKIN_DARK;
  ctx.fillRect(headX + 5, headY + 1, 1, 1); // nose tip
}

/** Trace every opaque region with a one-pixel outline. */
function outline(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 200;
  const edge: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        edge.push(x, y);
      }
    }
  }
  ctx.fillStyle = OUTLINE;
  for (let i = 0; i < edge.length; i += 2) ctx.fillRect(edge[i], edge[i + 1], 1, 1);
}

function makeSheet(poses: Pose[], fps: number, loop: boolean): SpriteSheet {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * poses.length;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  poses.forEach((pose, i) => {
    const frame = document.createElement("canvas");
    frame.width = SIZE;
    frame.height = SIZE;
    const fctx = frame.getContext("2d")!;
    fctx.imageSmoothingEnabled = false;
    drawPose(fctx, pose);
    outline(fctx, SIZE, SIZE);
    ctx.drawImage(frame, i * SIZE, 0);
  });
  return { image: canvas, frames: poses.length, frameWidth: SIZE, frameHeight: SIZE, fps, loop };
}

// One leg through a full stride, 8 keys: contact, stance, push-off,
// toe-off, heel-up, knee drive, knee-high, reach. The other leg runs
// the same table four keys later.
const STRIDE: [number, number][] = [
  [0.55, 0.15],
  [0.2, 0.35],
  [-0.2, 0.4],
  [-0.6, 1.2],
  [-0.45, 2.1],
  [0.15, 1.9],
  [0.7, 1.3],
  [0.8, 0.6],
];
const BOB = [0, -1, 0, 1, 2, 1, 0, 1];

function runCycle(
  amp: number,
  lean: number,
  hipY: number,
  motionLines: boolean
): Pose[] {
  const poses: Pose[] = [];
  for (let i = 0; i < 8; i++) {
    const [ft, fb] = STRIDE[i];
    const [bt, bb] = STRIDE[(i + 4) % 8];
    poses.push({
      lean,
      hipY: hipY - BOB[i],
      frontThigh: ft * amp,
      frontBend: fb * amp,
      backThigh: bt * amp,
      backBend: bb * amp,
      // Arms swing opposite their own-side leg.
      frontArm: -ft * amp * 0.9 - 0.15,
      backArm: -bt * amp * 0.9 - 0.15,
      armBend: 1.45,
      motionLines: motionLines && i % 2 === 0,
    });
  }
  return poses;
}

export function generatePlaceholderSprites(): RunnerSprites {
  const idle: Pose[] = [0, 1].map((i) => ({
    lean: 0.04,
    hipY: 33 + i,
    frontThigh: 0.06,
    frontBend: 0.1,
    backThigh: -0.06,
    backBend: 0.05,
    frontArm: 0.1,
    backArm: -0.1,
    armBend: 0.5,
  }));

  const dip: Pose[] = [0.3, 0.5, 0.7, 0.85].map((lean, i) => ({
    lean,
    hipY: 34 + i,
    frontThigh: 0.7 - i * 0.1,
    frontBend: 0.3,
    backThigh: -0.6,
    backBend: 0.9,
    frontArm: -1.3 - i * 0.2,
    backArm: -1.3 - i * 0.2,
    armBend: 0.3,
    motionLines: true,
  }));

  const celebrate: Pose[] = [0, 1, 0, 1].map((i) => ({
    lean: 0,
    hipY: 32 + i,
    frontThigh: 0.1,
    frontBend: 0.1,
    backThigh: -0.1,
    backBend: 0.05,
    frontArm: 0,
    backArm: 0,
    armBend: 0,
    armsUp: true,
  }));

  const idleSheet = makeSheet(idle, 4, true);
  const dipSheet = makeSheet(dip, 8, false);
  return {
    idle: idleSheet,
    rest: idleSheet,
    jog: makeSheet(runCycle(0.75, 0.12, 33, false), 10, true),
    sprint: makeSheet(runCycle(1.0, 0.3, 32, true), 14, true),
    stop: { ...makeSheet(idle, 4, false), next: "rest" },
    fall: dipSheet,
    dip: { ...dipSheet, next: "celebrate" },
    celebrate: makeSheet(celebrate, 5, true),
    getup: { ...makeSheet(idle, 4, false), next: "idle" },
    stretch: { ...makeSheet(celebrate, 4, false), next: "idle" },
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
  next?: RunnerAnimation;
}

export async function loadRunnerSprites(): Promise<RunnerSprites> {
  try {
    const res = await fetch("/sprites/manifest.json");
    if (res.ok) {
      const manifest = (await res.json()) as Record<RunnerAnimation, ManifestEntry>;
      const sheets = await Promise.all(
        RUNNER_ANIMATIONS.map(async (name) => {
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
              next: m.next,
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

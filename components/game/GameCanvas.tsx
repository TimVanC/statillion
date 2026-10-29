"use client";

import { useEffect, useRef } from "react";
import {
  drawGrass,
  drawLandmarkLines,
  drawSky,
  drawStands,
  drawTrack,
  metrics,
  PX_PER_METER,
} from "./scene";
import {
  loadRunnerSprites,
  RunnerAnimation,
  RunnerSprites,
  SpriteSheet,
} from "./runnerSprites";
import { LANDMARKS } from "@/lib/scoring";

const PIXEL = 2; // CSS pixels per scene pixel (nearest-neighbor)
const SPRINT_SECONDS = 1.4; // time to cover any scored gain

interface Props {
  /** Scored distance so far; the runner sprints to catch up. */
  distanceMeters: number;
  /** Base animation while not catching up. */
  animation: RunnerAnimation;
  /** Fired once per landmark as the runner passes it. */
  onLandmark?: (flag: string) => void;
}

export default function GameCanvas({ distanceMeters, animation, onLandmark }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<RunnerSprites | null>(null);
  const stateRef = useRef({
    display: 0,
    target: 0,
    sprintFrom: 0,
    baseAnimation: "idle" as RunnerAnimation,
    animStart: 0,
    lastAnim: "idle" as RunnerAnimation,
    passed: new Set<string>(),
    onLandmark: undefined as Props["onLandmark"],
  });

  stateRef.current.target = distanceMeters;
  stateRef.current.baseAnimation = animation;
  stateRef.current.onLandmark = onLandmark;

  useEffect(() => {
    let mounted = true;
    void loadRunnerSprites().then((s) => {
      if (mounted) spritesRef.current = s;
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastTime = performance.now();

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = Math.max(60, Math.floor(rect.width / PIXEL));
      canvas.height = Math.max(60, Math.floor(rect.height / PIXEL));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    // Seed passed landmarks so refreshes don't replay the chime.
    const st = stateRef.current;
    st.display = st.target;
    for (const lm of LANDMARKS) {
      if (st.target >= lm.meters) st.passed.add(lm.flag);
    }

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const st = stateRef.current;

      // Ease toward the target distance; speed scales with the gap so any
      // gain takes about SPRINT_SECONDS.
      const gap = st.target - st.display;
      const catchingUp = gap > 1;
      if (catchingUp) {
        const totalGain = Math.max(1, st.target - st.sprintFrom);
        st.display = Math.min(st.target, st.display + (totalGain / SPRINT_SECONDS) * dt);
      } else {
        st.sprintFrom = st.target;
      }

      for (const lm of LANDMARKS) {
        if (st.display >= lm.meters && !st.passed.has(lm.flag)) {
          st.passed.add(lm.flag);
          st.onLandmark?.(lm.flag);
        }
      }

      const anim: RunnerAnimation = catchingUp ? "sprint" : st.baseAnimation;
      if (anim !== st.lastAnim) {
        st.lastAnim = anim;
        st.animStart = now;
      }

      const w = canvas.width;
      const h = canvas.height;
      const m = metrics(w, h);
      const cameraX = st.display * PX_PER_METER;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      drawSky(ctx, m, cameraX, now);
      drawStands(ctx, m, cameraX);
      drawGrass(ctx, m, cameraX, st.display);
      drawTrack(ctx, m, cameraX);
      drawLandmarkLines(ctx, m, cameraX);

      const sprites = spritesRef.current;
      if (sprites) {
        const sheet: SpriteSheet = sprites[anim];
        const elapsed = (now - st.animStart) / 1000;
        let frameIndex = Math.floor(elapsed * sheet.fps);
        frameIndex = sheet.loop
          ? frameIndex % sheet.frames
          : Math.min(frameIndex, sheet.frames - 1);
        ctx.drawImage(
          sheet.image,
          frameIndex * sheet.frameWidth,
          0,
          sheet.frameWidth,
          sheet.frameHeight,
          m.runnerScreenX - Math.floor(sheet.frameWidth / 2),
          m.runnerFootY - sheet.frameHeight + 6,
          sheet.frameWidth,
          sheet.frameHeight
        );
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} style={{ display: "block", imageRendering: "pixelated" }} />;
}

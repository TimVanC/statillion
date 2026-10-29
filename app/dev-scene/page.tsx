"use client";

/**
 * Visual test harness for the canvas scene and runner animations.
 * No API or database needed; useful for previewing art changes.
 */

import { useState } from "react";
import GameCanvas from "@/components/game/GameCanvas";
import type { RunnerAnimation } from "@/components/game/runnerSprites";

const ANIMATIONS: RunnerAnimation[] = ["idle", "jog", "sprint", "dip", "celebrate"];

export default function DevScenePage() {
  const [distance, setDistance] = useState(0);
  const [animation, setAnimation] = useState<RunnerAnimation>("jog");

  return (
    <main style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, padding: 10, flexWrap: "wrap" }}>
        {ANIMATIONS.map((a) => (
          <button
            key={a}
            onClick={() => setAnimation(a)}
            style={{
              padding: "6px 10px",
              background: a === animation ? "#e9502a" : "#2f416e",
              color: "#fff",
              border: "none",
              borderRadius: 6,
            }}
          >
            {a}
          </button>
        ))}
        {[100, 600, 1800, 6000].map((gain) => (
          <button
            key={gain}
            onClick={() => setDistance((d) => d + gain)}
            style={{
              padding: "6px 10px",
              background: "#5a9e4b",
              color: "#fff",
              border: "none",
              borderRadius: 6,
            }}
          >
            +{gain}m
          </button>
        ))}
        <span style={{ alignSelf: "center", fontSize: 13 }}>
          {distance.toLocaleString()} m
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <GameCanvas distanceMeters={distance} animation={animation} />
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDeviceId } from "@/lib/deviceId";
import { audio } from "@/lib/audio";
import {
  pointsToMeters,
  PROMPTS_PER_DAY,
  TIER_EMOJI,
  TIERS,
  TIMEOUT_EMOJI,
  Tier,
} from "@/lib/scoring";
import type { CompleteResponse, RevealPrompt, RunStateDto } from "@/lib/types";
import styles from "./results.module.css";

export default function ResultsPage() {
  const router = useRouter();
  const [run, setRun] = useState<RunStateDto | null>(null);
  const [totals, setTotals] = useState<CompleteResponse | null>(null);
  const [reveal, setReveal] = useState<RevealPrompt[] | null>(null);
  const [openPrompt, setOpenPrompt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/today", {
          headers: { "x-device-id": getDeviceId() },
        });
        if (!res.ok) {
          setError("Could not load your run.");
          return;
        }
        const state = (await res.json()) as RunStateDto;
        if (state.currentPosition <= PROMPTS_PER_DAY && !state.completed) {
          router.replace("/play");
          return;
        }
        setRun(state);

        const completeRes = await fetch("/api/today/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: state.runId }),
        });
        if (completeRes.ok) {
          const totals = (await completeRes.json()) as CompleteResponse;
          setTotals(totals);
          audio.play("jingle");
        }

        const revealRes = await fetch(
          `/api/reveal?runId=${encodeURIComponent(state.runId)}`
        );
        if (revealRes.ok) {
          const data = (await revealRes.json()) as { prompts: RevealPrompt[] };
          setReveal(data.prompts);
        }
      } catch {
        setError("Could not reach the server.");
      }
    };
    void load();
  }, [router]);

  if (error) return <main className={styles.center}>{error}</main>;
  if (!run || !totals) {
    return <main className={styles.center}>Tallying your run...</main>;
  }

  const emojiLine = Array.from({ length: PROMPTS_PER_DAY }, (_, i) => {
    const played = run.played.find((p) => p.position === i + 1);
    if (!played || played.status === "timeout" || !played.tier) {
      return TIMEOUT_EMOJI;
    }
    return TIER_EMOJI[played.tier];
  }).join("");

  const shareText = [
    `Statillion #${run.runNumber}`,
    `${totals.totalMeters.toLocaleString()} m - ${totals.band}`,
    emojiLine,
    "statillion.com",
  ].join("\n");

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable; show the text for manual copy.
      window.prompt("Copy your result:", shareText);
    }
  };

  const resetRun = async () => {
    setResetting(true);
    try {
      await fetch("/api/today/reset", {
        method: "POST",
        headers: { "x-device-id": getDeviceId() },
      });
      try {
        window.localStorage.removeItem("statillion-last-run");
      } catch {
        // fine
      }
      router.push("/play");
    } catch {
      setResetting(false);
    }
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Run #{run.runNumber} complete</h1>

      <section className={styles.totals}>
        <div className={styles.bigDistance}>
          {totals.totalMeters.toLocaleString()} m
        </div>
        <div className={styles.band}>{totals.band}</div>
        <div className={styles.sub}>
          {totals.totalPoints} points
          {totals.percentile !== null
            ? ` · ahead of ${totals.percentile}% of today's runners`
            : ""}
          {` · ${totals.playersToday} player${totals.playersToday === 1 ? "" : "s"} today`}
        </div>
        <div className={styles.emojiLine}>{emojiLine}</div>
        <button className={styles.copyButton} onClick={copyResult}>
          {copied ? "Copied!" : "Copy Result"}
        </button>
        <button
          className={styles.resetButton}
          onClick={resetRun}
          disabled={resetting}
        >
          {resetting ? "Resetting..." : "Reset & play again (testing)"}
        </button>
      </section>

      <section className={styles.log}>
        <h2 className={styles.logHeading}>Your prompts</h2>
        {run.prompts.map((prompt) => {
          const played = run.played.find((p) => p.position === prompt.position);
          const revealed = reveal?.find((r) => r.position === prompt.position);
          const open = openPrompt === prompt.position;
          return (
            <div key={prompt.position} className={styles.promptRow}>
              <button
                className={styles.promptButton}
                onClick={() => setOpenPrompt(open ? null : prompt.position)}
              >
                <span className={styles.promptText}>
                  {prompt.position}. {prompt.text}
                </span>
                {played && played.status === "scored" && played.tier ? (
                  <span className={styles.promptResult}>
                    {played.answer} · {TIERS[played.tier].label} · +
                    {pointsToMeters(played.points).toLocaleString()} m
                  </span>
                ) : (
                  <span className={styles.promptResult}>Timed out · 0 m</span>
                )}
              </button>
              {open && revealed && (
                <div className={styles.revealPanel}>
                  {revealed.gems.length > 0 && (
                    <div className={styles.gems}>
                      <h3 className={styles.gemsHeading}>Hail Mary gems</h3>
                      {revealed.gems.map((gem) => (
                        <div key={gem.answer} className={styles.gem}>
                          <strong>{gem.answer}</strong>
                          {gem.quip ? <span> - {gem.quip}</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={styles.answerList}>
                    {revealed.answers.map((a) => (
                      <div key={a.answer} className={styles.answerRow}>
                        <span>{a.answer}</span>
                        <span className={styles.answerMeta}>
                          {TIERS[a.tier as Tier].label}
                          {a.timesGiven > 0 ? ` · ${a.timesGiven} today` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <Link href="/" className={styles.homeLink}>
        Back to start
      </Link>
    </main>
  );
}

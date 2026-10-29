"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GameCanvas from "@/components/game/GameCanvas";
import type { RunnerAnimation } from "@/components/game/runnerSprites";
import { audio } from "@/lib/audio";
import { getDeviceId } from "@/lib/deviceId";
import { pointsToMeters, PROMPT_SECONDS, PROMPTS_PER_DAY, Tier } from "@/lib/scoring";
import type { RunStateDto, SubmitResponse } from "@/lib/types";
import styles from "./play.module.css";

type Phase =
  | "loading"
  | "error"
  | "tap-to-start"
  | "countdown"
  | "active"
  | "feedback"
  | "finishing";

interface Feedback {
  kind: "scored" | "timeout";
  answer?: string;
  tierLabel?: string;
  tier?: Tier;
  points?: number;
  meters?: number;
}

const BIG_CHEER: Record<string, Parameters<typeof audio.play>[0]> = {
  ten_day: "cheer-small",
  trick_play: "cheer-small",
  role_player: "cheer-mid",
  all_star: "cheer-mid",
  hall_of_famer: "cheer-big",
  hail_mary: "hail-mary",
};

export default function PlayPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [run, setRun] = useState<RunStateDto | null>(null);
  const [position, setPosition] = useState(1);
  const [totalPoints, setTotalPoints] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(PROMPT_SECONDS);
  const [guess, setGuess] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [rejectMsg, setRejectMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [shake, setShake] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const deadlineRef = useRef(0);
  const submittingRef = useRef(false);
  const timedOutRef = useRef(false);
  const lastPulseRef = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const positionRef = useRef(1);
  positionRef.current = position;

  const distance = pointsToMeters(totalPoints);

  useEffect(() => {
    setMuted(audio.isMuted());
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    const load = async () => {
      try {
        const res = await fetch("/api/today", {
          headers: { "x-device-id": getDeviceId() },
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(
            data.error === "no-daily-set"
              ? "No prompts are loaded for today yet. Check back soon."
              : "Could not load today's run."
          );
          setPhase("error");
          return;
        }
        const state = data as RunStateDto;
        setRun(state);
        setTotalPoints(state.totalPoints);
        if (state.completed || state.currentPosition > PROMPTS_PER_DAY) {
          router.replace("/results");
          return;
        }
        setPosition(state.currentPosition);
        setPhase("tap-to-start");
      } catch {
        setErrorMsg("Could not reach the server.");
        setPhase("error");
      }
    };
    void load();
  }, [router]);

  const beginCountdown = useCallback(() => {
    audio.unlock();
    audio.startCrowd();
    setPhase("countdown");
    setCountdown(3);
  }, []);

  // Countdown ticks, then the clock starts.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      audio.play("whistle");
      deadlineRef.current = Date.now() + PROMPT_SECONDS * 1000;
      timedOutRef.current = false;
      lastPulseRef.current = -1;
      setSecondsLeft(PROMPT_SECONDS);
      setGuess("");
      setSuggestion(null);
      setRejectMsg(null);
      setPhase("active");
      if (run) {
        void fetch("/api/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: run.runId, action: "start" }),
        });
      }
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [phase, countdown, run]);

  useEffect(() => {
    if (phase === "active") inputRef.current?.focus();
  }, [phase]);

  const [doneAll, setDoneAll] = useState(false);

  const applyAdvance = useCallback(
    (nextPosition: number | null, newTotal: number) => {
      setTotalPoints(newTotal);
      if (nextPosition === null) {
        setDoneAll(true);
      } else {
        setPosition(nextPosition);
      }
      setPhase("feedback");
    },
    []
  );

  const submitTimeout = useCallback(async () => {
    if (!run || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: run.runId,
          position: positionRef.current,
          timeout: true,
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (data.result === "timeout") {
        setFeedback({ kind: "timeout" });
        applyAdvance(data.nextPosition, data.totalPoints);
      }
    } finally {
      submittingRef.current = false;
    }
  }, [run, applyAdvance]);

  // The 25-second clock with the final-5-seconds pulse.
  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => {
      const msLeft = deadlineRef.current - Date.now();
      const s = Math.max(0, Math.ceil(msLeft / 1000));
      setSecondsLeft(s);
      if (s <= 5 && s >= 1 && s !== lastPulseRef.current) {
        lastPulseRef.current = s;
        audio.play("heartbeat");
      }
      if (msLeft <= 0 && !timedOutRef.current) {
        timedOutRef.current = true;
        // A suggestion showing when time runs out is not submitted.
        setSuggestion(null);
        void submitTimeout();
      }
    }, 120);
    return () => clearInterval(id);
  }, [phase, submitTimeout]);

  const submitGuess = useCallback(
    async (accept: boolean) => {
      if (!run || submittingRef.current || timedOutRef.current) return;
      const text = guess.trim();
      if (!text) return;
      submittingRef.current = true;
      try {
        const res = await fetch("/api/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            runId: run.runId,
            position: positionRef.current,
            guess: text,
            accept,
          }),
        });
        const data = (await res.json()) as SubmitResponse & { error?: string };
        if (data.result === "scored") {
          audio.play(BIG_CHEER[data.tier] ?? "cheer-small");
          setFeedback({
            kind: "scored",
            answer: data.answer,
            tierLabel: data.tierLabel,
            tier: data.tier,
            points: data.points,
            meters: data.meters,
          });
          setSuggestion(null);
          applyAdvance(data.nextPosition, data.totalPoints);
        } else if (data.result === "suggest") {
          setSuggestion(data.suggestion);
          setRejectMsg(null);
        } else if (data.result === "reject") {
          audio.play("bwomp");
          setSuggestion(null);
          setRejectMsg(
            data.reason === "ambiguous-person"
              ? "Too many matches. Add a first name."
              : "Not on the list. Try again!"
          );
          setShake(true);
          setTimeout(() => setShake(false), 350);
        } else if (data.result === "timeout") {
          setFeedback({ kind: "timeout" });
          applyAdvance(data.nextPosition, data.totalPoints);
        }
      } finally {
        submittingRef.current = false;
      }
    },
    [run, guess, applyAdvance]
  );

  const onRun = useCallback(() => {
    void submitGuess(suggestion !== null);
  }, [submitGuess, suggestion]);

  const onGuessChange = (value: string) => {
    setGuess(value);
    // Editing the text cancels the suggestion.
    if (suggestion !== null) setSuggestion(null);
    if (rejectMsg !== null) setRejectMsg(null);
  };

  const onNext = useCallback(() => {
    setFeedback(null);
    setPhase("countdown");
    setCountdown(3);
  }, []);

  const finishedRef = useRef(false);
  const finishRun = useCallback(() => {
    if (!run || finishedRef.current) return;
    finishedRef.current = true;
    setPhase("finishing");
    audio.play("finish");
    void (async () => {
      try {
        await fetch("/api/today/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: run.runId }),
        });
      } finally {
        try {
          window.localStorage.setItem("statillion-last-run", run.runId);
        } catch {
          // fine
        }
        setTimeout(() => router.push("/results"), 1600);
      }
    })();
  }, [run, router]);

  // After the 7th prompt the server returns nextPosition null; the
  // feedback card's button then finishes the run.
  const isLastFeedback = phase === "feedback" && doneAll;

  const toggleMute = () => {
    audio.unlock();
    const next = !muted;
    setMuted(next);
    audio.setMuted(next);
    if (!next) audio.startCrowd();
  };

  const prompt = run?.prompts.find((p) => p.position === position);
  const inFinalFive = phase === "active" && secondsLeft <= 5 && secondsLeft > 0;

  const animation: RunnerAnimation =
    phase === "finishing"
      ? "dip"
      : phase === "active" || phase === "countdown" || phase === "feedback"
        ? "jog"
        : "idle";

  if (phase === "loading") {
    return <main className={styles.center}>Loading today&apos;s run...</main>;
  }
  if (phase === "error") {
    return <main className={styles.center}>{errorMsg}</main>;
  }

  return (
    <main
      className={`${styles.screen} ${
        inFinalFive ? (reducedMotion ? styles.steadyBorder : styles.pulseBorder) : ""
      }`}
      data-pulse-strength={inFinalFive ? 6 - secondsLeft : 0}
    >
      <header className={styles.topBar}>
        <div className={styles.distance}>
          {Math.round(distance).toLocaleString()} m
        </div>
        <div className={styles.dots}>
          {Array.from({ length: PROMPTS_PER_DAY }, (_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${
                i + 1 < position || (i + 1 === position && phase === "feedback")
                  ? styles.dotDone
                  : i + 1 === position
                    ? styles.dotActive
                    : ""
              }`}
            />
          ))}
        </div>
        <button
          className={styles.muteButton}
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? "SOUND OFF" : "SOUND ON"}
        </button>
      </header>

      <section className={styles.promptArea}>
        {prompt && phase !== "finishing" && (
          <div className={styles.promptCard}>
            <span className={styles.promptNumber}>
              {position} / {PROMPTS_PER_DAY}
            </span>
            {prompt.text}
          </div>
        )}
        {phase === "finishing" && (
          <div className={styles.promptCard}>Finish! Crossing the line...</div>
        )}
      </section>

      <section className={styles.canvasWrap}>
        <GameCanvas
          distanceMeters={distance}
          animation={animation}
          onLandmark={() => audio.play("landmark")}
        />
        {phase === "countdown" && (
          <div className={styles.overlayNumber}>{countdown > 0 ? countdown : "GO"}</div>
        )}
        {inFinalFive && <div className={styles.overlayNumber}>{secondsLeft}</div>}
        {phase === "tap-to-start" && (
          <button className={styles.tapOverlay} onClick={beginCountdown}>
            Tap to begin prompt {position}
          </button>
        )}
        {phase === "feedback" && feedback && (
          <div className={styles.feedbackCard}>
            {feedback.kind === "scored" ? (
              <>
                <div
                  className={styles.tierBadge}
                  data-tier={feedback.tier ?? ""}
                >
                  {feedback.tierLabel}
                </div>
                <div className={styles.feedbackAnswer}>{feedback.answer}</div>
                <div className={styles.feedbackPoints}>
                  +{feedback.points} pts · +{feedback.meters?.toLocaleString()} m
                </div>
              </>
            ) : (
              <>
                <div className={styles.tierBadge} data-tier="timeout">
                  Time!
                </div>
                <div className={styles.feedbackPoints}>
                  0 points. The runner keeps jogging.
                </div>
              </>
            )}
            <button className={styles.nextButton} onClick={isLastFeedback ? finishRun : onNext}>
              {isLastFeedback ? "Finish" : "Next prompt"}
            </button>
          </div>
        )}
      </section>

      <section className={styles.inputArea}>
        {phase === "active" && (
          <>
            <div className={styles.timerRow}>
              <div
                className={`${styles.timerBar} ${inFinalFive ? styles.timerBarDanger : ""}`}
                style={{ width: `${(secondsLeft / PROMPT_SECONDS) * 100}%` }}
              />
              <span className={styles.timerText}>{secondsLeft}s</span>
            </div>
            {suggestion && (
              <div className={styles.suggestion}>
                Did you mean <strong>{suggestion}</strong>? Run again to confirm.
              </div>
            )}
            {rejectMsg && !suggestion && (
              <div className={styles.rejectMsg}>{rejectMsg}</div>
            )}
            <form
              className={`${styles.inputRow} ${shake ? styles.shake : ""}`}
              onSubmit={(e) => {
                e.preventDefault();
                onRun();
              }}
            >
              <input
                ref={inputRef}
                className={styles.input}
                value={guess}
                onChange={(e) => onGuessChange(e.target.value)}
                placeholder="Type your answer"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={80}
              />
              <button type="submit" className={styles.runButton}>
                Run
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

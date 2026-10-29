/**
 * The single audio module. Every game sound routes through here.
 *
 * Files live in /public/sounds as placeholders to be replaced later;
 * keep the same file names. Per browser autoplay rules and the PRD,
 * nothing plays until the first user tap (call unlock() from a tap
 * handler), and the mute preference is remembered per device.
 */

export type SoundName =
  | "whistle" // prompt appears
  | "bwomp" // invalid answer
  | "cheer-small" // 10-Day Contract / Trick Play
  | "cheer-mid" // Role Player / All-Star
  | "cheer-big" // Hall of Famer
  | "hail-mary" // roar + fanfare
  | "landmark" // flag planted
  | "heartbeat" // last-5-seconds pulse
  | "finish" // finish-line whoosh
  | "jingle"; // results

const FILES: Record<SoundName, string> = {
  whistle: "/sounds/whistle.wav",
  bwomp: "/sounds/bwomp.wav",
  "cheer-small": "/sounds/cheer-small.wav",
  "cheer-mid": "/sounds/cheer-mid.wav",
  "cheer-big": "/sounds/cheer-big.wav",
  "hail-mary": "/sounds/hail-mary.wav",
  landmark: "/sounds/landmark.wav",
  heartbeat: "/sounds/heartbeat.wav",
  finish: "/sounds/finish.wav",
  jingle: "/sounds/jingle.wav",
};

const CROWD_LOOP = "/sounds/crowd-loop.wav";
const MUTE_KEY = "statillion-muted";

class AudioModule {
  private unlocked = false;
  private muted = true;
  private buffers = new Map<SoundName, HTMLAudioElement>();
  private crowd: HTMLAudioElement | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.muted = window.localStorage.getItem(MUTE_KEY) === "true";
      } catch {
        this.muted = false;
      }
    }
  }

  /** Call from the first user tap. Until then everything stays silent. */
  unlock(): void {
    if (this.unlocked || typeof window === "undefined") return;
    this.unlocked = true;
    for (const [name, src] of Object.entries(FILES)) {
      const el = new Audio(src);
      el.preload = "auto";
      this.buffers.set(name as SoundName, el);
    }
    this.crowd = new Audio(CROWD_LOOP);
    this.crowd.loop = true;
    this.crowd.volume = 0.12;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      window.localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      // fine
    }
    if (this.crowd) {
      if (muted) this.crowd.pause();
      else if (this.unlocked) void this.crowd.play().catch(() => {});
    }
  }

  play(name: SoundName): void {
    if (!this.unlocked || this.muted) return;
    const el = this.buffers.get(name);
    if (!el) return;
    try {
      el.currentTime = 0;
      void el.play().catch(() => {});
    } catch {
      // Ignore playback failures; sound is never load-bearing.
    }
  }

  /** Quiet stadium bed; volume swells slightly as distance grows. */
  startCrowd(): void {
    if (!this.unlocked || this.muted || !this.crowd) return;
    void this.crowd.play().catch(() => {});
  }

  stopCrowd(): void {
    this.crowd?.pause();
  }

  setCrowdIntensity(fraction: number): void {
    if (this.crowd) {
      this.crowd.volume = 0.1 + Math.min(1, Math.max(0, fraction)) * 0.15;
    }
  }
}

export const audio = new AudioModule();

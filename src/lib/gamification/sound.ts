// Synthesized sound effects via the Web Audio API — no asset files. Safe to import anywhere;
// all calls no-op on the server or when disabled. A single AudioContext is shared and resumed
// lazily on the first (gesture-driven) play.

export type SoundName =
  | "correct"
  | "combo"
  | "coin"
  | "levelUp"
  | "error"
  | "questComplete"
  | "achievement";

export type SoundPack = "arcade" | "chiptune" | "soft";

export type SoundPrefs = {
  enabled: boolean;
  volume: number; // 0..1
  pack: SoundPack;
};

const PACK_WAVE: Record<SoundPack, OscillatorType> = {
  arcade: "triangle",
  chiptune: "square",
  soft: "sine"
};

let audioContext: AudioContext | null = null;

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

// Call once from a user gesture to unlock audio on strict browsers.
export function primeAudio(): void {
  getContext();
}

function blip(
  ctx: AudioContext,
  wave: OscillatorType,
  master: number,
  freq: number,
  startOffset: number,
  duration: number,
  peak = 1
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;

  const t0 = ctx.currentTime + startOffset;
  const level = master * peak;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playSound(name: SoundName, prefs: SoundPrefs, variant = 0): void {
  if (!prefs.enabled) return;
  const ctx = getContext();
  if (!ctx) return;

  const wave = PACK_WAVE[prefs.pack];
  const master = Math.max(0, Math.min(1, prefs.volume)) * 0.28;

  switch (name) {
    case "correct":
      blip(ctx, wave, master, 660, 0, 0.09);
      blip(ctx, wave, master, 880, 0.07, 0.11);
      break;
    case "combo": {
      const freq = Math.min(1760, 520 + variant * 45);
      blip(ctx, wave, master, freq, 0, 0.1, 1.1);
      break;
    }
    case "coin":
      blip(ctx, wave, master, 988, 0, 0.06);
      blip(ctx, wave, master, 1319, 0.05, 0.14);
      break;
    case "levelUp":
      [523, 659, 784, 1047].forEach((freq, i) => blip(ctx, wave, master, freq, i * 0.1, 0.16, 1.1));
      break;
    case "error":
      blip(ctx, "sawtooth", master * 0.8, 220, 0, 0.12);
      blip(ctx, "sawtooth", master * 0.8, 140, 0.09, 0.16);
      break;
    case "questComplete":
      [523, 659, 880].forEach((freq, i) => blip(ctx, wave, master, freq, i * 0.08, 0.14));
      break;
    case "achievement":
      [784, 784, 784, 1047].forEach((freq, i) =>
        blip(ctx, wave, master, freq, i * 0.12, 0.18, 1.15)
      );
      break;
    default:
      break;
  }
}

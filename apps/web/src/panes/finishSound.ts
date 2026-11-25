interface ChimeParam {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

interface ChimeNode {
  connect(destination: unknown): unknown;
}

/** The part of `AudioContext` that the sound uses. A test gives a stand-in. */
export interface ChimeAudioContext {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): ChimeNode & {
    type: string;
    readonly frequency: ChimeParam;
    start(when: number): void;
    stop(when: number): void;
  };
  createGain(): ChimeNode & { readonly gain: ChimeParam };
}

// Two soft sine notes, a fourth apart: E5 then A5.
const NOTES = [
  { frequency: 659.25, offset: 0 },
  { frequency: 880, offset: 0.09 },
] as const;
const PEAK_GAIN = 0.06;
const ATTACK_SECONDS = 0.012;
const NOTE_SECONDS = 0.3;
export const FINISH_SOUND_SECONDS = 0.4;

// A running context keeps the audio thread and output stream busy, so it sleeps between sounds.
const SUSPEND_AFTER_MS = (FINISH_SOUND_SECONDS + 0.1) * 1000;

/** The sound of a finished thread, made with Web Audio. No audio file. */
export function createFinishSound(createContext: () => ChimeAudioContext) {
  let context: ChimeAudioContext | undefined;
  let unlocked = false;
  let starting = false;
  let suspending: Promise<void> | undefined;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  let playingUntil = 0;

  const sleepLater = (target: ChimeAudioContext) => {
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => {
      if (context !== target) return;
      const done = target.suspend().catch(() => undefined);
      suspending = done;
      void done.then(() => {
        if (suspending === done) suspending = undefined;
      });
    }, SUSPEND_AFTER_MS);
  };

  const playNotes = (target: ChimeAudioContext) => {
    const now = target.currentTime;
    playingUntil = now + FINISH_SOUND_SECONDS;
    for (const note of NOTES) {
      const start = now + note.offset;
      const oscillator = target.createOscillator();
      const gain = target.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + ATTACK_SECONDS);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_SECONDS);
      oscillator.connect(gain);
      gain.connect(target.destination);
      oscillator.start(start);
      oscillator.stop(start + NOTE_SECONDS);
    }
    sleepLater(target);
  };

  return {
    /** Call it from a click or a key: a browser starts no audio before the first one. */
    unlock(): void {
      context ??= createContext();
      if (unlocked || starting) return;
      const target = context;
      if (target.state === "running") {
        unlocked = true;
        sleepLater(target);
        return;
      }
      starting = true;
      void target.resume().then(
        () => {
          starting = false;
          if (context !== target) return;
          unlocked = true;
          sleepLater(target);
        },
        () => {
          starting = false;
        },
      );
    },
    /** False when no sound started: no click or key yet, or the sound still plays. */
    play(): boolean {
      const target = context;
      if (target === undefined || !unlocked || starting) return false;
      // Threads that finish in the same moment share one sound.
      if (target.currentTime < playingUntil) return false;
      if (target.state === "running" && suspending === undefined) {
        playNotes(target);
        return true;
      }
      // The click or key that unlocked the sound lets a later resume start without one.
      starting = true;
      void (suspending ?? Promise.resolve())
        .then(() => target.resume())
        .then(
          () => {
            starting = false;
            if (context === target) playNotes(target);
          },
          () => {
            starting = false;
          },
        );
      return true;
    },
    /** Releases the audio output. The next click or key makes a new context. */
    close(): void {
      clearTimeout(suspendTimer);
      const target = context;
      context = undefined;
      unlocked = false;
      starting = false;
      suspending = undefined;
      playingUntil = 0;
      void target?.close().catch(() => undefined);
    },
  };
}

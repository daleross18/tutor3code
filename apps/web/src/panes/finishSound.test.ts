import { expect, it, vi } from "vite-plus/test";

import { createFinishSound, FINISH_SOUND_SECONDS, type ChimeAudioContext } from "./finishSound";

/** Stands in for `AudioContext`: a clock the test moves, and a count of the notes started. */
function fakeAudio(initialState = "suspended") {
  const audio = {
    now: 0,
    state: initialState,
    contexts: 0,
    resumes: 0,
    suspends: 0,
    closes: 0,
    notes: 0,
  };
  const param = {
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  };
  const createContext = (): ChimeAudioContext => {
    audio.contexts += 1;
    return {
      get currentTime() {
        return audio.now;
      },
      get state() {
        return audio.state;
      },
      destination: {},
      resume: async () => {
        audio.resumes += 1;
        audio.state = "running";
      },
      suspend: async () => {
        audio.suspends += 1;
        audio.state = "suspended";
      },
      close: async () => {
        audio.closes += 1;
        audio.state = "closed";
      },
      createOscillator: () => ({
        type: "",
        frequency: param,
        connect: () => undefined,
        start: () => void (audio.notes += 1),
        stop: () => undefined,
      }),
      createGain: () => ({ gain: param, connect: () => undefined }),
    };
  };
  return { audio, sound: createFinishSound(createContext) };
}

function useFakeTimers(): Disposable {
  vi.useFakeTimers();
  return { [Symbol.dispose]: () => void vi.useRealTimers() };
}

it("plays nothing before the first click or key", () => {
  const { audio, sound } = fakeAudio();
  expect(sound.play()).toBe(false);
  expect(audio.contexts).toBe(0);
});

it("makes one context on the first click, and plays after it resumes", async () => {
  const { audio, sound } = fakeAudio();
  using _timers = useFakeTimers();
  sound.unlock();
  sound.unlock();
  await vi.advanceTimersByTimeAsync(0);
  expect(audio).toMatchObject({ contexts: 1, state: "running", resumes: 1 });
  expect(sound.play()).toBe(true);
  expect(audio.notes).toBe(2);
});

it("plays one sound for threads that finish in the same moment", () => {
  using _timers = useFakeTimers();
  const { audio, sound } = fakeAudio("running");
  sound.unlock();
  expect(sound.play()).toBe(true);
  audio.now = FINISH_SOUND_SECONDS / 2;
  expect(sound.play()).toBe(false);
  audio.now = FINISH_SOUND_SECONDS;
  expect(sound.play()).toBe(true);
  expect(audio.notes).toBe(4);
});

it("suspends the context after each sound, and resumes it for the next one", async () => {
  using _timers = useFakeTimers();
  const { audio, sound } = fakeAudio("running");
  sound.unlock();
  await vi.advanceTimersByTimeAsync((FINISH_SOUND_SECONDS + 0.1) * 1000);
  expect(audio).toMatchObject({ state: "suspended", suspends: 1 });

  expect(sound.play()).toBe(true);
  expect(sound.play()).toBe(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(audio).toMatchObject({ state: "running", resumes: 1, notes: 2 });
  await vi.advanceTimersByTimeAsync((FINISH_SOUND_SECONDS + 0.1) * 1000);
  expect(audio).toMatchObject({ state: "suspended", suspends: 2 });
});

it("closes the context when the sound is turned off, and makes a new one on the next click", () => {
  using _timers = useFakeTimers();
  const { audio, sound } = fakeAudio("running");
  sound.unlock();
  sound.close();
  expect(audio).toMatchObject({ closes: 1, state: "closed" });
  expect(sound.play()).toBe(false);
  vi.runAllTimers();
  expect(audio.suspends).toBe(0);
  sound.unlock();
  expect(audio.contexts).toBe(2);
});

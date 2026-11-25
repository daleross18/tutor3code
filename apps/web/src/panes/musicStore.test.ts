import type { SpotifyCommandResult, SpotifyPlayback, SpotifyStateResult } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { readMusicState, sendMusicCommand, setMusicVolume, useMusicStore } from "./musicStore";

const playing: SpotifyPlayback = {
  playerState: "playing",
  volume: 60,
  positionSeconds: 10,
  durationSeconds: 200,
  track: { name: "Song", artist: "Band", album: "Album" },
};
const ok = (playback: SpotifyPlayback): SpotifyStateResult => ({ kind: "ok", playback });

/** A Mac app whose bridge answers each read when the test says so. */
function setup(sendResult: SpotifyCommandResult = { kind: "sent" }) {
  const reads: Array<(result: SpotifyStateResult) => void> = [];
  const getSpotifyState = vi.fn(
    () => new Promise<SpotifyStateResult>((resolve) => reads.push(resolve)),
  );
  const sendSpotifyCommand = vi.fn(() => Promise.resolve(sendResult));
  vi.stubGlobal("window", { desktopBridge: { getSpotifyState, sendSpotifyCommand } });
  vi.stubGlobal("navigator", { platform: "MacIntel" });
  vi.useFakeTimers();
  useMusicStore.setState({ openId: null, result: null });
  const answer = async (result: SpotifyStateResult) => {
    reads.shift()!(result);
    await vi.advanceTimersByTimeAsync(0);
  };
  return {
    getSpotifyState,
    sendSpotifyCommand,
    answer,
    [Symbol.dispose]: () => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    },
  };
}

const shown = () => useMusicStore.getState().result;

it("runs one read at a time, and one more after it for a request in between", async () => {
  using bridge = setup();
  const first = readMusicState();
  void readMusicState();
  void readMusicState();
  expect(bridge.getSpotifyState).toHaveBeenCalledTimes(1);
  await bridge.answer(ok(playing));
  expect(shown()).toEqual(ok(playing));
  expect(bridge.getSpotifyState).toHaveBeenCalledTimes(2);
  await bridge.answer(ok({ ...playing, volume: 10 }));
  await first;
  expect(shown()).toEqual(ok({ ...playing, volume: 10 }));
  expect(bridge.getSpotifyState).toHaveBeenCalledTimes(2);
});

it("shows a command at once, drops a read from before it, and reads one time after it", async () => {
  using bridge = setup();
  const firstRead = readMusicState();
  await bridge.answer(ok(playing));
  await firstRead;

  const staleRead = readMusicState();
  sendMusicCommand({ type: "playpause" });
  expect(shown()).toEqual(ok({ ...playing, playerState: "paused" }));
  expect(bridge.sendSpotifyCommand).toHaveBeenCalledExactlyOnceWith({ type: "playpause" });
  // The read started before the command, so it still says "playing".
  await bridge.answer(ok(playing));
  await staleRead;
  expect(shown()).toEqual(ok({ ...playing, playerState: "paused" }));

  expect(bridge.getSpotifyState).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(300);
  expect(bridge.getSpotifyState).toHaveBeenCalledTimes(3);
  await bridge.answer(ok({ ...playing, playerState: "paused", positionSeconds: 11 }));
  expect(shown()).toEqual(ok({ ...playing, playerState: "paused", positionSeconds: 11 }));
});

it("sends the last value of a volume drag one time", async () => {
  using bridge = setup();
  const read = readMusicState();
  await bridge.answer(ok(playing));
  await read;
  for (const volume of [55, 40, 35]) setMusicVolume(volume);
  expect(shown()).toEqual(ok({ ...playing, volume: 35 }));
  expect(bridge.sendSpotifyCommand).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(150);
  expect(bridge.sendSpotifyCommand).toHaveBeenCalledExactlyOnceWith({
    type: "setVolume",
    volume: 35,
  });
});

it("shows why a command did not reach Spotify", async () => {
  using bridge = setup({ kind: "notRunning" });
  const read = readMusicState();
  await bridge.answer(ok(playing));
  await read;
  sendMusicCommand({ type: "next" });
  await vi.advanceTimersByTimeAsync(0);
  expect(shown()).toEqual({ kind: "notRunning" });
  // No read follows a command that failed. The open popup reads again at its next tick.
  await vi.advanceTimersByTimeAsync(300);
  expect(bridge.getSpotifyState).toHaveBeenCalledTimes(1);
});

import type { SpotifyPlayback } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { musicBridge, musicHelp, playbackAfterCommand } from "./music";

const playback: SpotifyPlayback = {
  playerState: "playing",
  volume: 60,
  positionSeconds: 10,
  durationSeconds: 200,
  track: { name: "Song", artist: "Band", album: "Album" },
};

it.each([
  ["pause for a playing track", playback, { type: "playpause" }, { playerState: "paused" }],
  [
    "play for a paused track",
    { ...playback, playerState: "paused" },
    { type: "playpause" },
    { playerState: "playing" },
  ],
  [
    "play for a stopped player",
    { ...playback, playerState: "stopped" },
    { type: "playpause" },
    { playerState: "playing" },
  ],
  ["the new volume", playback, { type: "setVolume", volume: 25 }, { volume: 25 }],
  ["the new position", playback, { type: "seek", positionSeconds: 90 }, { positionSeconds: 90 }],
  // Only Spotify knows the track that comes next.
  ["no change for the next track", playback, { type: "next" }, {}],
  ["no change for the previous track", playback, { type: "previous" }, {}],
] as const)("shows %s at once", (_name, before, command, change) => {
  expect(playbackAfterCommand(before, command)).toEqual({ ...before, ...change });
});

it("shows the controls for a state, and one line of help for each other answer", () => {
  expect(musicHelp({ kind: "ok", playback })).toBeNull();
  expect(musicHelp(null)).toBe("Reading Spotify…");
  expect(musicHelp({ kind: "notRunning" })).toMatch(/Open the Spotify app/);
  expect(musicHelp({ kind: "permissionDenied" })).toMatch(/Privacy & Security > Automation/);
  expect(musicHelp({ kind: "unsupported" })).toMatch(/only in the Mac app/);
  expect(musicHelp({ kind: "error", message: "osascript gave no answer." })).toBe(
    "Spotify gave no state. osascript gave no answer.",
  );
});

it("has a bridge only in the Mac app", () => {
  const bridge = { getSpotifyState: vi.fn(), sendSpotifyCommand: vi.fn() };
  using _globals = { [Symbol.dispose]: () => vi.unstubAllGlobals() };
  // A browser.
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { platform: "MacIntel" });
  expect(musicBridge()).toBeNull();
  // The desktop app of an older build, with no music methods.
  vi.stubGlobal("window", { desktopBridge: { getSpotifyState: bridge.getSpotifyState } });
  expect(musicBridge()).toBeNull();
  vi.stubGlobal("window", { desktopBridge: bridge });
  expect(musicBridge()).toEqual(bridge);
  // The desktop app on Windows or Linux.
  vi.stubGlobal("navigator", { platform: "Linux x86_64" });
  expect(musicBridge()).toBeNull();
});

import { expect, it } from "vite-plus/test";

import {
  failureFromOsascript,
  osascriptForCommand,
  parseSpotifyState,
  readSpotifyState,
  sendSpotifyCommandWith,
  type OsascriptRunner,
} from "./forkSpotify.ts";

const SEP = "\u001f";
const answer = (...fields: ReadonlyArray<string>) => `${fields.join(SEP)}\n`;

/** Answers each script in turn, and records what `osascript` would get. */
function fakeRunner(...outcomes: ReadonlyArray<Awaited<ReturnType<OsascriptRunner>>>) {
  const calls: Array<{ readonly script: string; readonly args: ReadonlyArray<string> }> = [];
  const run: OsascriptRunner = (script, args) => {
    calls.push({ script: script.join("\n"), args });
    const outcome = outcomes[calls.length - 1];
    if (outcome === undefined) throw new Error("The runner got more scripts than the test allows.");
    return Promise.resolve(outcome);
  };
  return { run, calls };
}

it.each([
  [
    "a playing track",
    answer("playing", "62", "41", "215", "Song, part 2", "Band", "Album"),
    {
      playerState: "playing",
      volume: 62,
      positionSeconds: 41,
      durationSeconds: 215,
      track: { name: "Song, part 2", artist: "Band", album: "Album" },
    },
  ],
  [
    "no current track",
    answer("stopped", "100", "0", "0", "", "", ""),
    { playerState: "stopped", volume: 100, positionSeconds: 0, durationSeconds: 0, track: null },
  ],
  [
    "a number with the decimal comma of the system language, and a volume above the range",
    answer("paused", "140", "12,6", "x", "Song", "", ""),
    {
      playerState: "paused",
      volume: 100,
      positionSeconds: 13,
      durationSeconds: 0,
      track: { name: "Song", artist: "", album: "" },
    },
  ],
] as const)("reads %s", (_name, stdout, playback) => {
  expect(parseSpotifyState(stdout)).toEqual(playback);
});

it.each([
  ["an unknown player state", answer("buffering", "1", "0", "0", "", "", "")],
  ["too few fields", answer("playing", "1", "0")],
  ["a separator inside a field", answer("playing", "1", "0", "0", "a", "b", "c", "d")],
  ["no text", ""],
])("reads nothing from %s", (_name, stdout) => {
  expect(parseSpotifyState(stdout)).toBeNull();
});

it.each([
  [
    "execution error: Not authorised to send Apple events to Spotify. (-1743)",
    { kind: "permissionDenied" },
  ],
  [
    "execution error: Spotify got an error: Application isn’t running. (-600)",
    { kind: "notRunning" },
  ],
  ["execution error: An error of type -10814 has occurred. (-10814)", { kind: "notRunning" }],
  [
    "12:20: syntax error: Expected end of line. (-2741)\nmore",
    { kind: "error", message: "12:20: syntax error: Expected end of line. (-2741)" },
  ],
  ["  ", { kind: "error", message: "osascript gave no answer." }],
] as const)("maps the osascript error %j", (stderr, failure) => {
  expect(failureFromOsascript(stderr)).toEqual(failure);
});

it("has one fixed script for each command, and passes a number only as an argument", () => {
  const scripts = (
    [
      [{ type: "playpause" }, "to playpause", []],
      [{ type: "next" }, "to next track", []],
      [{ type: "previous" }, "to previous track", []],
      [{ type: "setVolume", volume: 37 }, "set sound volume to ((item 1 of argv)", ["37"]],
      [{ type: "seek", positionSeconds: 95 }, "set player position to ((item 1 of argv)", ["95"]],
    ] as const
  ).map(([command, action, args]) => {
    const { script, args: sent } = osascriptForCommand(command);
    const text = script.join("\n");
    expect(text).toContain(action);
    expect(sent).toEqual(args);
    // A script that tells Spotify with no check would start the app.
    expect(text.indexOf("is running")).toBeGreaterThan(-1);
    expect(text.indexOf("is running")).toBeLessThan(text.indexOf("tell application"));
    return text;
  });
  expect(scripts.join("\n")).not.toMatch(/37|95/);
  expect(osascriptForCommand({ type: "setVolume", volume: 80 }).script).toEqual(
    osascriptForCommand({ type: "setVolume", volume: 5 }).script,
  );
});

it("reads no state off macOS, and runs no script there", async () => {
  const { run, calls } = fakeRunner();
  expect(await readSpotifyState("linux", run)).toEqual({ kind: "unsupported" });
  expect(await sendSpotifyCommandWith("win32", run, { type: "next" })).toEqual({
    kind: "unsupported",
  });
  expect(calls).toEqual([]);
});

it("does not tell Spotify anything while Spotify does not run", async () => {
  const { run, calls } = fakeRunner({ ok: true, stdout: "false\n" });
  expect(await readSpotifyState("darwin", run)).toEqual({ kind: "notRunning" });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.script).not.toContain("tell");
});

it("reads the state of a running Spotify with two scripts", async () => {
  const { run, calls } = fakeRunner(
    { ok: true, stdout: "true\n" },
    { ok: true, stdout: answer("playing", "50", "3", "200", "Song", "Band", "Album") },
  );
  expect(await readSpotifyState("darwin", run)).toEqual({
    kind: "ok",
    playback: {
      playerState: "playing",
      volume: 50,
      positionSeconds: 3,
      durationSeconds: 200,
      track: { name: "Song", artist: "Band", album: "Album" },
    },
  });
  expect(calls[1]?.script).toContain("player state");
  expect(calls[1]?.script.indexOf("is running")).toBeLessThan(calls[1]!.script.indexOf("tell"));
});

it.each([
  [
    "a refused Apple event",
    { ok: false, stderr: "execution error: Not authorised. (-1743)" },
    { kind: "permissionDenied" },
  ],
  [
    "a Spotify that quit after the check",
    { ok: true, stdout: "not-running\n" },
    { kind: "notRunning" },
  ],
  [
    "an answer that is no state",
    { ok: true, stdout: "hello\n" },
    { kind: "error", message: "Spotify gave an answer that the app cannot read." },
  ],
] as const)("reports %s", async (_name, stateOutcome, result) => {
  const { run } = fakeRunner({ ok: true, stdout: "true\n" }, stateOutcome);
  expect(await readSpotifyState("darwin", run)).toEqual(result);
});

it.each([
  [{ ok: true, stdout: "sent\n" }, { kind: "sent" }],
  [{ ok: true, stdout: "not-running\n" }, { kind: "notRunning" }],
  [{ ok: false, stderr: "execution error: Not authorised. (-1743)" }, { kind: "permissionDenied" }],
] as const)("sends a command with one script: %j", async (outcome, result) => {
  const { run, calls } = fakeRunner(outcome);
  expect(await sendSpotifyCommandWith("darwin", run, { type: "setVolume", volume: 40 })).toEqual(
    result,
  );
  expect(calls).toEqual([{ script: expect.stringContaining("set sound volume"), args: ["40"] }]);
});

// @effect-diagnostics nodeBuiltinImport:off -- The Spotify app has no API but AppleScript, which only `osascript` runs.
import * as NodeChildProcess from "node:child_process";

import type {
  SpotifyCommand,
  SpotifyCommandResult,
  SpotifyFailure,
  SpotifyPlayback,
  SpotifyStateResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";
import { GET_SPOTIFY_STATE_CHANNEL, SEND_SPOTIFY_COMMAND_CHANNEL } from "../forkChannels.ts";

const Failure = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("unsupported") }),
  Schema.Struct({ kind: Schema.Literal("notRunning") }),
  Schema.Struct({ kind: Schema.Literal("permissionDenied") }),
  Schema.Struct({ kind: Schema.Literal("error"), message: Schema.String }),
]);

const Playback = Schema.Struct({
  playerState: Schema.Literals(["playing", "paused", "stopped"]),
  volume: Schema.Number,
  positionSeconds: Schema.Number,
  durationSeconds: Schema.Number,
  track: Schema.NullOr(
    Schema.Struct({ name: Schema.String, artist: Schema.String, album: Schema.String }),
  ),
});

const StateResult = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ok"), playback: Playback }),
  ...Failure.members,
]);

const CommandResult = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("sent") }),
  ...Failure.members,
]);

// The renderer sends this value. A number outside its range never reaches `osascript`.
const Command = Schema.Union([
  Schema.Struct({ type: Schema.Literal("playpause") }),
  Schema.Struct({ type: Schema.Literal("next") }),
  Schema.Struct({ type: Schema.Literal("previous") }),
  Schema.Struct({
    type: Schema.Literal("setVolume"),
    volume: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  }),
  Schema.Struct({
    type: Schema.Literal("seek"),
    positionSeconds: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 86_400 })),
  }),
]);

type OsascriptOutcome =
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly stderr: string };

/** Runs fixed script lines. `args` reach the script as `argv`, never as script text. */
export type OsascriptRunner = (
  script: ReadonlyArray<string>,
  args: ReadonlyArray<string>,
) => Promise<OsascriptOutcome>;

const SPOTIFY = 'application id "com.spotify.client"';
const NOT_RUNNING = "not-running";
// `tell application` starts an app that does not run. Each script that tells Spotify asks first.
const STOP_UNLESS_RUNNING = `if not (${SPOTIFY} is running) then return "${NOT_RUNNING}"`;
const FIELD_SEPARATOR = "\u001f";

// No Spotify term: a script with one does not compile on a Mac that has no Spotify.
const RUNNING_SCRIPT = [`${SPOTIFY} is running`];

const STATE_SCRIPT = [
  "on run",
  STOP_UNLESS_RUNNING,
  "set sep to character id 31",
  `tell ${SPOTIFY}`,
  'set stateText to "stopped"',
  "if player state is playing then",
  'set stateText to "playing"',
  "else if player state is paused then",
  'set stateText to "paused"',
  "end if",
  "set volumeText to (sound volume as integer) as text",
  'set positionText to "0"',
  'set durationText to "0"',
  'set trackName to ""',
  'set trackArtist to ""',
  'set trackAlbum to ""',
  // Spotify has no current track before the first play, and each of these reads then fails.
  "try",
  "set trackName to name of current track",
  "set trackArtist to artist of current track",
  "set trackAlbum to album of current track",
  "set durationText to ((duration of current track) div 1000) as text",
  "set positionText to ((player position) div 1) as text",
  "end try",
  "return stateText & sep & volumeText & sep & positionText & sep & durationText & sep & trackName & sep & trackArtist & sep & trackAlbum",
  "end tell",
  "end run",
];

function commandScript(action: string): ReadonlyArray<string> {
  return [
    "on run argv",
    STOP_UNLESS_RUNNING,
    `tell ${SPOTIFY} to ${action}`,
    'return "sent"',
    "end run",
  ];
}

/** The fixed script of each command, and the one number it may carry. */
export function osascriptForCommand(command: SpotifyCommand): {
  readonly script: ReadonlyArray<string>;
  readonly args: ReadonlyArray<string>;
} {
  switch (command.type) {
    case "playpause":
      return { script: commandScript("playpause"), args: [] };
    case "next":
      return { script: commandScript("next track"), args: [] };
    case "previous":
      return { script: commandScript("previous track"), args: [] };
    case "setVolume":
      return {
        script: commandScript("set sound volume to ((item 1 of argv) as integer)"),
        args: [String(command.volume)],
      };
    case "seek":
      return {
        script: commandScript("set player position to ((item 1 of argv) as integer)"),
        args: [String(command.positionSeconds)],
      };
  }
}

/** -1743: macOS did not allow the Apple event. -600 and -10814: the app is gone or not installed. */
export function failureFromOsascript(stderr: string): SpotifyFailure {
  if (stderr.includes("(-1743)")) return { kind: "permissionDenied" };
  if (stderr.includes("(-600)") || stderr.includes("(-10814)")) return { kind: "notRunning" };
  const message = stderr.trim().split("\n")[0] ?? "";
  return { kind: "error", message: message === "" ? "osascript gave no answer." : message };
}

function wholeNumber(text: string | undefined): number {
  // AppleScript writes a real number with the decimal mark of the system language.
  const value = Number((text ?? "").trim().replace(",", "."));
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** The answer of `STATE_SCRIPT`, or null for text that is no answer of that script. */
export function parseSpotifyState(stdout: string): SpotifyPlayback | null {
  const [state, volume, position, duration, name, artist, album, ...rest] = stdout
    .replace(/\r?\n$/, "")
    .split(FIELD_SEPARATOR);
  if (state !== "playing" && state !== "paused" && state !== "stopped") return null;
  if (album === undefined || rest.length > 0) return null;
  return {
    playerState: state,
    volume: Math.min(100, wholeNumber(volume)),
    positionSeconds: wholeNumber(position),
    durationSeconds: wholeNumber(duration),
    track:
      name === "" && artist === "" && album === ""
        ? null
        : { name: name ?? "", artist: artist ?? "", album },
  };
}

export async function readSpotifyState(
  platform: string,
  run: OsascriptRunner,
): Promise<SpotifyStateResult> {
  if (platform !== "darwin") return { kind: "unsupported" };
  const running = await run(RUNNING_SCRIPT, []);
  if (!running.ok) return failureFromOsascript(running.stderr);
  if (running.stdout.trim() !== "true") return { kind: "notRunning" };
  const state = await run(STATE_SCRIPT, []);
  if (!state.ok) return failureFromOsascript(state.stderr);
  if (state.stdout.trim() === NOT_RUNNING) return { kind: "notRunning" };
  const playback = parseSpotifyState(state.stdout);
  return playback === null
    ? { kind: "error", message: "Spotify gave an answer that the app cannot read." }
    : { kind: "ok", playback };
}

export async function sendSpotifyCommandWith(
  platform: string,
  run: OsascriptRunner,
  command: SpotifyCommand,
): Promise<SpotifyCommandResult> {
  if (platform !== "darwin") return { kind: "unsupported" };
  const { script, args } = osascriptForCommand(command);
  const outcome = await run(script, args);
  if (!outcome.ok) return failureFromOsascript(outcome.stderr);
  return outcome.stdout.trim() === NOT_RUNNING ? { kind: "notRunning" } : { kind: "sent" };
}

// The first Apple event waits for the user's answer to the macOS permission question.
const OSASCRIPT_TIMEOUT_MS = 20_000;

const runOsascript: OsascriptRunner = (script, args) =>
  new Promise((resolve) => {
    NodeChildProcess.execFile(
      "/usr/bin/osascript",
      [...script.flatMap((line) => ["-e", line]), ...args],
      { timeout: OSASCRIPT_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        if (error === null) resolve({ ok: true, stdout });
        else resolve({ ok: false, stderr: stderr.trim() === "" ? error.message : stderr });
      },
    );
  });

export const getSpotifyState = makeIpcMethod({
  channel: GET_SPOTIFY_STATE_CHANNEL,
  payload: Schema.Void,
  result: StateResult,
  handler: Effect.fn("desktop.ipc.forkSpotify.getSpotifyState")(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    return yield* Effect.promise(() => readSpotifyState(environment.platform, runOsascript));
  }),
});

export const sendSpotifyCommand = makeIpcMethod({
  channel: SEND_SPOTIFY_COMMAND_CHANNEL,
  payload: Command,
  result: CommandResult,
  handler: Effect.fn("desktop.ipc.forkSpotify.sendSpotifyCommand")(function* (command) {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    return yield* Effect.promise(() =>
      sendSpotifyCommandWith(environment.platform, runOsascript, command),
    );
  }),
});

// Fork-owned: the desktop bridge types of the music control. The Mac app controls the Spotify
// app of its own machine through AppleScript. No stock server and no Spotify account is used.

/** The closed list of commands that the main process accepts. */
export type SpotifyCommand =
  | { readonly type: "playpause" }
  | { readonly type: "next" }
  | { readonly type: "previous" }
  /** A whole number from 0 to 100. */
  | { readonly type: "setVolume"; readonly volume: number }
  /** A whole number of seconds from the start of the track. */
  | { readonly type: "seek"; readonly positionSeconds: number };

export interface SpotifyPlayback {
  readonly playerState: "playing" | "paused" | "stopped";
  /** 0 to 100. */
  readonly volume: number;
  readonly positionSeconds: number;
  readonly durationSeconds: number;
  /** Null when Spotify has no current track. */
  readonly track: {
    readonly name: string;
    readonly artist: string;
    readonly album: string;
  } | null;
}

/** Why the main process could not reach Spotify. */
export type SpotifyFailure =
  /** The app does not run on macOS. */
  | { readonly kind: "unsupported" }
  /** Spotify does not run, or is not installed. The bridge never starts it. */
  | { readonly kind: "notRunning" }
  /** macOS refused the Apple event (error -1743): the user did not allow the app to control Spotify. */
  | { readonly kind: "permissionDenied" }
  | { readonly kind: "error"; readonly message: string };

export type SpotifyStateResult =
  | { readonly kind: "ok"; readonly playback: SpotifyPlayback }
  | SpotifyFailure;

export type SpotifyCommandResult = { readonly kind: "sent" } | SpotifyFailure;

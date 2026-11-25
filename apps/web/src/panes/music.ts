import type {
  DesktopBridge,
  SpotifyCommand,
  SpotifyPlayback,
  SpotifyStateResult,
} from "@t3tools/contracts";
import { isMacPlatform } from "@t3tools/shared/keybindings";

export interface MusicBridge {
  readonly getSpotifyState: NonNullable<DesktopBridge["getSpotifyState"]>;
  readonly sendSpotifyCommand: NonNullable<DesktopBridge["sendSpotifyCommand"]>;
}

/** The Mac app controls the Spotify app of its own machine. A browser has no bridge. */
export function musicBridge(): MusicBridge | null {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  const { getSpotifyState, sendSpotifyCommand } = bridge ?? {};
  if (getSpotifyState === undefined || sendSpotifyCommand === undefined) return null;
  return isMacPlatform(navigator.platform) ? { getSpotifyState, sendSpotifyCommand } : null;
}

/** What the popup shows at once after a command, before Spotify gives its new state. */
export function playbackAfterCommand(
  playback: SpotifyPlayback,
  command: SpotifyCommand,
): SpotifyPlayback {
  switch (command.type) {
    case "playpause":
      return {
        ...playback,
        playerState: playback.playerState === "playing" ? "paused" : "playing",
      };
    case "setVolume":
      return { ...playback, volume: command.volume };
    case "seek":
      return { ...playback, positionSeconds: command.positionSeconds };
    default:
      // Only Spotify knows the next and the previous track.
      return playback;
  }
}

/** The line of help of the popup, or null while the controls show. */
export function musicHelp(result: SpotifyStateResult | null): string | null {
  switch (result?.kind) {
    case undefined:
      return "Reading Spotify…";
    case "ok":
      return null;
    case "notRunning":
      return "Spotify does not run on this Mac. Open the Spotify app to control it here.";
    case "permissionDenied":
      return "macOS does not let this app control Spotify. Allow it in System Settings > Privacy & Security > Automation, in the row of this app.";
    case "unsupported":
      return "The music control works only in the Mac app.";
    case "error":
      return `Spotify gave no state. ${result.message}`;
  }
}

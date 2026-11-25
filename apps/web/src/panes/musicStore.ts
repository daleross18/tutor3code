import type { SpotifyCommand, SpotifyFailure, SpotifyStateResult } from "@t3tools/contracts";
import { create } from "zustand";

import { musicBridge, playbackAfterCommand } from "./music";

/** Spotify needs a moment before it reports the track that a command started. */
const READ_AFTER_COMMAND_MS = 300;
/** A drag of the volume slider sends its last value, not one `osascript` for each step. */
const VOLUME_SEND_DELAY_MS = 150;

interface MusicState {
  /** The control whose popup is open. */
  readonly openId: string | null;
  /** Null until the first read. */
  readonly result: SpotifyStateResult | null;
}

export const useMusicStore = create<MusicState>(() => ({ openId: null, result: null }));

// A read that started before a command holds the state of before the command.
let commandCount = 0;
let reading = false;
let readAgain = false;
let readAfterCommandTimer: ReturnType<typeof setTimeout> | undefined;
let volumeTimer: ReturnType<typeof setTimeout> | undefined;
let returnFocusTo: HTMLElement | null = null;
let closedByKey = false;

const failure = (cause: unknown): SpotifyFailure => ({
  kind: "error",
  message: cause instanceof Error ? cause.message : String(cause),
});

/** One read at a time. A request during a read starts one more read after it. */
export async function readMusicState(): Promise<void> {
  const bridge = musicBridge();
  if (bridge === null) return;
  if (reading) {
    readAgain = true;
    return;
  }
  reading = true;
  do {
    readAgain = false;
    const commandsBefore = commandCount;
    const result = await bridge.getSpotifyState().catch(failure);
    if (commandsBefore === commandCount) useMusicStore.setState({ result });
  } while (readAgain);
  reading = false;
}

function showCommand(command: SpotifyCommand): void {
  commandCount += 1;
  const { result } = useMusicStore.getState();
  if (result?.kind !== "ok") return;
  useMusicStore.setState({
    result: { kind: "ok", playback: playbackAfterCommand(result.playback, command) },
  });
}

async function sendShownCommand(command: SpotifyCommand): Promise<void> {
  const bridge = musicBridge();
  if (bridge === null) return;
  const outcome = await bridge.sendSpotifyCommand(command).catch(failure);
  if (outcome.kind !== "sent") {
    commandCount += 1;
    useMusicStore.setState({ result: outcome });
    return;
  }
  clearTimeout(readAfterCommandTimer);
  readAfterCommandTimer = setTimeout(() => void readMusicState(), READ_AFTER_COMMAND_MS);
}

export function sendMusicCommand(command: SpotifyCommand): void {
  showCommand(command);
  void sendShownCommand(command);
}

export function setMusicVolume(volume: number): void {
  const command = { type: "setVolume", volume } as const;
  showCommand(command);
  clearTimeout(volumeTimer);
  volumeTimer = setTimeout(() => void sendShownCommand(command), VOLUME_SEND_DELAY_MS);
}

export function setMusicPopupOpen(id: string, open: boolean): void {
  // A popup that a click opened returns focus to its own button.
  if (open) returnFocusTo = null;
  useMusicStore.setState((state) =>
    open ? { openId: id } : state.openId === id ? { openId: null } : state,
  );
}

const MUSIC_CONTROL_SELECTOR = "[data-music-control]";

/** The music button of the sidebar footer. A collapsed sidebar is inert and shows none. */
function shownMusicControlId(): string | null {
  const control = document.querySelector<HTMLElement>(MUSIC_CONTROL_SELECTOR);
  if (control == null || control.closest("[inert]") !== null) return null;
  return control.dataset.musicControl ?? null;
}

/** True when the music key has a popup to open or to close. */
export function musicKeyAvailable(): boolean {
  return useMusicStore.getState().openId !== null || shownMusicControlId() !== null;
}

/** The music key: opens the popup of the sidebar's music button, or closes the open popup. */
export function toggleMusicPopup(): void {
  if (useMusicStore.getState().openId !== null) {
    closedByKey = true;
    useMusicStore.setState({ openId: null });
    return;
  }
  const openId = shownMusicControlId();
  if (openId === null) return;
  const active = document.activeElement;
  returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null;
  useMusicStore.setState({ openId });
}

/**
 * Where focus goes when the popup closes: the place it was at when the key opened the popup.
 * Null gives the stock rule: the music button after a click, and no move after a press outside.
 */
export function takeMusicReturnFocus(escapeKey: boolean): HTMLElement | null {
  const target = closedByKey || escapeKey ? returnFocusTo : null;
  returnFocusTo = null;
  closedByKey = false;
  return target !== null && target.isConnected ? target : null;
}

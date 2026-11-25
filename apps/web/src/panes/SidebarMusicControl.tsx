import { useAtomValue } from "@effect/atom-react";
import {
  MusicIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
} from "lucide-react";
import { useEffect, useId } from "react";

import { Button } from "../components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../components/ui/popover";
import { SidebarMenuButton, SidebarMenuItem } from "../components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { shortcutLabelForCommand } from "../keybindings";
import { primaryServerKeybindingsAtom } from "../state/server";
import { musicBridge, musicHelp } from "./music";
import {
  readMusicState,
  sendMusicCommand,
  setMusicPopupOpen,
  setMusicVolume,
  takeMusicReturnFocus,
  useMusicStore,
} from "./musicStore";
import { useReadoutSettingsStore } from "./readoutSettings";

/** How often an open popup reads Spotify. A closed popup reads nothing. */
const MUSIC_REFRESH_MS = 5_000;
const PLAY_PAUSE_SELECTOR = "[data-music-play-pause]";

/**
 * The controls show after a read, so a popup can open with no play button: with the help line,
 * focus stays on the music button. Focus goes to play/pause when the controls show later.
 */
function focusPlayPauseWhenShown(button: HTMLButtonElement | null): void {
  const popup = button?.closest('[data-slot="popover-popup"]');
  if (button == null || popup == null) return;
  const active = document.activeElement;
  if (active === popup || !popup.contains(active)) button.focus({ preventScroll: true });
}

function MusicPopupContent() {
  const result = useMusicStore((state) => state.result);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the Spotify app through the desktop bridge while the popup is open, and stops when it closes
  useEffect(() => {
    void readMusicState();
    const timer = setInterval(() => {
      if (!document.hidden) void readMusicState();
    }, MUSIC_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (result?.kind !== "ok") {
    return (
      <p role="status" className="text-muted-foreground text-xs leading-snug">
        {musicHelp(result)}
      </p>
    );
  }
  const { playerState, track, volume } = result.playback;
  const playing = playerState === "playing";
  return (
    <div className="flex flex-col gap-2">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground text-sm">
          {track?.name || "No track"}
        </div>
        <div className="truncate text-muted-foreground text-xs">{track?.artist || "Spotify"}</div>
      </div>
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous track"
          onClick={() => sendMusicCommand({ type: "previous" })}
        >
          <SkipBackIcon aria-hidden="true" />
        </Button>
        <Button
          ref={focusPlayPauseWhenShown}
          variant="ghost"
          size="icon"
          aria-label={playing ? "Pause" : "Play"}
          data-music-play-pause=""
          onClick={() => sendMusicCommand({ type: "playpause" })}
        >
          {playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next track"
          onClick={() => sendMusicCommand({ type: "next" })}
        >
          <SkipForwardIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Volume2Icon aria-hidden="true" className="size-3.5 shrink-0" />
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          aria-label="Volume"
          className="h-4 min-w-0 flex-1 cursor-pointer accent-primary"
          onChange={(event) => setMusicVolume(event.currentTarget.valueAsNumber)}
        />
      </div>
    </div>
  );
}

function MusicControl() {
  const id = useId();
  const open = useMusicStore((state) => state.openId === id);
  const shortcutLabel = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "layout.toggleMusic",
  );
  return (
    <Popover open={open} onOpenChange={(next) => setMusicPopupOpen(id, next)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={<SidebarMenuButton aria-label="Music" size="icon" data-music-control={id} />}
            />
          }
        >
          <MusicIcon />
        </TooltipTrigger>
        <TooltipPopup side="top">Music{shortcutLabel ? ` · ${shortcutLabel}` : null}</TooltipPopup>
      </Tooltip>
      <PopoverPopup
        side="top"
        align="start"
        width="sm"
        padding="compact"
        aria-label="Music"
        // The controls show after the first read, so the popup can open with no play button.
        initialFocus={() => document.querySelector<HTMLElement>(PLAY_PAUSE_SELECTOR) ?? true}
        // After the key, focus returns to where it was. After a click, to the music button.
        finalFocus={(closeType) => takeMusicReturnFocus(closeType === "keyboard")}
      >
        <MusicPopupContent />
      </PopoverPopup>
    </Popover>
  );
}

/**
 * The music button of the sidebar footer, after the stock Usage button. It renders only in the
 * Mac app, which has the bridge to the Spotify app of its own machine, and only with the setting on.
 */
export function SidebarMusicControl() {
  const enabled = useReadoutSettingsStore((settings) => settings.showMusicControl);
  if (!enabled || musicBridge() === null) return null;
  return (
    <SidebarMenuItem className="shrink-0">
      <MusicControl />
    </SidebarMenuItem>
  );
}

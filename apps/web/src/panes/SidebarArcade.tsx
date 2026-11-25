import { Gamepad2Icon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "../lib/utils";
import {
  ARCADE_FIELD,
  RUNNER_ARCADE_GAME,
  SHOOTER_ARCADE_GAME,
  SNAKE_ARCADE_GAME,
  type ArcadeGame,
  type ArcadeKey,
  type ArcadeState,
} from "./arcadeGames";
import {
  readBestScores,
  useArcadeSettingsStore,
  writeBestScore,
  type ArcadeGameId,
} from "./arcadeStore";

const ARCADE_KEYS: Readonly<Record<string, ArcadeKey>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  " ": "fire",
};
const arcadeKeyOf = (key: string): ArcadeKey | undefined =>
  ARCADE_KEYS[key.length === 1 ? key.toLowerCase() : key];

function drawBoard<State extends ArcadeState>(
  canvas: HTMLCanvasElement,
  game: ArcadeGame<State>,
  state: State,
) {
  const context = canvas.getContext("2d");
  if (context === null) return;
  const scale = window.devicePixelRatio || 1;
  if (canvas.width !== ARCADE_FIELD.width * scale) {
    canvas.width = ARCADE_FIELD.width * scale;
    canvas.height = ARCADE_FIELD.height * scale;
  }
  const styles = getComputedStyle(canvas);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, ARCADE_FIELD.width, ARCADE_FIELD.height);
  game.draw(context, state, {
    // The canvas takes the action color of the theme as its text color.
    primary: styles.color,
    ink: token("--foreground", "#888888"),
    dim: token("--muted-foreground", "#888888"),
    danger: token("--error", "#e86b6b"),
  });
}

function ArcadeBoard<State extends ArcadeState>({ game }: { game: ArcadeGame<State> }) {
  const [state, setState] = useState(() => game.create(Math.random));
  const [best, setBest] = useState(() => readBestScores(window.localStorage)[game.id]);
  // The step timer and the key handlers read the newest state and the held keys here, so a key
  // press does not start the timer again.
  const stateRef = useRef(state);
  const heldRef = useRef(new Set<ArcadeKey>());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apply = (next: State) => {
    stateRef.current = next;
    setState(next);
  };
  const running = state.status === "running";

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the step timer of the game, which runs only while a game runs and the board has focus
  useEffect(() => {
    if (!running) return;
    let timer = 0;
    const step = () => {
      const next = game.step(stateRef.current, heldRef.current, Math.random);
      stateRef.current = next;
      setState(next);
      if (next.status === "running") {
        timer = window.setTimeout(step, game.stepMs(next));
        return;
      }
      setBest((known) => {
        if (next.score <= known) return known;
        writeBestScore(window.localStorage, game.id, next.score);
        return next.score;
      });
    };
    timer = window.setTimeout(step, game.stepMs(stateRef.current));
    return () => window.clearTimeout(timer);
  }, [running, game]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- paints the board on a canvas, which is outside React
  useEffect(() => {
    if (canvasRef.current !== null) drawBoard(canvasRef.current, game, state);
  }, [game, state]);

  const start = () => {
    const current = stateRef.current;
    apply({
      ...(current.status === "over" ? game.create(Math.random) : current),
      status: "running",
    });
  };
  const pause = () => {
    heldRef.current.clear();
    if (stateRef.current.status === "running") apply({ ...stateRef.current, status: "ready" });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = arcadeKeyOf(event.key);
    const status = stateRef.current.status;
    if (event.key === "Enter" || event.key.toLowerCase() === "p") {
      if (status === "running") pause();
      else start();
    } else if (event.key === "Escape") {
      event.currentTarget.blur();
    } else if (key === undefined) {
      return;
    } else if (status === "over") {
      // Only Space starts a new game, so a held arrow key does not skip "Game over".
      if (key === "fire" && !event.repeat) start();
    } else {
      heldRef.current.add(key);
      const current = { ...stateRef.current, status: "running" as const };
      apply(event.repeat ? current : game.press(current, key));
    }
    // The key belongs to the game: no page scroll, and no stock or sidebar key handler.
    event.preventDefault();
    event.stopPropagation();
  };
  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = arcadeKeyOf(event.key);
    if (key !== undefined) heldRef.current.delete(key);
  };

  const hint =
    state.status === "over"
      ? "Game over. Space or Enter for a new game"
      : state.status === "ready"
        ? game.hint
        : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        role="application"
        aria-label={`${game.label}. ${game.hint}. Enter or P starts and pauses.`}
        tabIndex={0}
        data-arcade-board={state.status}
        data-arcade-game={game.id}
        className="relative self-center rounded-sm border border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        style={{ width: ARCADE_FIELD.width + 2, height: ARCADE_FIELD.height + 2 }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={pause}
        onClick={(event) => {
          event.currentTarget.focus();
          if (stateRef.current.status !== "running") start();
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="block"
          style={{
            width: ARCADE_FIELD.width,
            height: ARCADE_FIELD.height,
            color: "var(--primary)",
          }}
        />
        {hint === null ? null : (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-center text-2xs text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      <span data-arcade-score className="self-end text-2xs text-muted-foreground tabular-nums">
        {state.score} · best {Math.max(best, state.score)}
      </span>
    </div>
  );
}

const GAME_TABS = [SNAKE_ARCADE_GAME, SHOOTER_ARCADE_GAME, RUNNER_ARCADE_GAME].map(
  ({ id, label }) => ({ id, label }),
);

/**
 * A small "Arcade" button at the bottom of the sidebar, which opens a game board above it.
 * It renders nothing with the setting off, which is the default.
 */
export function SidebarArcade() {
  const enabled = useArcadeSettingsStore((settings) => settings.showArcade);
  const [open, setOpen] = useState(false);
  const [gameId, setGameId] = useState<ArcadeGameId>("snake");
  if (!enabled) return null;
  return (
    <div
      data-sidebar-arcade={open ? "open" : "closed"}
      className="flex min-w-0 flex-col gap-1 px-2"
    >
      {open ? (
        <>
          <div role="tablist" aria-label="Game" className="flex items-center gap-2 text-2xs">
            {GAME_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === gameId}
                className={cn(
                  "cursor-pointer focus-visible:outline-2 focus-visible:outline-ring",
                  tab.id === gameId
                    ? "font-medium text-foreground underline underline-offset-2"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setGameId(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* One board for each game: a change of game starts from a new state. */}
          {gameId === "snake" ? <ArcadeBoard game={SNAKE_ARCADE_GAME} /> : null}
          {gameId === "shooter" ? <ArcadeBoard game={SHOOTER_ARCADE_GAME} /> : null}
          {gameId === "runner" ? <ArcadeBoard game={RUNNER_ARCADE_GAME} /> : null}
        </>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1 self-start text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen((current) => !current)}
      >
        <Gamepad2Icon aria-hidden className="size-3" />
        {open ? "Close the arcade" : "Arcade"}
      </button>
    </div>
  );
}

import type { ArcadeGameId } from "./arcadeStore";
import {
  createRunnerGame,
  RUNNER_GROUND_Y,
  RUNNER_ROLL_SIZE,
  RUNNER_SIZE,
  RUNNER_X,
  stepRunner,
  type RunnerGame,
} from "./runnerGame";
import {
  createShooterGame,
  ENEMY_HALF,
  enemyX,
  SHIP_HALF,
  SHIP_Y,
  stepShooter,
  type ShooterGame,
} from "./shooterGame";
import { createSnakeGame, snakeStepMs, stepSnake, turnSnake, type SnakeGame } from "./snakeGame";

/** Every game draws on a field of this size, in CSS pixels. */
export const ARCADE_FIELD = { width: 220, height: 140 } as const;
/** The tick of a game that moves all the time. */
const REAL_TIME_STEP_MS = 33;
const SNAKE_CELL_PX = 10;

export type ArcadeKey = "left" | "right" | "up" | "down" | "fire";

export interface ArcadeState {
  readonly score: number;
  readonly status: "ready" | "running" | "over";
}

/** Colors of the theme, read from the canvas. */
export interface ArcadePalette {
  readonly primary: string;
  readonly ink: string;
  readonly dim: string;
  readonly danger: string;
}

export interface ArcadeGame<State extends ArcadeState> {
  readonly id: ArcadeGameId;
  readonly label: string;
  /** Shown on the board before a game starts. */
  readonly hint: string;
  readonly create: (random: () => number) => State;
  /** One key press. A game that reads held keys only returns the state as it is. */
  readonly press: (state: State, key: ArcadeKey) => State;
  readonly step: (state: State, held: ReadonlySet<ArcadeKey>, random: () => number) => State;
  /** The time until the next step. */
  readonly stepMs: (state: State) => number;
  readonly draw: (context: CanvasRenderingContext2D, state: State, palette: ArcadePalette) => void;
}

export const SNAKE_ARCADE_GAME: ArcadeGame<SnakeGame> = {
  id: "snake",
  label: "Snake",
  hint: "Click, then use the arrow keys",
  create: (random) =>
    createSnakeGame(
      ARCADE_FIELD.width / SNAKE_CELL_PX,
      ARCADE_FIELD.height / SNAKE_CELL_PX,
      random,
    ),
  press: (state, key) => (key === "fire" ? state : turnSnake(state, key)),
  step: (state, _held, random) => stepSnake(state, random),
  stepMs: (state) => snakeStepMs(state.score),
  draw: (context, state, palette) => {
    const cell = SNAKE_CELL_PX;
    context.fillStyle = palette.danger;
    context.fillRect(state.food.x * cell + 2, state.food.y * cell + 2, cell - 4, cell - 4);
    context.fillStyle = palette.primary;
    for (const [index, part] of state.snake.entries()) {
      const inset = index === 0 ? 0 : 1;
      context.fillRect(
        part.x * cell + inset,
        part.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2,
      );
    }
  },
};

export const SHOOTER_ARCADE_GAME: ArcadeGame<ShooterGame> = {
  id: "shooter",
  label: "Shooter",
  hint: "Arrows move the ship. Space fires",
  create: () => createShooterGame(),
  press: (state) => state,
  step: (state, held, random) =>
    stepShooter(
      state,
      {
        left: held.has("left"),
        right: held.has("right"),
        fire: held.has("fire") || held.has("up"),
      },
      random,
    ),
  stepMs: () => REAL_TIME_STEP_MS,
  draw: (context, state, palette) => {
    context.fillStyle = palette.primary;
    context.beginPath();
    context.moveTo(state.shipX, SHIP_Y - SHIP_HALF);
    context.lineTo(state.shipX + SHIP_HALF, SHIP_Y + SHIP_HALF);
    context.lineTo(state.shipX - SHIP_HALF, SHIP_Y + SHIP_HALF);
    context.closePath();
    context.fill();
    for (const bullet of state.bullets) context.fillRect(bullet.x - 1, bullet.y - 3, 2, 6);
    // A life is a small square in the top left corner.
    for (let life = 0; life < state.lives; life += 1) context.fillRect(4 + life * 7, 4, 4, 4);
    context.fillStyle = palette.ink;
    for (const enemy of state.enemies) {
      const x = enemyX(enemy, state.tick);
      context.beginPath();
      context.moveTo(x, enemy.y - ENEMY_HALF);
      context.lineTo(x + ENEMY_HALF, enemy.y);
      context.lineTo(x, enemy.y + ENEMY_HALF);
      context.lineTo(x - ENEMY_HALF, enemy.y);
      context.closePath();
      context.fill();
    }
    context.fillStyle = palette.danger;
    for (const shot of state.shots) context.fillRect(shot.x - 1, shot.y - 2, 2, 4);
  },
};

export const RUNNER_ARCADE_GAME: ArcadeGame<RunnerGame> = {
  id: "runner",
  label: "Runner",
  hint: "Space jumps. Down or S rolls, and drops fast in the air",
  create: () => createRunnerGame(),
  press: (state) => state,
  step: (state, held, random) =>
    stepRunner(state, { jump: held.has("fire") || held.has("up"), down: held.has("down") }, random),
  stepMs: () => REAL_TIME_STEP_MS,
  draw: (context, state, palette) => {
    context.fillStyle = palette.dim;
    context.fillRect(0, RUNNER_GROUND_Y, ARCADE_FIELD.width, 1);
    context.fillStyle = palette.ink;
    for (const obstacle of state.obstacles) {
      context.fillRect(
        obstacle.x,
        RUNNER_GROUND_Y - obstacle.clearance - obstacle.height,
        obstacle.width,
        obstacle.height,
      );
    }
    context.fillStyle = palette.primary;
    const body = state.rolling ? RUNNER_ROLL_SIZE : RUNNER_SIZE;
    context.fillRect(RUNNER_X, RUNNER_GROUND_Y - state.height - body, RUNNER_SIZE, body);
  },
};

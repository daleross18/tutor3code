/**
 * An original endless runner: a block that jumps over low blocks and rolls under hanging bars,
 * which come faster and faster.
 */
export const RUNNER_FIELD = { width: 220, height: 140 } as const;
/** The ground line, as a y position of the field. */
export const RUNNER_GROUND_Y = 120;
export const RUNNER_X = 26;
export const RUNNER_SIZE = 10;
/** The height of the runner while it rolls. */
export const RUNNER_ROLL_SIZE = 5;
// A short jump with a fast return: about 23 pixels high and 13 ticks long.
const GRAVITY = 1.1;
const JUMP_SPEED = 6.6;
const FAST_FALL_SPEED = 9;
const START_SPEED = 3.4;
const MAX_SPEED = 8;
const DISTANCE_FOR_FULL_SPEED = 5500;
const DISTANCE_FOR_A_POINT = 25;
/** The free space under a bar: more than a rolling runner, less than a standing one. */
const BAR_CLEARANCE = 7;
/** No bar comes before this distance, so a new game starts with jumps only. */
const DISTANCE_BEFORE_BARS = 500;
const BAR_SHARE = 0.4;

export interface RunnerObstacle {
  readonly x: number;
  readonly width: number;
  readonly height: number;
  /** The free space between the ground and the obstacle. 0 for a block on the ground. */
  readonly clearance: number;
}

export interface RunnerKeys {
  readonly jump: boolean;
  /** In the air: fall fast. On the ground: roll. */
  readonly down: boolean;
}

export interface RunnerGame {
  /** How far the runner is above the ground. */
  readonly height: number;
  readonly velocity: number;
  readonly rolling: boolean;
  readonly obstacles: ReadonlyArray<RunnerObstacle>;
  readonly distance: number;
  /** The free ground after the last obstacle, before the next one comes. */
  readonly nextGap: number;
  readonly score: number;
  readonly status: "ready" | "running" | "over";
}

export function createRunnerGame(): RunnerGame {
  return {
    height: 0,
    velocity: 0,
    rolling: false,
    obstacles: [],
    distance: 0,
    nextGap: 90,
    score: 0,
    status: "ready",
  };
}

/** The ground speed in pixels for each tick. It grows with the distance, up to a limit. */
export function runnerSpeed(distance: number): number {
  const share = Math.min(1, distance / DISTANCE_FOR_FULL_SPEED);
  return START_SPEED + (MAX_SPEED - START_SPEED) * share;
}

function nextObstacle(distance: number, random: () => number): RunnerObstacle {
  const bar = distance >= DISTANCE_BEFORE_BARS && random() < BAR_SHARE;
  return bar
    ? {
        x: RUNNER_FIELD.width,
        width: 8 + Math.floor(random() * 7),
        // A bar hangs from the top of the field, so no jump goes over it.
        height: RUNNER_GROUND_Y - BAR_CLEARANCE,
        clearance: BAR_CLEARANCE,
      }
    : {
        x: RUNNER_FIELD.width,
        width: 6 + Math.floor(random() * 5),
        height: 7 + Math.floor(random() * 6),
        clearance: 0,
      };
}

/**
 * One tick of 33 ms. `jump` starts a jump only from the ground, so a held key jumps again at
 * each landing. `down` wins on the ground: the runner rolls and does not jump. A touch of an
 * obstacle ends the game. `random` is as `Math.random`.
 */
export function stepRunner(game: RunnerGame, keys: RunnerKeys, random: () => number): RunnerGame {
  if (game.status !== "running") return game;
  const speed = runnerSpeed(game.distance);
  const onGround = game.height === 0;
  const jumps = onGround && keys.jump && !keys.down;
  const startVelocity = jumps
    ? JUMP_SPEED
    : !onGround && keys.down
      ? Math.min(game.velocity, -FAST_FALL_SPEED)
      : game.velocity;
  const risen = game.height + startVelocity;
  const landed = risen <= 0;
  const height = landed ? 0 : risen;
  const velocity = landed ? 0 : startVelocity - GRAVITY;
  const rolling = landed && keys.down;
  const body = rolling ? RUNNER_ROLL_SIZE : RUNNER_SIZE;

  const moved = game.obstacles
    .map((obstacle) => ({ ...obstacle, x: obstacle.x - speed }))
    .filter((obstacle) => obstacle.x + obstacle.width > 0);
  const last = moved.at(-1);
  const freeGround =
    last === undefined ? RUNNER_FIELD.width : RUNNER_FIELD.width - (last.x + last.width);
  const spawns = freeGround >= game.nextGap;
  const obstacles = spawns ? [...moved, nextObstacle(game.distance, random)] : moved;
  const nextGap = spawns ? 60 + speed * 14 + random() * 70 : game.nextGap;

  const touches = obstacles.some(
    (obstacle) =>
      RUNNER_X < obstacle.x + obstacle.width &&
      RUNNER_X + RUNNER_SIZE > obstacle.x &&
      height < obstacle.clearance + obstacle.height &&
      height + body > obstacle.clearance,
  );
  const distance = game.distance + speed;
  return {
    height,
    velocity,
    rolling,
    obstacles,
    distance,
    nextGap,
    score: Math.floor(distance / DISTANCE_FOR_A_POINT),
    status: touches ? "over" : "running",
  };
}

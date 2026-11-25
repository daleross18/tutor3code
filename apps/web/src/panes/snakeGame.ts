export interface Cell {
  readonly x: number;
  readonly y: number;
}

export type SnakeDirection = "up" | "down" | "left" | "right";
export type SnakeStatus = "ready" | "running" | "over";

export interface SnakeGame {
  readonly cols: number;
  readonly rows: number;
  /** The head is the first cell. */
  readonly snake: ReadonlyArray<Cell>;
  readonly direction: SnakeDirection;
  /** Turns that wait for a step, so two quick key presses both count. */
  readonly turns: ReadonlyArray<SnakeDirection>;
  readonly food: Cell;
  readonly score: number;
  readonly status: SnakeStatus;
}

const STEP: Record<SnakeDirection, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<SnakeDirection, SnakeDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
const MAX_WAITING_TURNS = 2;

const sameCell = (first: Cell, second: Cell) => first.x === second.x && first.y === second.y;

/** A free cell for the food. `random` gives a number from 0 to below 1, as `Math.random` does. */
function placeFood(
  cols: number,
  rows: number,
  snake: ReadonlyArray<Cell>,
  random: () => number,
): Cell {
  const free: Cell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!snake.some((cell) => cell.x === x && cell.y === y)) free.push({ x, y });
    }
  }
  // A full board has no free cell. The game is then over at the next step.
  return free[Math.min(Math.floor(random() * free.length), free.length - 1)] ?? { x: -1, y: -1 };
}

/** A snake of three cells in the middle of the board, which moves to the right. */
export function createSnakeGame(cols: number, rows: number, random: () => number): SnakeGame {
  const y = Math.floor(rows / 2);
  const headX = Math.floor(cols / 2);
  const snake = [0, 1, 2].map((offset) => ({ x: headX - offset, y }));
  return {
    cols,
    rows,
    snake,
    direction: "right",
    turns: [],
    food: placeFood(cols, rows, snake, random),
    score: 0,
    status: "ready",
  };
}

/** Queues a turn. A turn back onto the neck, or the same turn again, is not taken. */
export function turnSnake(game: SnakeGame, direction: SnakeDirection): SnakeGame {
  const last = game.turns.at(-1) ?? game.direction;
  if (direction === last || direction === OPPOSITE[last]) return game;
  if (game.turns.length >= MAX_WAITING_TURNS) return game;
  return { ...game, turns: [...game.turns, direction] };
}

/** One move. A wall or the body ends the game. Food makes the snake one cell longer. */
export function stepSnake(game: SnakeGame, random: () => number): SnakeGame {
  if (game.status !== "running") return game;
  const [turn, ...turns] = game.turns;
  const direction = turn ?? game.direction;
  const head = game.snake[0]!;
  const next = { x: head.x + STEP[direction].x, y: head.y + STEP[direction].y };
  const eats = sameCell(next, game.food);
  // The tail cell is free in this move, unless the snake grows.
  const body = eats ? game.snake : game.snake.slice(0, -1);
  const outside = next.x < 0 || next.y < 0 || next.x >= game.cols || next.y >= game.rows;
  if (outside || body.some((cell) => sameCell(cell, next))) {
    return { ...game, direction, turns: [], status: "over" };
  }
  const snake = [next, ...body];
  return {
    ...game,
    snake,
    direction,
    turns,
    food: eats ? placeFood(game.cols, game.rows, snake, random) : game.food,
    score: eats ? game.score + 1 : game.score,
  };
}

/** The time of one move. The snake is faster with each five points, down to a floor. */
export function snakeStepMs(score: number): number {
  return Math.max(70, 140 - Math.floor(score / 5) * 10);
}

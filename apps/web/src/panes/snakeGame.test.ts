import { describe, expect, it } from "vite-plus/test";

import { createSnakeGame, snakeStepMs, stepSnake, turnSnake, type SnakeGame } from "./snakeGame";

const first = () => 0;
const running = (game: SnakeGame): SnakeGame => ({ ...game, status: "running" });
const board = (overrides: Partial<SnakeGame>): SnakeGame =>
  running({ ...createSnakeGame(6, 4, first), food: { x: 5, y: 3 }, ...overrides });

describe("snakeGame", () => {
  it("starts with three cells in the middle, a free food cell, and does not move before it runs", () => {
    const game = createSnakeGame(6, 4, first);
    expect(game.snake).toEqual([
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ]);
    expect(game.food).toEqual({ x: 0, y: 0 });
    expect(stepSnake(game, first)).toBe(game);
  });

  it("moves one cell for each step and keeps its length", () => {
    const next = stepSnake(board({}), first);
    expect(next.snake).toEqual([
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
    ]);
    expect(next.score).toBe(0);
  });

  it("grows by one cell on food, counts the point and puts new food on a free cell", () => {
    const next = stepSnake(board({ food: { x: 4, y: 2 } }), first);
    expect(next.snake).toHaveLength(4);
    expect(next.score).toBe(1);
    expect(next.food).toEqual({ x: 0, y: 0 });
    expect(next.snake).not.toContainEqual(next.food);
  });

  it("takes two quick turns in order, and refuses a turn back onto its neck", () => {
    const turned = turnSnake(turnSnake(board({}), "up"), "left");
    expect(turned.turns).toEqual(["up", "left"]);
    expect(turnSnake(board({}), "left").turns).toEqual([]);
    expect(turnSnake(turned, "right").turns).toEqual(["up", "left"]);
    const afterFirst = stepSnake(turned, first);
    expect(afterFirst.snake[0]).toEqual({ x: 3, y: 1 });
    expect(stepSnake(afterFirst, first).snake[0]).toEqual({ x: 2, y: 1 });
  });

  it.each([
    [
      "a wall",
      board({
        snake: [
          { x: 5, y: 2 },
          { x: 4, y: 2 },
          { x: 3, y: 2 },
        ],
      }),
    ],
    [
      "its own body",
      board({
        snake: [
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 2 },
          { x: 3, y: 1 },
          { x: 3, y: 0 },
        ],
        direction: "up",
        turns: ["right"],
      }),
    ],
  ])("ends at %s", (_name, game) => {
    expect(stepSnake(game, first).status).toBe("over");
  });

  it("may move into the cell that its tail leaves in the same step", () => {
    const square = board({
      snake: [
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 1 },
      ],
      direction: "up",
      turns: ["right"],
    });
    expect(stepSnake(square, first).status).toBe("running");
  });

  it("is faster with more points, down to a floor", () => {
    expect(snakeStepMs(0)).toBe(140);
    expect(snakeStepMs(10)).toBe(120);
    expect(snakeStepMs(500)).toBe(70);
  });
});

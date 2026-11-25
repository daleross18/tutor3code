import { describe, expect, it } from "vite-plus/test";

import {
  createRunnerGame,
  RUNNER_FIELD,
  RUNNER_X,
  runnerSpeed,
  stepRunner,
  type RunnerGame,
  type RunnerKeys,
} from "./runnerGame";

const half = () => 0.5;
const NONE: RunnerKeys = { jump: false, down: false };
const JUMP: RunnerKeys = { jump: true, down: false };
const DOWN: RunnerKeys = { jump: false, down: true };
const running = (overrides: Partial<RunnerGame> = {}): RunnerGame => ({
  ...createRunnerGame(),
  status: "running",
  nextGap: 100_000,
  ...overrides,
});
/** How many ticks a jump lasts, and how high it goes, with `keys` held after the first tick. */
function jumpWith(keys: RunnerKeys) {
  let game = stepRunner(running(), JUMP, half);
  let top = game.height;
  let ticks = 1;
  while (game.height > 0) {
    game = stepRunner(game, keys, half);
    top = Math.max(top, game.height);
    ticks += 1;
  }
  return { game, top, ticks };
}
const block = { x: RUNNER_X + 12, width: 10, height: 12, clearance: 0 };
const bar = { x: RUNNER_X + 12, width: 14, height: 113, clearance: 7 };

describe("runnerGame", () => {
  it("does not move before it runs", () => {
    const game = createRunnerGame();
    expect(stepRunner(game, JUMP, half)).toBe(game);
  });

  it("jumps low and short, from the ground only, and again while the key is held", () => {
    const first = stepRunner(running(), JUMP, half);
    // The held key gives no second push in the air.
    expect(stepRunner(first, JUMP, half).velocity).toBeLessThan(first.velocity);
    const { game, top, ticks } = jumpWith(JUMP);
    expect(top).toBeGreaterThan(18);
    expect(top).toBeLessThan(28);
    expect(ticks).toBeLessThan(16);
    expect(stepRunner(game, JUMP, half).height).toBeGreaterThan(0);
    expect(stepRunner(game, NONE, half).height).toBe(0);
  });

  it("falls fast with the down key, and rolls from the landing while the key is held", () => {
    const { game, ticks } = jumpWith(DOWN);
    expect(ticks).toBeLessThan(jumpWith(NONE).ticks / 2);
    expect(game.rolling).toBe(true);
    // The down key wins over the jump key on the ground.
    expect(stepRunner(game, { jump: true, down: true }, half)).toMatchObject({
      height: 0,
      rolling: true,
    });
    expect(stepRunner(game, NONE, half).rolling).toBe(false);
  });

  it("sends a block from the right edge when the free ground is long enough", () => {
    const next = stepRunner(running({ nextGap: 90 }), NONE, half);
    expect(next.obstacles).toEqual([{ x: RUNNER_FIELD.width, width: 8, height: 10, clearance: 0 }]);
    expect(next.nextGap).toBeGreaterThan(90);
    // The next obstacle waits for its gap.
    expect(stepRunner(next, NONE, half).obstacles).toHaveLength(1);
  });

  it("sends bars only after the first part of a run", () => {
    const low = () => 0.1;
    expect(stepRunner(running({ nextGap: 90 }), NONE, low).obstacles[0]?.clearance).toBe(0);
    const later = stepRunner(running({ nextGap: 90, distance: 600 }), NONE, low);
    expect(later.obstacles[0]?.clearance).toBeGreaterThan(0);
  });

  it("ends at a touch of a block, and passes over it in a jump", () => {
    expect(stepRunner(running({ obstacles: [block] }), NONE, half).status).toBe("over");
    expect(stepRunner(running({ obstacles: [block] }), DOWN, half).status).toBe("over");
    const inTheAir = running({ obstacles: [block], height: 20, velocity: 1 });
    expect(stepRunner(inTheAir, NONE, half).status).toBe("running");
  });

  it("passes under a bar only in a roll", () => {
    expect(stepRunner(running({ obstacles: [bar] }), DOWN, half).status).toBe("running");
    expect(stepRunner(running({ obstacles: [bar] }), NONE, half).status).toBe("over");
    const inTheAir = running({ obstacles: [bar], height: 20, velocity: 1 });
    expect(stepRunner(inTheAir, NONE, half).status).toBe("over");
  });

  it.each([
    ["the start speed", 0],
    ["the top speed", 100_000],
  ])("the highest and widest block can be cleared at %s", (_name, distance) => {
    const speed = runnerSpeed(distance);
    let game = running({
      distance,
      // The jump starts three ticks before the block reaches the runner.
      obstacles: [{ x: RUNNER_X + 10 + speed * 3, width: 10, height: 12, clearance: 0 }],
    });
    for (let tick = 0; tick < 40 && game.status === "running"; tick += 1) {
      game = stepRunner(game, tick === 0 ? JUMP : NONE, half);
    }
    expect(game.status).toBe("running");
    expect(game.obstacles).toHaveLength(0);
  });

  it("counts the distance as points, and runs faster with the distance up to a limit", () => {
    let game = running();
    for (let tick = 0; tick < 100; tick += 1) game = stepRunner(game, NONE, half);
    expect(game.score).toBe(Math.floor(game.distance / 25));
    expect(game.score).toBeGreaterThan(5);
    expect(runnerSpeed(1000)).toBeGreaterThan(runnerSpeed(0));
    expect(runnerSpeed(3000)).toBeGreaterThan(runnerSpeed(1000));
    expect(runnerSpeed(1_000_000)).toBe(8);
  });
});

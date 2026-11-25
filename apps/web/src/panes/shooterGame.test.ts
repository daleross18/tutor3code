import { describe, expect, it } from "vite-plus/test";

import {
  createShooterGame,
  enemyX,
  SHIP_Y,
  SHOOTER_FIELD,
  shooterSpawnTicks,
  stepShooter,
  type ShooterEnemy,
  type ShooterGame,
} from "./shooterGame";

const IDLE = { left: false, right: false, fire: false };
// 0.5 puts a new enemy in the middle, and is above the chance of an enemy shot.
const half = () => 0.5;
const running = (overrides: Partial<ShooterGame> = {}): ShooterGame => ({
  ...createShooterGame(),
  status: "running",
  spawnIn: 1000,
  ...overrides,
});
/** An enemy that moves straight down. */
const enemy = (originX: number, y: number, speed = 1): ShooterEnemy => ({
  originX,
  y,
  phase: 0,
  sway: 0,
  speed,
});

describe("shooterGame", () => {
  it("does not move before it runs", () => {
    const game = createShooterGame();
    expect(stepShooter(game, { ...IDLE, fire: true }, half)).toBe(game);
  });

  it("moves the ship with the held keys and stops at the walls", () => {
    let game = running();
    for (let tick = 0; tick < 60; tick += 1)
      game = stepShooter(game, { ...IDLE, left: true }, half);
    expect(game.shipX).toBe(6);
    for (let tick = 0; tick < 200; tick += 1) {
      game = stepShooter(game, { ...IDLE, right: true }, half);
    }
    expect(game.shipX).toBe(SHOOTER_FIELD.width - 6);
  });

  it("fires one bullet for each cooldown while the fire key is held", () => {
    let game = running();
    let fired = 0;
    for (let tick = 0; tick < 21; tick += 1) {
      const before = game.cooldown;
      game = stepShooter(game, { ...IDLE, fire: true }, half);
      if (game.cooldown > before) fired += 1;
    }
    expect(fired).toBe(3);
    expect(game.bullets.length).toBeGreaterThan(0);
    expect(game.bullets.every((bullet) => bullet.y < SHIP_Y)).toBe(true);
  });

  it("a bullet removes one enemy, gives one point and is spent", () => {
    const game = running({
      bullets: [{ x: 100, y: 60 }],
      enemies: [enemy(100, 54), enemy(100, 20)],
    });
    const next = stepShooter(game, IDLE, half);
    expect(next.score).toBe(1);
    expect(next.enemies).toHaveLength(1);
    expect(next.bullets).toHaveLength(0);
    expect(next.lives).toBe(3);
  });

  it.each([
    ["an enemy touches the ship", { enemies: [enemy(110, SHIP_Y - 2)] }],
    ["an enemy passes the bottom", { enemies: [enemy(30, SHOOTER_FIELD.height + 5)] }],
    ["a shot of an enemy hits the ship", { shots: [{ x: 110, y: SHIP_Y - 3 }] }],
  ])("the ship loses a life when %s", (_name, overrides) => {
    const next = stepShooter(running(overrides), IDLE, half);
    expect(next.lives).toBe(2);
    expect(next.enemies).toHaveLength(0);
    expect(next.shots).toHaveLength(0);
    expect(next.status).toBe("running");
  });

  it("is over with the last life", () => {
    const next = stepShooter(running({ lives: 1, shots: [{ x: 110, y: SHIP_Y - 3 }] }), IDLE, half);
    expect(next).toMatchObject({ lives: 0, status: "over" });
  });

  it("sends a new enemy from the top when the spawn count ends, and sooner with more points", () => {
    const next = stepShooter(running({ spawnIn: 1 }), IDLE, half);
    expect(next.enemies).toHaveLength(1);
    expect(next.enemies[0]!.y).toBeLessThan(0);
    expect(next.spawnIn).toBe(shooterSpawnTicks(0));
    expect(shooterSpawnTicks(40)).toBeLessThan(shooterSpawnTicks(0));
    expect(shooterSpawnTicks(1000)).toBe(10);
  });

  it("an enemy in the upper part of the field shoots down when the chance says so", () => {
    const next = stepShooter(running({ enemies: [enemy(60, 40)] }), IDLE, () => 0);
    expect(next.shots).toHaveLength(1);
    expect(next.shots[0]!.y).toBeGreaterThan(40);
  });

  it("keeps a swaying enemy inside the field", () => {
    const wide: ShooterEnemy = { originX: 4, y: 10, phase: 0, sway: 60, speed: 1 };
    for (let tick = 0; tick < 200; tick += 7) {
      expect(enemyX(wide, tick)).toBeGreaterThanOrEqual(5);
      expect(enemyX(wide, tick)).toBeLessThanOrEqual(SHOOTER_FIELD.width - 5);
    }
  });
});

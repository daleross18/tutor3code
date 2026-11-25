/** An original fixed shooter: a ship at the bottom, and enemies that sway down from the top. */
export const SHOOTER_FIELD = { width: 220, height: 140 } as const;
export const SHIP_Y = 128;
export const SHIP_HALF = 6;
export const ENEMY_HALF = 5;
const SHIP_SPEED = 3.2;
const BULLET_SPEED = 5;
const SHOT_SPEED = 2.4;
const FIRE_COOLDOWN_TICKS = 7;
const SWAY_RATE = 0.07;
const ENEMY_FIRE_CHANCE = 0.006;
const ENEMY_FIRE_ABOVE_Y = 90;
const START_LIVES = 3;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ShooterEnemy {
  readonly originX: number;
  readonly y: number;
  readonly phase: number;
  readonly sway: number;
  readonly speed: number;
}

export interface ShooterGame {
  readonly shipX: number;
  /** Shots of the ship, which move up. */
  readonly bullets: ReadonlyArray<Point>;
  readonly enemies: ReadonlyArray<ShooterEnemy>;
  /** Shots of the enemies, which move down. */
  readonly shots: ReadonlyArray<Point>;
  readonly cooldown: number;
  readonly spawnIn: number;
  readonly tick: number;
  readonly lives: number;
  readonly score: number;
  readonly status: "ready" | "running" | "over";
}

export interface ShooterInput {
  readonly left: boolean;
  readonly right: boolean;
  readonly fire: boolean;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export function enemyX(enemy: ShooterEnemy, tick: number): number {
  const x = enemy.originX + enemy.sway * Math.sin(enemy.phase + tick * SWAY_RATE);
  return clamp(x, ENEMY_HALF, SHOOTER_FIELD.width - ENEMY_HALF);
}

/** Enemies come faster with more points, down to a floor. */
export function shooterSpawnTicks(score: number): number {
  return Math.max(10, 34 - Math.floor(score / 4));
}

export function createShooterGame(): ShooterGame {
  return {
    shipX: SHOOTER_FIELD.width / 2,
    bullets: [],
    enemies: [],
    shots: [],
    cooldown: 0,
    spawnIn: 12,
    tick: 0,
    lives: START_LIVES,
    score: 0,
    status: "ready",
  };
}

const near = (first: Point, second: Point, reach: number) =>
  Math.abs(first.x - second.x) <= reach && Math.abs(first.y - second.y) <= reach;

/**
 * One tick of 33 ms. A hit enemy gives one point. The ship loses a life when a shot or an
 * enemy touches it, and when an enemy passes the bottom. `random` is as `Math.random`.
 */
export function stepShooter(
  game: ShooterGame,
  input: ShooterInput,
  random: () => number,
): ShooterGame {
  if (game.status !== "running") return game;
  const tick = game.tick + 1;
  const move = (input.right ? SHIP_SPEED : 0) - (input.left ? SHIP_SPEED : 0);
  const shipX = clamp(game.shipX + move, SHIP_HALF, SHOOTER_FIELD.width - SHIP_HALF);
  const ship = { x: shipX, y: SHIP_Y };

  const fires = input.fire && game.cooldown <= 0;
  const cooldown = fires ? FIRE_COOLDOWN_TICKS : Math.max(game.cooldown - 1, 0);
  const movedBullets = [...game.bullets, ...(fires ? [{ x: shipX, y: SHIP_Y - SHIP_HALF }] : [])]
    .map((bullet) => ({ x: bullet.x, y: bullet.y - BULLET_SPEED }))
    .filter((bullet) => bullet.y > -4);

  const spawns = game.spawnIn <= 1;
  const spawned: ReadonlyArray<ShooterEnemy> = spawns
    ? [
        {
          originX: 20 + random() * (SHOOTER_FIELD.width - 40),
          y: -ENEMY_HALF,
          phase: random() * Math.PI * 2,
          sway: 8 + random() * 26,
          speed: 0.5 + Math.min(1, game.score / 60) + random() * 0.3,
        },
      ]
    : [];
  const movedEnemies = [...game.enemies, ...spawned].map((enemy) => ({
    ...enemy,
    y: enemy.y + enemy.speed,
  }));
  const newShots = movedEnemies
    .filter((enemy) => enemy.y > 0 && enemy.y < ENEMY_FIRE_ABOVE_Y && random() < ENEMY_FIRE_CHANCE)
    .map((enemy) => ({ x: enemyX(enemy, tick), y: enemy.y + ENEMY_HALF }));
  const movedShots = [...game.shots, ...newShots]
    .map((shot) => ({ x: shot.x, y: shot.y + SHOT_SPEED }))
    .filter((shot) => shot.y < SHOOTER_FIELD.height + 4);

  // Each bullet stops at most one enemy.
  const spent = new Set<Point>();
  const hit = new Set<ShooterEnemy>();
  for (const enemy of movedEnemies) {
    const position = { x: enemyX(enemy, tick), y: enemy.y };
    const bullet = movedBullets.find(
      (candidate) => !spent.has(candidate) && near(candidate, position, ENEMY_HALF + 1),
    );
    if (bullet === undefined) continue;
    spent.add(bullet);
    hit.add(enemy);
  }
  const alive = movedEnemies.filter((enemy) => !hit.has(enemy));
  const reached = alive.filter(
    (enemy) =>
      enemy.y > SHOOTER_FIELD.height + ENEMY_HALF ||
      near({ x: enemyX(enemy, tick), y: enemy.y }, ship, ENEMY_HALF + SHIP_HALF - 2),
  );
  const shotsThatHit = movedShots.filter((shot) => near(shot, ship, SHIP_HALF));
  const lives = game.lives - reached.length - shotsThatHit.length;

  return {
    shipX,
    bullets: movedBullets.filter((bullet) => !spent.has(bullet)),
    enemies: alive.filter((enemy) => !reached.includes(enemy)),
    shots: movedShots.filter((shot) => !shotsThatHit.includes(shot)),
    cooldown,
    spawnIn: spawns ? shooterSpawnTicks(game.score) : game.spawnIn - 1,
    tick,
    lives: Math.max(lives, 0),
    score: game.score + hit.size,
    status: lives <= 0 ? "over" : "running",
  };
}

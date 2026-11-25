import { RunId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { finishedTurnWorkedTime, formatWorkedTime, type WorkedTimeProjection } from "./workedTime";

type Run = WorkedTimeProjection["runs"][number];

/** A time of 2026-11-19, as minutes and seconds after 16:00 UTC. */
const at = (minutes: number, seconds = 0) =>
  DateTime.makeUnsafe(Date.UTC(2026, 10, 19, 16) + minutes * 60_000 + seconds * 1_000);
const ms = (minutes: number, seconds = 0) => DateTime.toEpochMillis(at(minutes, seconds));

/** A run that started at `start` and ended at `end`, both as [minutes, seconds]. */
function run(
  name: string,
  start: readonly [number, number?] | null,
  end: readonly [number, number?] | null,
  extra: Partial<Run> = {},
): Run {
  return {
    id: RunId.make(name),
    ordinal: 1,
    status: end === null ? "running" : "completed",
    requestedAt: at(...(start ?? [0])),
    startedAt: start === null ? null : at(...start),
    completedAt: end === null ? null : at(...end),
    ...extra,
  };
}

const wake = (runId: string, pullRequest: boolean): WorkedTimeProjection["turnItems"][number] => ({
  type: "notification",
  runId: RunId.make(runId),
  source: { kind: "monitor", ...(pullRequest ? { pullRequest: {} as never } : {}) },
});

const worked = (
  runs: ReadonlyArray<Run>,
  runId: string,
  turnItems: WorkedTimeProjection["turnItems"] = [],
) => finishedTurnWorkedTime({ runs, turnItems }, RunId.make(runId));

describe("finishedTurnWorkedTime", () => {
  it("is the time from the start of the run to its end, the last value of the stock label", () => {
    expect(worked([run("a", [17, 0], [49, 16.9])], "a")).toEqual({
      durationMs: 32 * 60_000 + 16_900,
      startedAtMs: ms(17),
      runCount: 1,
    });
  });

  it.each([
    ["a turn that still runs", run("a", [0], null)],
    ["a turn that waits", run("a", [0], [5], { status: "waiting" })],
    ["a turn below the threshold of 10 seconds", run("a", [0], [0, 9.9])],
    ["a run that ended before it started", run("a", null, [6], { status: "cancelled" })],
  ])("is null for %s", (_name, only) => {
    expect(worked([only], "a")).toBeNull();
  });

  it("is null with no thread detail, with no run id and for a run that the client does not hold", () => {
    expect(finishedTurnWorkedTime(null, RunId.make("a"))).toBeNull();
    expect(finishedTurnWorkedTime({ runs: [run("a", [0], [5])], turnItems: [] }, null)).toBeNull();
    expect(worked([run("a", [0], [5])], "b")).toBeNull();
  });

  it.each(["interrupted", "failed", "cancelled"] as const)("shows for a turn that %s", (status) => {
    expect(worked([run("a", [0], [3], { status })], "a")?.durationMs).toBe(3 * 60_000);
  });

  it("adds the runs that a manual continue and a usage limit continue, without the waits", () => {
    const runs = [
      run("first", [0], [10], { status: "failed" }),
      // The quota came back three hours later.
      run("second", [190], [200], {
        status: "interrupted",
        usageLimitContinuationOfRunId: RunId.make("first"),
      }),
      run("third", [205], [206], { manualContinuationOfRunId: RunId.make("second") }),
    ];
    expect(worked(runs, "third")).toEqual({
      durationMs: 21 * 60_000,
      startedAtMs: ms(0),
      runCount: 3,
    });
    // The number shows one time, at the end of the turn.
    expect(worked(runs, "first")).toBeNull();
    expect(worked(runs, "second")).toBeNull();
  });

  it("counts a run after a restart from the start of the run before it, as the stock label does", () => {
    const runs = [
      run("first", [0], [10], { status: "interrupted" }),
      run("second", [11], [20], {
        restartContinuationOfRunId: RunId.make("first"),
        workStartedAt: at(0),
      }),
    ];
    // 20 minutes, not 10 + 20: the two times overlap.
    expect(worked(runs, "second")).toEqual({
      durationMs: 20 * 60_000,
      startedAtMs: ms(0),
      runCount: 2,
    });
  });

  it("shows no number for a run while its continuation waits or runs", () => {
    const first = run("first", [0], [10], { status: "failed" });
    const link = { usageLimitContinuationOfRunId: RunId.make("first") };
    expect(
      worked([first, run("next", null, null, { ...link, status: "queued" })], "first"),
    ).toBeNull();
    expect(worked([first, run("next", [20], null, link)], "next")).toBeNull();
    // A continuation that was cancelled before it started continues nothing.
    const cancelled = run("next", null, [15], { ...link, status: "cancelled", startedAt: null });
    expect(worked([first, cancelled], "first")?.durationMs).toBe(10 * 60_000);
  });

  it("counts the wake of a background task from the start of the work, as the stock label does", () => {
    const runs = [run("first", [0], [10]), run("wake", [30], [31], { workStartedAt: at(0) })];
    expect(worked(runs, "first")?.durationMs).toBe(10 * 60_000);
    expect(worked(runs, "wake", [wake("wake", false)])).toEqual({
      durationMs: 31 * 60_000,
      startedAtMs: ms(0),
      runCount: 1,
    });
  });

  it("starts new work at the wake of a pull request watch, and for the wakes after it", () => {
    const runs = [
      run("first", [0], [10]),
      run("watch", [240], [242], { workStartedAt: at(0) }),
      // The server gives each later wake the start of the first run again.
      run("command", [245], [246], { workStartedAt: at(0) }),
    ];
    const items = [wake("watch", true), wake("command", false)];
    expect(worked(runs, "watch", items)?.durationMs).toBe(2 * 60_000);
    expect(worked(runs, "command", items)).toEqual({
      durationMs: 6 * 60_000,
      startedAtMs: ms(240),
      runCount: 1,
    });
  });
});

describe("formatWorkedTime", () => {
  it.each([
    [10_000, "10s"],
    [59_999, "59s"],
    [60_000, "1m 0s"],
    [32 * 60_000 + 16_900, "32m 16s"],
    [3_600_000 + 2 * 60_000 + 5_000, "1h 2m 5s"],
  ])("writes %i ms as the stock label does: %s", (durationMs, text) => {
    expect(formatWorkedTime(durationMs)).toBe(text);
  });
});

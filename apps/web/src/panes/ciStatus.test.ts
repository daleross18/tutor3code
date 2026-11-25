import type { PullRequestCheck } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createLaneClock,
  createSharedInterval,
  deriveCiStatus,
  formatLaneElapsed,
  laneRunningSince,
  observeRunningLanes,
} from "./ciStatus";

const MINUTE = 60_000;
const check = (name: string, status: PullRequestCheck["status"]): PullRequestCheck => ({
  name,
  status,
  description: null,
  url: null,
});
const base = {
  checksState: "pending" as const,
  watchFailedNames: [],
  autoMergeEnabled: undefined,
  autoMergeMethod: undefined,
  runningSince: () => null,
  nowMs: 100 * MINUTE,
};

describe("deriveCiStatus", () => {
  it("shows the lane that runs for the longest time, with its time and the count of the others", () => {
    const since: Record<string, number> = { build: 97 * MINUTE, test: 93 * MINUTE };
    const view = deriveCiStatus({
      ...base,
      checks: [check("lint", "success"), check("build", "pending"), check("test", "pending")],
      runningSince: (name) => since[name] ?? null,
    });
    expect(view).toMatchObject({
      tone: "running",
      label: "test 7m +1",
      elapsed: "7m",
      autoMerge: false,
    });
    expect(view.details).toEqual(["Running (time since this app saw it): test 7m, build 3m"]);
  });

  it("puts a failed lane before a running lane, and counts a cancelled lane as failed", () => {
    const view = deriveCiStatus({
      ...base,
      checksState: "failing",
      checks: [check("e2e", "failure"), check("deploy", "cancelled"), check("build", "pending")],
    });
    expect(view).toMatchObject({ tone: "failed", label: "e2e +1" });
    expect(view.details[0]).toBe("Failed: e2e, deploy");
  });

  it.each([
    ["no list of lanes yet, CI runs", { checksState: "pending", checks: null }, "running", "CI"],
    [
      "no list of lanes yet, the watch names the failed lane",
      { checksState: "failing", checks: null, watchFailedNames: ["lint"] },
      "failed",
      "lint",
    ],
    [
      "no list of lanes and no watch",
      { checksState: "failing", checks: null },
      "failed",
      "CI failed",
    ],
    [
      "a lane waits for an approval",
      { checks: [check("deploy", "action-required")] },
      "approval",
      "deploy",
    ],
    [
      "every lane passed",
      { checksState: "passing", checks: [check("lint", "success"), check("docs", "skipped")] },
      null,
      null,
    ],
    [
      "a stand-in for lanes that the host did not list is no lane",
      { checksState: "passing", checks: [{ ...check("hidden", "pending"), placeholder: true }] },
      null,
      null,
    ],
  ] as const)("%s", (_name, input, tone, label) => {
    expect(deriveCiStatus({ ...base, ...input })).toMatchObject({ tone, label });
  });

  it("marks auto-merge when the host reports it on, and says nothing when the host did not report it", () => {
    const passed = { ...base, checksState: "passing" as const, checks: [check("lint", "success")] };
    expect(
      deriveCiStatus({ ...passed, autoMergeEnabled: true, autoMergeMethod: "squash" }),
    ).toEqual({
      tone: null,
      label: null,
      elapsed: null,
      autoMerge: true,
      details: ["Auto-merge is on (squash)"],
    });
    expect(deriveCiStatus({ ...passed, autoMergeEnabled: false }).details).toEqual([
      "Auto-merge is off",
    ]);
    expect(deriveCiStatus(passed)).toEqual({
      tone: null,
      label: null,
      elapsed: null,
      autoMerge: false,
      details: [],
    });
  });
});

describe("observeRunningLanes", () => {
  it("keeps the first sight of a lane, drops a lane that ended, and starts again for a new head commit", () => {
    const clock = createLaneClock();
    observeRunningLanes(clock, "pr", "sha1", ["build", "test"], 1000);
    observeRunningLanes(clock, "pr", "sha1", ["build"], 5000);
    expect(laneRunningSince(clock, "pr", "build")).toBe(1000);
    expect(laneRunningSince(clock, "pr", "test")).toBeNull();
    // The same lane runs again later on the same commit: a new run.
    observeRunningLanes(clock, "pr", "sha1", ["build", "test"], 9000);
    expect(laneRunningSince(clock, "pr", "test")).toBe(9000);
    observeRunningLanes(clock, "pr", "sha2", ["build"], 20_000);
    expect(laneRunningSince(clock, "pr", "build")).toBe(20_000);
    expect(laneRunningSince(clock, "other", "build")).toBeNull();
    observeRunningLanes(clock, "pr", "sha2", [], 30_000);
    expect(clock.pulls.size).toBe(0);
  });
});

it.each([
  [0, "<1m"],
  [59_999, "<1m"],
  [7 * MINUTE, "7m"],
  [65 * MINUTE, "1h 05m"],
  [-5000, "<1m"],
])("formatLaneElapsed(%i) is %s", (elapsedMs, text) => {
  expect(formatLaneElapsed(elapsedMs)).toBe(text);
});

describe("createSharedInterval", () => {
  it("runs one timer for each key however many users ask, and stops it when the last user leaves", () => {
    vi.useFakeTimers();
    using _timers = { [Symbol.dispose]: () => void vi.useRealTimers() };
    const share = createSharedInterval(60_000);
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();
    const leaveFirst = share("pr-1", first);
    const leaveSecond = share("pr-1", second);
    const leaveOther = share("pr-2", other);

    vi.advanceTimersByTime(60_000);
    // One request for the pull request that two users show, not two.
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
    expect(other).toHaveBeenCalledTimes(1);

    leaveFirst();
    // A second call of the same leave must not take the place of the other user.
    leaveFirst();
    vi.advanceTimersByTime(60_000);
    expect(first.mock.calls.length + second.mock.calls.length).toBe(2);

    leaveSecond();
    leaveOther();
    vi.advanceTimersByTime(120_000);
    expect(first.mock.calls.length + second.mock.calls.length).toBe(2);
    expect(other).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

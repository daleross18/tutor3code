import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import {
  finishObservation,
  finishSoundIsNoise,
  isUnreadFinished,
  menuBarPickedThreadKey,
  menuBarUnread,
} from "./finishedThreads";

const FINISHED = "2026-11-20T10:00:00.000Z";
const BEFORE = "2026-11-20T09:00:00.000Z";
const AFTER = "2026-11-20T11:00:00.000Z";

function shell(
  id: string,
  change: {
    readonly runStatus?: string;
    readonly completedAt?: string | null;
    readonly lastVisitedAt?: string | null | "absent";
    readonly runtime?: string | null;
    readonly hasPendingApprovals?: boolean;
  } = {},
): EnvironmentThreadShell {
  const completedAt = change.completedAt === undefined ? FINISHED : change.completedAt;
  const visit = change.lastVisitedAt === undefined ? BEFORE : change.lastVisitedAt;
  return {
    environmentId: "env",
    id,
    title: `Thread ${id}`,
    latestRun: { status: change.runStatus ?? "completed", completedAt },
    ...(visit === "absent" ? {} : { lastVisitedAt: visit }),
    runtime: change.runtime == null ? null : { status: change.runtime },
    hasPendingApprovals: change.hasPendingApprovals ?? false,
  } as unknown as EnvironmentThreadShell;
}

describe("isUnreadFinished", () => {
  it.each([
    ["a run that completed after the last visit", shell("a"), undefined, true],
    ["a visit after the run completed", shell("a", { lastVisitedAt: AFTER }), undefined, false],
    ["a thread that still works", shell("a", { runtime: "running" }), undefined, false],
    [
      "a thread that waits for an approval",
      shell("a", { hasPendingApprovals: true }),
      undefined,
      false,
    ],
    ["a stopped run", shell("a", { runStatus: "interrupted" }), undefined, false],
    ["a run with no end", shell("a", { completedAt: null }), undefined, false],
    // A stock server sends no visit for a thread that nobody opened: the sidebar shows no mark.
    ["a thread with no visit", shell("a", { lastVisitedAt: null }), undefined, false],
    // An older server sends no visit field, so the local visit of the client counts.
    ["a local visit before the end", shell("a", { lastVisitedAt: "absent" }), BEFORE, true],
    ["a local visit after the end", shell("a", { lastVisitedAt: "absent" }), AFTER, false],
  ])("%s", (_name, thread, localVisit, expected) => {
    expect(isUnreadFinished(thread, localVisit)).toBe(expected);
  });
});

describe("menuBarUnread", () => {
  it("counts each thread, and lists the ten newest first", () => {
    const threads = Array.from({ length: 12 }, (_unused, index) =>
      shell(`t${index}`, {
        completedAt: `2026-11-20T10:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const unread = menuBarUnread(threads);
    expect(unread.count).toBe(12);
    expect(unread.threads).toHaveLength(10);
    expect(unread.threads[0]).toEqual({ key: "env:t11", title: "Thread t11" });
    expect(unread.threads.at(-1)?.key).toBe("env:t2");
  });
});

describe("menuBarPickedThreadKey", () => {
  it.each([
    ["fork-open-thread:env:thread-1", "env:thread-1"],
    ["open-settings", null],
    ["fork-open-thread", null],
  ])("reads %j", (action, key) => {
    expect(menuBarPickedThreadKey(action)).toBe(key);
  });
});

describe("finishObservation", () => {
  const raw = { latestRunBackgroundWake: false, pendingBackgroundTasks: [] };

  it("settles an idle thread whose run completed, at the time of the end", () => {
    expect(finishObservation(shell("a"), raw)).toMatchObject({
      settled: true,
      completedAt: Date.parse(FINISHED),
      backgroundWake: false,
    });
  });

  it.each([
    ["a thread that still works", shell("a", { runtime: "running" }), raw],
    ["a failed run", shell("a", { runStatus: "failed" }), raw],
    [
      "a wake that a monitor still holds",
      shell("a"),
      {
        latestRunBackgroundWake: true,
        pendingBackgroundTasks: [{ kind: "monitor", taskId: "monitor-1" }],
      } as unknown as typeof raw,
    ],
  ])("does not settle %s", (_name, thread, rawShell) => {
    expect(finishObservation(thread, rawShell)).toMatchObject({
      settled: false,
      completedAt: null,
    });
  });
});

describe("finishSoundIsNoise", () => {
  it.each([
    ["the focused thread in a focused window", "env:a", true, true],
    ["the focused thread in a window without focus", "env:a", false, false],
    ["another thread in a focused window", "env:b", true, false],
    ["a page with no thread", null, true, false],
  ])("%s", (_name, focusedThreadKey, windowFocused, expected) => {
    expect(finishSoundIsNoise({ threadKey: "env:a", focusedThreadKey, windowFocused })).toBe(
      expected,
    );
  });
});

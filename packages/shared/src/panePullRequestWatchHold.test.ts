import { describe, expect, it } from "vite-plus/test";

import {
  backgroundWorkHoldsCompletion,
  derivePendingBackgroundWork,
  isPullRequestWatchTask,
  setPullRequestWatchHoldsThread,
} from "./orchestrationV2PendingBackgroundWork.ts";

const watch = {
  startedAt: "2026-11-19T00:00:00.000Z",
  headSha: null,
  failedChecks: [],
  passed: false,
  passedChecks: [],
  remarksThrough: "2026-11-19T00:00:00.000Z",
  remarkIds: [],
  conflicting: false,
  wakes: 0,
  checksPending: true,
};

const deriveWatchTasks = () =>
  derivePendingBackgroundWork({
    latestRun: { id: "run-1" as never, ordinal: 1, status: "completed" },
    providerThreads: [],
    turnItems: [],
    pullRequests: [
      {
        host: "github.com",
        repository: "acme/app",
        number: 1,
        url: "https://github.com/acme/app/pull/1",
        source: "agent",
        snapshot: null,
        watch,
      },
    ],
  });

// A stock server derives the task with the hold on, so its thread shell carries the awaited mark.
const serverWatchTask = {
  taskId: "pull-request-watch:github.com/acme/app#1",
  kind: "monitor",
  awaited: true,
} as const;

function withHold<Result>(holds: boolean, run: () => Result): Result {
  setPullRequestWatchHoldsThread(holds);
  try {
    return run();
  } finally {
    setPullRequestWatchHoldsThread(true);
  }
}

describe("pull request watch hold", () => {
  it("holds the thread while the checks run when the hold is on, as stock does", () => {
    const tasks = deriveWatchTasks();
    expect(tasks).toEqual([{ ...serverWatchTask, description: "Watching pull request #1" }]);
    expect(backgroundWorkHoldsCompletion(tasks)).toBe(true);
    expect(backgroundWorkHoldsCompletion([serverWatchTask])).toBe(true);
  });

  it("holds nothing when the hold is off, and still lists the watch", () => {
    withHold(false, () => {
      const tasks = deriveWatchTasks();
      expect(tasks).toEqual([
        {
          taskId: serverWatchTask.taskId,
          description: "Watching pull request #1",
          kind: "monitor",
        },
      ]);
      expect(tasks.every(isPullRequestWatchTask)).toBe(true);
      expect(backgroundWorkHoldsCompletion(tasks)).toBe(false);
      expect(backgroundWorkHoldsCompletion([serverWatchTask])).toBe(false);
    });
  });

  it.each([
    ["a command that the agent waits for", { taskId: "tests", kind: "command", awaited: true }],
    ["a monitor that the agent waits for", { taskId: "tail", kind: "monitor", awaited: true }],
    ["a subagent", { taskId: "sub", kind: "subagent" }],
  ] as const)("%s holds the thread when the hold is off", (_name, task) => {
    withHold(false, () => {
      expect(backgroundWorkHoldsCompletion([serverWatchTask, task])).toBe(true);
    });
  });
});

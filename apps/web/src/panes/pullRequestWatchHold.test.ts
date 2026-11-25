import { ProviderInstanceId } from "@t3tools/contracts";
import { backgroundWorkHoldsCompletion } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import { expect, it } from "vite-plus/test";

import { resolveThreadStatusPill } from "../components/Sidebar.logic";
import { startPullRequestWatchHoldSetting } from "./pullRequestWatchHold";
import { useReadoutSettingsStore } from "./readoutSettings";

it("the setting releases a watched pull request by default, and holds it when off", () => {
  // The task as a stock server sends it in a thread shell.
  const tasks = [
    {
      taskId: "pull-request-watch:github.com/acme/app#1",
      description: "Watching pull request #1",
      kind: "monitor",
      awaited: true,
    },
  ] as const;
  const sidebarLabel = () =>
    resolveThreadStatusPill({
      thread: {
        hasActionableProposedPlan: false,
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        interactionMode: "default",
        latestRun: null,
        lastVisitedAt: undefined,
        pendingBackgroundTasks: tasks,
        runtime: {
          status: "idle",
          providerName: "Claude",
          providerInstanceId: ProviderInstanceId.make("claudeAgent"),
          activeRunId: null,
          lastError: null,
          updatedAt: "2026-11-19T10:00:00.000Z",
        },
      },
    })?.label ?? null;
  const { setReadoutSetting } = useReadoutSettingsStore.getState();
  expect(backgroundWorkHoldsCompletion(tasks)).toBe(true);
  expect(sidebarLabel()).toBe("Waiting");

  startPullRequestWatchHoldSetting();
  expect(backgroundWorkHoldsCompletion(tasks)).toBe(false);
  expect(sidebarLabel()).toBeNull();
  setReadoutSetting("releaseWatchedPullRequests", false);
  expect(sidebarLabel()).toBe("Waiting");
  setReadoutSetting("releaseWatchedPullRequests", true);
  expect(sidebarLabel()).toBeNull();
});

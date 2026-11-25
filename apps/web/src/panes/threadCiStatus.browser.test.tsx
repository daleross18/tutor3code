import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { WS_METHODS, type PullRequestRef } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  answerRpc,
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { serveThreadShells, threadPullRequest as pullRequest } from "../../test/paneThreadShell";
import { render } from "../../test/render";
import { usePaneStore } from "./paneStore";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";
import { createInitialLayout } from "./paneTree";

// The socket is faked; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver: driver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, driver) };
});

// The fake environment does not serve project files, and a new draft waits for that read.
vi.mock(import("~/lib/t3ProjectFileDefaults"), () => ({
  readT3ProjectFile: () => Promise.resolve(null),
}));

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

// The fake environment does not say that it can list checks.
vi.mock(import("./pullRequestChecksSupport"), () => ({
  usePullRequestChecksSupport: () => true,
}));

// A file of its own: the app keeps the thread list that the first test of a file loaded.
function setup(threads: ReadonlyArray<FakeThread>) {
  usePaneStore.setState({ layout: createInitialLayout(), lastRouteKey: null, fillingPaneIds: [] });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  return installFakeEnvironment(threads);
}

async function openThread(thread: FakeThread) {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(
    await render(<AppRoot router={router} />, {
      // AppRoot brings its own router.
      router: false,
    }),
  );
  await expect.element(page.getByText(`Answer 0 for ${thread.id}.`)).toBeVisible();
  return stack.move();
}

it("a sidebar row shows the failed or running CI lanes and the auto-merge state of its open pull request", async () => {
  const running = threadWithHistory("ci-running", 1);
  const failed = threadWithHistory("ci-failed", 1);
  const auto = threadWithHistory("ci-auto", 1);
  const passed = threadWithHistory("ci-passed", 1);
  const plain = threadWithHistory("ci-none", 1);
  const withChecks = (
    number: number,
    branch: string,
    checksState: "pending" | "failing" | "passing",
  ) => {
    const link = pullRequest(number, branch, "open");
    return { ...link, snapshot: { ...link.snapshot!, checksState } };
  };
  using _environment = setup([running, failed, auto, passed, plain]);
  using _shell = serveThreadShells(
    new Map([
      [running, { pullRequests: [withChecks(41, "dale/running", "pending")] }],
      [failed, { pullRequests: [withChecks(42, "dale/failed", "failing")] }],
      [auto, { pullRequests: [withChecks(43, "dale/auto", "passing")] }],
      [passed, { pullRequests: [withChecks(44, "dale/passed", "passing")] }],
    ]),
  );
  const checksRequests: number[] = [];
  const lane = (name: string, status: "pending" | "success" | "failure") => ({
    name,
    status,
    description: null,
    url: null,
  });
  using _summary = answerRpc(WS_METHODS.pullRequestsSummary, (input: PullRequestRef) =>
    Effect.succeed({
      provider: "github",
      projectId: input.projectId,
      repository: input.repository,
      number: input.number,
      title: `Pull request ${input.number}`,
      url: `https://github.com/${input.repository}/pull/${input.number}`,
      state: "open",
      headBranch: "dale/branch",
      baseBranch: "dev",
      updatedAt: "2026-11-18T10:00:00.000Z",
      headSha: `sha${input.number}`,
      checksState: input.number === 41 ? "pending" : input.number === 42 ? "failing" : "passing",
      ...(input.number === 43 ? { autoMergeEnabled: true, autoMergeMethod: "squash" } : {}),
      ...(input.number === 44 ? { autoMergeEnabled: false } : {}),
    }),
  );
  using _checks = answerRpc(WS_METHODS.pullRequestsChecks, (input: PullRequestRef) => {
    checksRequests.push(input.number);
    return Effect.succeed({
      state: "open",
      checks:
        input.number === 41
          ? [lane("lint", "success"), lane("build", "pending"), lane("test", "pending")]
          : [lane("lint", "success"), lane("e2e", "failure")],
    });
  });
  await page.viewport(1500, 800);
  await using _app = await openThread(plain);

  const chips = () =>
    [...document.querySelectorAll<HTMLElement>("[data-thread-ci-status]")].map(
      (chip) => `${chip.dataset.threadCiStatus}: ${chip.textContent}`,
    );
  await vi.waitFor(() =>
    expect(chips().toSorted()).toEqual(["failed: e2e", "passed: auto", "running: build <1m +1"]),
  );
  // A pull request whose lanes all passed costs no checks request.
  expect(checksRequests.toSorted()).toEqual([41, 42]);

  useReadoutSettingsStore.getState().setReadoutSetting("showCiStatus", false);
  await vi.waitFor(() => expect(chips()).toEqual([]));
});

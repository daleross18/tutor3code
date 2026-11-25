import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import {
  NodeId,
  ProviderDriverKind,
  ProviderSessionId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  TurnItemId,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2Subagent,
  type OrchestrationV2TurnItem,
  type ThreadId,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  assistantItem,
  emitThreadEvent,
  ENVIRONMENT_ID,
  installFakeEnvironment,
  isThreadSubscribed,
  runningRun,
  threadWithHistory,
  userItem,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";
import { usePaneStore } from "./paneStore";
import { createInitialLayout } from "./paneTree";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

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

const AT = DateTime.makeUnsafe("2026-03-17T19:12:28.000Z");
const CODEX = ProviderDriverKind.make("codex");

/** A thread with one settled turn and an active provider conversation. */
function threadWithProvider(name: string) {
  const thread = threadWithHistory(name, 1);
  const providerThread: OrchestrationV2ProviderThread = {
    id: ProviderThreadId.make(`${name}-provider-thread`),
    driver: CODEX,
    providerInstanceId: thread.modelSelection!.instanceId,
    providerSessionId: ProviderSessionId.make(`${name}-provider-session`),
    appThreadId: thread.id,
    ownerNodeId: null,
    nativeThreadRef: { driver: CODEX, nativeId: `${name}-native`, strength: "strong" },
    nativeConversationHeadRef: null,
    status: "active",
    firstRunOrdinal: 1,
    lastRunOrdinal: 2,
    handoffIds: [],
    forkedFrom: null,
    pendingBackgroundTasks: [],
    contextUsage: null,
    nativeMetadata: null,
    goal: null,
    createdAt: AT,
    updatedAt: AT,
  };
  return { ...thread, providerThread, providerThreads: [providerThread] };
}

/** One token report of the running provider turn of a thread, as a stock server sends it. */
const reportTokens = (thread: ReturnType<typeof threadWithProvider>, usedTokens: number) =>
  emitThreadEvent(thread.id, {
    type: "provider-turn.updated",
    payload: {
      id: ProviderTurnId.make(`${thread.id}-provider-turn`),
      providerThreadId: thread.providerThread.id,
      nodeId: NodeId.make(`${thread.id}-node`),
      runAttemptId: null,
      nativeTurnRef: null,
      ordinal: 2,
      status: "running",
      startedAt: AT,
      completedAt: null,
      tokenUsage: { usedTokens, maxTokens: 1_000_000, updatedAt: "2026-03-17T19:13:00.000Z" },
    },
  });

/** A subagent of `parent` that works, with its record and its timeline item. */
function workingSubagent(
  parent: FakeThread,
  run: ReturnType<typeof runningRun>,
  name: string,
  ordinal: number,
  extra: Pick<OrchestrationV2Subagent, "childThreadId"> &
    Partial<Pick<OrchestrationV2Subagent, "workflow">>,
) {
  const id = NodeId.make(`${name}-node`);
  const shared = {
    threadId: parent.id,
    runId: run.id,
    origin: "app_owned" as const,
    driver: CODEX,
    providerInstanceId: parent.modelSelection!.instanceId,
    providerThreadId: null,
    prompt: `Do ${name}`,
    title: name,
    status: "running" as const,
    result: null,
    startedAt: AT,
    completedAt: null,
    updatedAt: AT,
  };
  const record: OrchestrationV2Subagent = {
    ...shared,
    ...extra,
    id,
    parentNodeId: NodeId.make(`${parent.id}-root`),
    createdBy: "agent",
    nativeTaskRef: null,
    model: null,
  };
  const item: OrchestrationV2TurnItem = {
    ...shared,
    childThreadId: extra.childThreadId,
    id: TurnItemId.make(`${name}-item`),
    type: "subagent",
    subagentId: id,
    nodeId: id,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
  };
  return { record, item };
}

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

async function openThread(threadId: ThreadId) {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${threadId}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(
    await render(<AppRoot router={router} />, {
      // AppRoot brings its own router.
      router: false,
    }),
  );
  await expect.element(page.getByText(`Answer 0 for ${threadId}.`)).toBeVisible();
  return stack.move();
}

/** Every token label on the page, sorted: the timeline list does not keep the row order. */
const tokenLabels = () =>
  [...document.querySelectorAll<HTMLElement>("[data-work-tokens]")]
    .map((label) => `${label.dataset.workTokens}:${label.textContent}`)
    .toSorted();

it("the timeline shows the tokens of the running turn and of each subagent that works", async () => {
  const parent = threadWithProvider("tokens-parent");
  const child = threadWithProvider("tokens-child");
  using _environment = setup([parent, child]);
  await page.viewport(1500, 800);
  await using _app = await openThread(parent.id);

  const run = runningRun(parent.id, `${parent.id}-run-1`, 2, `${parent.id}-user-1`);
  await emitThreadEvent(parent.id, { type: "run.created", payload: run });
  await emitThreadEvent(parent.id, {
    type: "turn-item.updated",
    payload: userItem(parent.id, run.id, `${parent.id}-user-1`, 2, "Start two subagents"),
  });
  // A stock row: the server sent no token report yet.
  await expect.element(page.getByText(/^Working/)).toBeVisible();
  expect(tokenLabels()).toEqual([]);

  await reportTokens(parent, 182_400);
  await vi.waitFor(() => expect(tokenLabels()).toEqual(["turn:· 182k tokens in context"]));
  const workingRow = document.querySelector('[data-work-tokens="turn"]')!.parentElement!;
  expect(workingRow.textContent).toMatch(/^Working.*· 182k tokens in context$/);

  // One subagent runs in a child thread, the other is a workflow that reports its own total.
  const inThread = workingSubagent(parent, run, "reader", 3, { childThreadId: child.id });
  const inWorkflow = workingSubagent(parent, run, "fleet", 4, {
    childThreadId: null,
    workflow: { phases: [], agents: [], totalTokens: 310_000 },
  });
  expect(isThreadSubscribed(child.id)).toBe(false);
  for (const { record, item } of [inThread, inWorkflow]) {
    await emitThreadEvent(parent.id, { type: "subagent.updated", payload: record });
    await emitThreadEvent(parent.id, { type: "turn-item.updated", payload: item });
  }
  const group = page.getByRole("button", { name: "2 subagents" });
  await expect.element(group).toBeVisible();
  // No total yet: the child thread has no report, and a sum without it would be too low.
  expect(tokenLabels()).toEqual(["turn:· 182k tokens in context"]);

  await vi.waitFor(() => expect(isThreadSubscribed(child.id)).toBe(true));
  await reportTokens(child, 45_200);
  await vi.waitFor(() =>
    expect(tokenLabels()).toEqual(["group: · 355k tokens", "turn:· 182k tokens in context"]),
  );
  expect(group.element().textContent).toContain("2 working · 355k tokens");

  await userEvent.click(group);
  await vi.waitFor(() =>
    expect(tokenLabels()).toEqual([
      "group: · 355k tokens",
      "subagent:310k tokens",
      "subagent:45.2k tokens",
      "turn:· 182k tokens in context",
    ]),
  );

  // A subagent that ended has no number, and the client stops reading its thread.
  await emitThreadEvent(parent.id, {
    type: "subagent.updated",
    payload: { ...inThread.record, status: "completed", completedAt: AT, result: "Done" },
  });
  await vi.waitFor(() =>
    expect(tokenLabels()).toEqual([
      "group: · 310k tokens",
      "subagent:310k tokens",
      "turn:· 182k tokens in context",
    ]),
  );
  await vi.waitFor(() => expect(isThreadSubscribed(child.id)).toBe(false));

  await emitThreadEvent(parent.id, {
    type: "turn-item.updated",
    payload: { ...inThread.item, status: "completed", completedAt: AT, result: "Done" },
  });

  // The run ends and the workflow keeps working, as in a thread that waits on background work.
  const providerTurnId = ProviderTurnId.make(`${parent.id}-provider-turn`);
  await emitThreadEvent(parent.id, {
    type: "run-attempt.created",
    payload: {
      id: RunAttemptId.make(`${parent.id}-attempt-1`),
      runId: run.id,
      attemptOrdinal: 1,
      rootNodeId: NodeId.make(`${parent.id}-root`),
      providerInstanceId: parent.modelSelection!.instanceId,
      providerThreadId: parent.providerThread.id,
      providerTurnId,
      reason: "initial",
      status: "completed",
      startedAt: AT,
      completedAt: AT,
    },
  });
  await emitThreadEvent(parent.id, {
    type: "provider-turn.updated",
    payload: {
      id: providerTurnId,
      providerThreadId: parent.providerThread.id,
      nodeId: NodeId.make(`${parent.id}-node`),
      runAttemptId: null,
      nativeTurnRef: null,
      ordinal: 2,
      status: "completed",
      startedAt: AT,
      completedAt: AT,
      tokenUsage: { usedTokens: 182_400, updatedAt: "2026-03-17T19:13:00.000Z" },
      turnTokenUsage: {
        usageScope: "main_agent",
        hasSubagents: true,
        usageStatus: "complete",
        inputTokens: 90_000,
        outputTokens: 12_400,
      },
    },
  });
  const {
    messageId: _m,
    streaming: _s,
    text: _t,
    ...command
  } = assistantItem(parent.id, run.id, `${parent.id}-command-1`, 5, "");
  await emitThreadEvent(parent.id, {
    type: "turn-item.updated",
    payload: { ...command, type: "command_execution", input: "ls", output: "", exitCode: 0 },
  });
  await emitThreadEvent(parent.id, {
    type: "turn-item.updated",
    payload: assistantItem(parent.id, run.id, `${parent.id}-answer-1`, 6, "Waiting for the fleet."),
  });
  await emitThreadEvent(parent.id, {
    type: "run.updated",
    payload: { ...run, status: "completed", completedAt: DateTime.add(AT, { minutes: 3 }) },
  });
  // The fold line of the turn gives its output so far, the background work bar the workflow's.
  await vi.waitFor(() =>
    expect(tokenLabels()).toEqual([
      "background:310k tokens",
      "fold: · 12.4k tokens",
      "group: · 310k tokens",
      "subagent:310k tokens",
    ]),
  );
  // The number is in one place: the footer of the turn leaves it out while the fold line has it.
  const footer = () => document.querySelector<HTMLElement>("[data-worked-time]")?.textContent;
  await vi.waitFor(() => expect(footer()).toBe("· worked 3m 0s"));

  // The work ends: the fold line drops the number and the footer of the finished turn shows it.
  await emitThreadEvent(parent.id, {
    type: "subagent.updated",
    payload: { ...inWorkflow.record, status: "completed", completedAt: AT, result: "Done" },
  });
  await emitThreadEvent(parent.id, {
    type: "turn-item.updated",
    payload: { ...inWorkflow.item, status: "completed", completedAt: AT, result: "Done" },
  });
  await vi.waitFor(() => expect(footer()).toBe("· worked 3m 0s · 12.4k tokens"));
  expect(tokenLabels()).toEqual([]);

  useReadoutSettingsStore.getState().setReadoutSetting("showWorkTokens", false);
  await vi.waitFor(() => expect(footer()).toBe("· worked 3m 0s"));
});

import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import {
  NodeId,
  ProviderDriverKind,
  ProviderSessionId,
  ProviderThreadId,
  ProviderTurnId,
  type OrchestrationV2ProviderThread,
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
import { ThreadDetailsContext } from "~/components/chat/ThreadDetailsUsage";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  emitThreadEvent,
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";
import { useRightPanelStore } from "~/rightPanelStore";
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

const usage: ContextWindowSnapshot = {
  usedTokens: 100_000,
  totalProcessedTokens: null,
  maxTokens: 200_000,
  remainingTokens: 100_000,
  usedPercentage: 50,
  remainingPercentage: 50,
  inputTokens: 92_000,
  cachedInputTokens: 80_000,
  outputTokens: 8_000,
  reasoningOutputTokens: null,
  lastUsedTokens: null,
  lastInputTokens: null,
  lastCachedInputTokens: null,
  lastOutputTokens: null,
  lastReasoningOutputTokens: null,
  toolUses: null,
  durationMs: null,
  compactsAutomatically: true,
  autoCompactThreshold: null,
  cost: null,
  updatedAt: "2026-11-20T10:00:00.000Z",
};

const POPUP = "[data-context-breakdown]";
const TRIGGER = "[data-context-breakdown-trigger]";
const AT = DateTime.makeUnsafe("2026-11-20T10:00:00.000Z");
const CODEX = ProviderDriverKind.make("codex");

const partKeys = () =>
  [...(document.querySelector(POPUP)?.querySelectorAll("[data-context-part]") ?? [])].map((row) =>
    row.getAttribute("data-context-part"),
  );

function setup(showContextBreakdown: boolean) {
  useReadoutSettingsStore.setState({ ...DEFAULT_READOUT_SETTINGS, showContextBreakdown });
}

it("opens the breakdown on hover and on click of the Context row", async () => {
  setup(true);
  await using screen = await render(<ThreadDetailsContext usage={usage} />);
  const trigger = screen.container.querySelector<HTMLElement>(TRIGGER);
  expect(trigger).not.toBeNull();

  await userEvent.hover(trigger!);
  await expect.element(page.getByText("50% used · 100k free (50%)")).toBeVisible();
  expect(document.querySelector(`${POPUP} [data-context-total]`)?.textContent).toBe("100k / 200k");
  expect(partKeys()).toEqual(["none", "cached", "newInput", "output"]);

  await userEvent.unhover(trigger!);
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(document.querySelector(POPUP)).toBeNull());

  await userEvent.click(trigger!);
  await expect.element(page.getByText("Latest model request")).toBeVisible();
});

it("keeps the stock row and its tooltip with the setting off", async () => {
  setup(false);
  await using screen = await render(<ThreadDetailsContext usage={usage} />);
  expect(screen.container.querySelector(TRIGGER)).toBeNull();
  await userEvent.hover(screen.getByText("100k / 200k"));
  await expect.element(page.getByText("Context: 50% used")).toBeVisible();
  expect(document.querySelector(POPUP)).toBeNull();

  await act(() => setup(true));
  expect(screen.container.querySelector(TRIGGER)).not.toBeNull();
});

it("splits the context of an open thread by the token reports of its turns", async () => {
  usePaneStore.setState({ layout: createInitialLayout(), lastRouteKey: null, fillingPaneIds: [] });
  setup(true);
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    // Stock hides the "Context window" item of the thread details by default.
    threadDetailsItems: { context: true },
  });
  const base = threadWithHistory("context-parts", 1);
  const providerThread: OrchestrationV2ProviderThread = {
    id: ProviderThreadId.make("context-parts-provider-thread"),
    driver: CODEX,
    providerInstanceId: base.modelSelection!.instanceId,
    providerSessionId: ProviderSessionId.make("context-parts-provider-session"),
    appThreadId: base.id,
    ownerNodeId: null,
    nativeThreadRef: { driver: CODEX, nativeId: "context-parts-native", strength: "strong" },
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
  using _environment = installFakeEnvironment([{ ...base, providerThreads: [providerThread] }]);
  await page.viewport(1500, 800);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${base.id}`] }),
  );
  await router.load();
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });
  await expect.element(page.getByText(`Answer 0 for ${base.id}.`)).toBeVisible();

  for (const [ordinal, usedTokens] of [
    [1, 30_000],
    [2, 72_000],
  ] as const) {
    await emitThreadEvent(base.id, {
      type: "provider-turn.updated",
      payload: {
        id: ProviderTurnId.make(`context-parts-turn-${ordinal}`),
        providerThreadId: providerThread.id,
        nodeId: NodeId.make("context-parts-node"),
        runAttemptId: null,
        nativeTurnRef: null,
        ordinal,
        status: "completed",
        startedAt: AT,
        completedAt: AT,
        tokenUsage: {
          usedTokens,
          maxTokens: 200_000,
          updatedAt: `2026-11-20T10:0${ordinal}:00.000Z`,
        },
      },
    });
  }

  await act(() =>
    useRightPanelStore
      .getState()
      .setThreadPanelOpen({ environmentId: ENVIRONMENT_ID, threadId: base.id }, "inline", true),
  );
  const trigger = page.getByRole("button", { name: "Context: 36% used" }).first();
  await expect.element(trigger).toHaveAttribute("data-context-breakdown-trigger");
  await userEvent.hover(trigger);
  await expect.element(page.getByText("36% used · 128k free (64%)")).toBeVisible();
  expect(partKeys()).toEqual(["turns:1", "turns:2"]);
  expect(document.querySelector('[data-context-part="turns:2"]')?.textContent).toBe("Turn 242k");
});

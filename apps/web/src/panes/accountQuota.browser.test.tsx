import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerConfig,
  type ServerConfigStreamEvent,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
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
  CODEX_PROVIDER,
  ENVIRONMENT_ID,
  fakeDriver,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";
import { usePaneStore } from "./paneStore";
import { createInitialLayout, getActiveTab, listLeaves } from "./paneTree";
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

const FABLE = "claude-fable-5";
const QUOTA = "[data-account-quota]";
const RESETS_AT = "2099-01-01T00:00:00.000Z";

interface Used {
  readonly fiveHour: number;
  readonly sevenDay: number;
  readonly fable: number;
}

/** One Claude account as the stock server sends it, with the windows of its usage probe. */
function claudeAccount(instanceId: string, displayName: string, used: Used | null) {
  const window = (id: string, kind: string, label: string, usedPercent: number) => ({
    id,
    kind,
    label,
    usedPercent,
    resetsAt: RESETS_AT,
  });
  return {
    instanceId,
    driver: "claudeAgent",
    displayName,
    enabled: true,
    installed: true,
    version: "2.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-03-17T19:12:28.000Z",
    models: [{ slug: FABLE, name: "Claude Fable 5", isCustom: false, capabilities: null }],
    ...(used === null
      ? {}
      : {
          usageLimits: {
            checkedAt: "2026-03-17T19:12:28.000Z",
            windows: [
              window("five_hour", "session", "Session", used.fiveHour),
              window("seven_day", "weekly", "Weekly", used.sevenDay),
              window("seven_day_fable", "weekly", "Weekly · Fable", used.fable),
            ],
          },
        }),
  };
}

const ACCOUNTS = [
  // The account of the open thread: the least quota left for Fable.
  claudeAccount("claudeAgent", "Claude", { fiveHour: 38, sevenDay: 60, fable: 91 }),
  claudeAccount("claude2", "Claude 2", { fiveHour: 12, sevenDay: 25, fable: 30 }),
  claudeAccount("claude3", "Claude 3", { fiveHour: 55, sevenDay: 50, fable: 45 }),
  claudeAccount("claude4", "Claude 4", null),
];

interface FakeSession {
  initialConfig: Effect.Effect<ServerConfig>;
  subscribeServerConfig: () => Stream.Stream<ServerConfigStreamEvent>;
}

/**
 * A real server lists each added account in its settings, and the fake config lists none. The
 * client reads the config from the session and not through an RPC, so this wraps the session of
 * the fake driver until disposed. Call it before the app mounts.
 */
function serveAccountSettings(): Disposable {
  // oxlint-disable-next-line t3code/no-manual-effect-runtime-in-tests -- the fake driver hands out its session only inside this already-succeeded Effect; no test logic runs in it
  const lease = Effect.runSync(Effect.scoped(fakeDriver.connect({ target: null } as never)));
  const session = lease.session as unknown as FakeSession;
  const stock: FakeSession = {
    initialConfig: session.initialConfig,
    subscribeServerConfig: session.subscribeServerConfig,
  };
  const providerInstances = Object.fromEntries(
    ACCOUNTS.map((account) => [
      ProviderInstanceId.make(account.instanceId),
      { driver: ProviderDriverKind.make("claudeAgent"), enabled: true },
    ]),
  );
  const withAccounts = (config: ServerConfig): ServerConfig => ({
    ...config,
    settings: { ...config.settings, providerInstances },
  });
  session.initialConfig = Effect.map(stock.initialConfig, withAccounts);
  session.subscribeServerConfig = () =>
    Stream.map(stock.subscribeServerConfig(), (event) =>
      event.type === "snapshot" ? { ...event, config: withAccounts(event.config) } : event,
    );
  return { [Symbol.dispose]: () => void Object.assign(session, stock) };
}

/** The stores outlive a test, so each test starts from one pane, no drafts and the defaults. */
function setup(threads: ReadonlyArray<FakeThread>) {
  usePaneStore.setState({
    layout: createInitialLayout(),
    lastRouteKey: null,
    fillingPaneIds: [],
  });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
    stickyModelSelectionByProvider: {},
    stickyActiveProvider: null,
  });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  return installFakeEnvironment(threads, { providers: [...ACCOUNTS, CODEX_PROVIDER] });
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

// One thread for both tests: the app keeps the thread list that the first test of a file loaded,
// and the new-thread flow reads the model of its source thread from that list.
const THREAD = threadWithHistory("quota-thread", 1, {
  instanceId: ProviderInstanceId.make("claudeAgent"),
  model: FABLE,
});

const quotaRows = () =>
  [...document.querySelectorAll<HTMLElement>(`${QUOTA} [data-account-quota-row]`)].map((row) => ({
    id: row.dataset.accountQuotaRow,
    text: row.textContent,
    current: row.dataset.current === "true",
    mostQuota: row.dataset.mostQuota === "true",
    low: [...row.querySelectorAll<HTMLElement>("[data-low]")].map((part) => part.textContent),
  }));

it("lists the quota of each Claude account in the model picker, and nothing with the setting off", async () => {
  using _environment = setup([THREAD]);
  using _settings = serveAccountSettings();
  await page.viewport(1280, 800);
  await using _app = await openThread(THREAD);

  await page.elementLocator(document.querySelector("[data-chat-provider-model-picker]")!).click();
  await vi.waitFor(() => expect(quotaRows()).toHaveLength(4));
  expect(quotaRows()).toEqual([
    {
      id: "claudeAgent",
      text: "Claude5h 62%7d 40%Fable 9%",
      current: true,
      mostQuota: false,
      low: ["Fable 9%"],
    },
    {
      id: "claude2",
      text: "Claude 2 · most left5h 88%7d 75%Fable 70%",
      current: false,
      mostQuota: true,
      low: [],
    },
    {
      id: "claude3",
      text: "Claude 35h 45%7d 50%Fable 55%",
      current: false,
      mostQuota: false,
      low: [],
    },
    // The server sent no limits for this account.
    { id: "claude4", text: "Claude 4not reported", current: false, mostQuota: false, low: [] },
  ]);
  const list = document.querySelector<HTMLElement>(QUOTA)!;
  expect(list.textContent).toContain("Claude quota left");
  // Inside the picker, under the model list, with every row in view.
  const picker = document.querySelector<HTMLElement>("[data-model-picker-content]")!;
  expect(picker.contains(list)).toBe(true);
  const pickerBox = picker.getBoundingClientRect();
  for (const row of list.querySelectorAll<HTMLElement>("[data-account-quota-row]")) {
    const box = row.getBoundingClientRect();
    expect(box.height).toBeGreaterThan(0);
    expect(box.top).toBeGreaterThanOrEqual(pickerBox.top);
    expect(box.bottom).toBeLessThanOrEqual(pickerBox.bottom + 1);
    expect(box.left).toBeGreaterThanOrEqual(pickerBox.left);
    expect(box.right).toBeLessThanOrEqual(pickerBox.right + 1);
  }
  await expect.element(page.getByRole("option", { name: /Claude Fable 5/ }).first()).toBeVisible();

  await act(() => useReadoutSettingsStore.getState().setReadoutSetting("showAccountQuota", false));
  expect(document.querySelector(QUOTA)).toBeNull();
  await expect.element(page.getByRole("option", { name: /Claude Fable 5/ }).first()).toBeVisible();
});

it("starts a new thread on the Claude account with the most quota left, and on the stock account with the setting off", async () => {
  using _environment = setup([THREAD]);
  using _settings = serveAccountSettings();
  useReadoutSettingsStore.getState().setReadoutSetting("newThreadsUseMostQuota", false);
  await page.viewport(1280, 800);
  await using _app = await openThread(THREAD);

  const leaves = () => listLeaves(getActiveTab(usePaneStore.getState().layout).root);
  /** The split key opens a new thread in a new pane, through the stock new-thread flow. */
  const splitFromThread = async () => {
    const before = new Set(leaves().map((leaf) => leaf.id));
    await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
    let opened: { readonly paneId: string; readonly account: string } | undefined;
    await vi.waitFor(() => {
      const leaf = leaves().find((candidate) => !before.has(candidate.id));
      if (leaf?.target?.kind !== "draft") throw new Error("The new pane shows no draft yet.");
      const draft = useComposerDraftStore.getState().getComposerDraft(leaf.target.draftId);
      const account = draft?.activeProvider;
      if (!account) throw new Error("The draft has no model yet.");
      expect(draft.modelSelectionByProvider[account]?.model).toBe(FABLE);
      // A seed, as the stock carried model is: the user did not choose it.
      expect(draft.modelSelectionExplicit).toBeUndefined();
      opened = { paneId: leaf.id, account };
    });
    return opened!;
  };

  // Off: stock carries the account of the thread that the user came from.
  const stock = await splitFromThread();
  expect(stock.account).toBe("claudeAgent");

  // On: the same key from the same thread. Claude 2 has the most quota left for Fable.
  await act(() => usePaneStore.getState().closePane(stock.paneId));
  await vi.waitFor(() => expect(leaves()).toHaveLength(1));
  await act(() =>
    useReadoutSettingsStore.getState().setReadoutSetting("newThreadsUseMostQuota", true),
  );
  expect((await splitFromThread()).account).toBe("claude2");
});

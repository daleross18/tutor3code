import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ProviderInstanceId, WS_METHODS, type PreviewOpenInput } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests, getClientSettings } from "~/hooks/useSettings";
import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import { resetPreviewStateForTests } from "~/previewStateStore";
import { useRightPanelStore } from "~/rightPanelStore";
import { getRouter } from "~/router";
import {
  answerRpc,
  CLAUDE_PROVIDER,
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";
import { artifactLinkHost, artifactLinkProfile } from "./openArtifactLink";
import { usePaneStore } from "./paneStore";
import {
  createInitialLayout,
  getActiveTab,
  listLeaves,
  replaceTab,
  setLeafTarget,
  splitLeaf,
} from "./paneTree";
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

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const MODEL = "claude-opus-4-6";
const FIRST_ACCOUNT = ProviderInstanceId.make(CLAUDE_PROVIDER.instanceId);
const SECOND_ACCOUNT = ProviderInstanceId.make("dale-claude2");

/** A thread of one Claude account whose answer holds an artifact link. */
function artifactThread(name: string, instanceId: ProviderInstanceId, url: string): FakeThread {
  const thread = threadWithHistory(name, 1, { instanceId, model: MODEL });
  return {
    ...thread,
    items: thread.items.map((item) =>
      item.type === "assistant_message"
        ? { ...item, text: `Published for ${name}: [report of ${name}](${url})` }
        : item,
    ),
  };
}

const LEFT_URL = "https://claude.ai/code/artifact/0b8f6c1e-52c8-4a8e-9d2e-3f1f0a6f7a11";
const RIGHT_URL = "https://claude.ai/artifact/9f3c1a";
const LEFT = artifactThread("artifact-left", SECOND_ACCOUNT, LEFT_URL);
const RIGHT = artifactThread("artifact-right", FIRST_ACCOUNT, RIGHT_URL);

const refOf = (thread: FakeThread) => scopeThreadRef(ENVIRONMENT_ID, thread.id);
const targetOf = (thread: FakeThread) => ({ kind: "server", threadRef: refOf(thread) }) as const;
const linkOf = (thread: FakeThread) => page.getByRole("link", { name: `report of ${thread.id}` });

function twoPaneLayout() {
  const layout = createInitialLayout(targetOf(LEFT));
  const first = getActiveTab(layout).focusedPaneId;
  let tab = splitLeaf(getActiveTab(layout), first, "right");
  const added = listLeaves(tab.root).find((leaf) => leaf.id !== first)!;
  tab = setLeafTarget(tab, added.id, targetOf(RIGHT));
  return replaceTab(layout, { ...tab, focusedPaneId: first });
}

/** A desktop app whose browser is free to use, and a server that opens each tab it is asked for. */
function setup(layout: ReturnType<typeof createInitialLayout>, desktop = true) {
  usePaneStore.setState({ layout, lastRouteKey: null, fillingPaneIds: [] });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  useRightPanelStore.setState({ byThreadKey: {} });
  usePreviewMiniPlayerStore.setState({ byThreadKey: {} });
  resetPreviewStateForTests();
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const environment = installFakeEnvironment([LEFT, RIGHT], {
    providers: [
      CLAUDE_PROVIDER,
      { ...CLAUDE_PROVIDER, instanceId: SECOND_ACCOUNT, displayName: "Claude 2" },
    ],
  });
  const opened: PreviewOpenInput[] = [];
  const answer = answerRpc(WS_METHODS.previewOpen, (input: PreviewOpenInput) => {
    opened.push(input);
    return Effect.succeed({
      threadId: input.threadId,
      tabId: `tab-${opened.length}`,
      navStatus: { _tag: "Loading", url: input.url, title: "" },
      canGoBack: false,
      canGoForward: false,
      profileId: input.profileId,
      updatedAt: `2026-11-19T10:00:0${opened.length}.000Z`,
    });
  });
  const stockBrowserAvailable = artifactLinkHost.browserAvailable;
  // The stock app takes a `window.desktopBridge` for the whole desktop bridge, so the test
  // answers the one question that the click path asks about it.
  if (desktop) artifactLinkHost.browserAvailable = () => true;
  // A click that the app does not use would leave the test page. Stock handlers run before this.
  const stockClicks: string[] = [];
  const blockNavigation = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (anchor === null) return;
    if (!event.defaultPrevented) stockClicks.push(anchor.href);
    event.preventDefault();
  };
  window.addEventListener("click", blockNavigation);
  return {
    opened,
    stockClicks,
    [Symbol.dispose]: () => {
      window.removeEventListener("click", blockNavigation);
      artifactLinkHost.browserAvailable = stockBrowserAvailable;
      answer[Symbol.dispose]();
      environment[Symbol.dispose]();
    },
  };
}

async function openApp() {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${LEFT.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(await render(<AppRoot router={router} />, { router: false }));
  await expect.element(linkOf(LEFT)).toBeVisible();
  return stack.move();
}

const panelOf = (thread: FakeThread) =>
  useRightPanelStore.getState().byThreadKey[scopedThreadKey(refOf(thread))];

it("opens an artifact link in the right panel, in the browser profile of the thread's Claude account", async () => {
  using app = setup(createInitialLayout(targetOf(LEFT)));
  await page.viewport(1280, 800);
  await using _app = await openApp();

  await userEvent.click(linkOf(LEFT));
  await vi.waitFor(() => expect(app.opened).toHaveLength(1));
  expect(app.opened[0]).toMatchObject({
    threadId: LEFT.id,
    url: LEFT_URL,
    profileId: "claude-account-dale-claude2",
  });
  // The tab is a surface of the right panel, and the stock settings list the profile by name.
  await vi.waitFor(() =>
    expect(panelOf(LEFT)).toMatchObject({
      isOpen: true,
      surfaces: [{ kind: "preview", resourceId: "tab-1" }],
    }),
  );
  expect(getClientSettings().browserProfiles).toEqual([
    { id: "claude-account-dale-claude2", name: "Claude 2 account", kind: "persistent" },
  ]);
  expect(app.stockClicks).toEqual([]);

  // The stock menu item "Open in browser" of the link asks for the same profile.
  expect(artifactLinkProfile(refOf(LEFT), LEFT_URL)).toEqual({
    profileId: "claude-account-dale-claude2",
  });
  expect(artifactLinkProfile(refOf(LEFT), "https://claude.ai/chat/9f3c1a")).toEqual({});

  // A second click shows the tab that is open. No second tab opens.
  await userEvent.click(linkOf(LEFT));
  expect(app.stockClicks).toEqual([]);
  expect(app.opened).toHaveLength(1);

  // Cmd or Ctrl with the click is the stock way to the system browser.
  await userEvent.click(linkOf(LEFT), { modifiers: ["ControlOrMeta"] });
  expect(app.stockClicks).toEqual([LEFT_URL]);

  // The setting off: the stock rule has the click.
  await act(() =>
    useReadoutSettingsStore.getState().setReadoutSetting("artifactLinksInApp", false),
  );
  await userEvent.click(linkOf(LEFT));
  expect(app.stockClicks).toEqual([LEFT_URL, LEFT_URL]);
  expect(app.opened).toHaveLength(1);
});

it("shows the artifact of each pane in its floating preview where the pane has no right panel", async () => {
  using app = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp();
  await expect.element(linkOf(RIGHT)).toBeVisible();

  await userEvent.click(linkOf(LEFT));
  await userEvent.click(linkOf(RIGHT));
  await vi.waitFor(() => expect(app.opened).toHaveLength(2));
  expect(app.opened.map((input) => [input.threadId, input.url, input.profileId])).toEqual([
    [LEFT.id, LEFT_URL, "claude-account-dale-claude2"],
    [RIGHT.id, RIGHT_URL, "claude-account-claudeAgent"],
  ]);
  // Each pane shows its own tab in the stock floating preview. No panel opens, and no pane
  // gets the message of a refused panel request.
  await vi.waitFor(() => {
    const players = usePreviewMiniPlayerStore.getState().byThreadKey;
    expect(players[scopedThreadKey(refOf(LEFT))]?.source).toEqual({
      kind: "browser",
      tabId: "tab-1",
    });
    expect(players[scopedThreadKey(refOf(RIGHT))]?.source).toEqual({
      kind: "browser",
      tabId: "tab-2",
    });
  });
  await vi.waitFor(() =>
    expect(
      document.querySelectorAll('[data-splitpane-cell] [aria-label="Floating browser preview"]'),
    ).toHaveLength(2),
  );
  expect(panelOf(LEFT)?.isOpen ?? false).toBe(false);
  expect(panelOf(RIGHT)?.isOpen ?? false).toBe(false);
  expect(document.body.textContent).not.toContain("This pane is too narrow for the right panel");
  expect(app.stockClicks).toEqual([]);
});

it("leaves the link to the stock rule in a browser, which has no desktop bridge", async () => {
  using app = setup(createInitialLayout(targetOf(LEFT)), false);
  await page.viewport(1280, 800);
  await using _app = await openApp();

  await userEvent.click(linkOf(LEFT));
  expect(app.stockClicks).toEqual([LEFT_URL]);
  expect(app.opened).toHaveLength(0);
});

import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ProviderInstanceId, WS_METHODS, type PreviewOpenInput } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";
import { cdp, page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import { readThreadPreviewState, resetPreviewStateForTests } from "~/previewStateStore";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
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
import { artifactLinkHost } from "./openArtifactLink";
import { browserPaneHost } from "./paneBrowserActions";
import { usePaneStore } from "./paneStore";
import {
  createInitialLayout,
  getActiveTab,
  listLeaves,
  replaceTab,
  setLeafTarget,
  splitLeaf,
  type PaneLayout,
  type PaneNode,
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

const ACCOUNT = ProviderInstanceId.make(CLAUDE_PROVIDER.instanceId);
const FIRST_URL = "https://claude.ai/artifact/1a2b3c";
const SECOND_URL = "https://claude.ai/artifact/4d5e6f";

/** A thread of a Claude account whose answer holds two artifact links. */
function linkThread(name: string): FakeThread {
  const thread = threadWithHistory(name, 1, { instanceId: ACCOUNT, model: "claude-opus-4-6" });
  return {
    ...thread,
    items: thread.items.map((item) =>
      item.type === "assistant_message"
        ? {
            ...item,
            text: `See [first of ${name}](${FIRST_URL}) and [second of ${name}](${SECOND_URL})`,
          }
        : item,
    ),
  };
}

const LEFT = linkThread("panel-left");
const RIGHT = linkThread("panel-right");
const SIDE: FakeThread = { ...threadWithHistory("panel-side", 1), sideChatOf: LEFT.id };

const refOf = (thread: FakeThread) => scopeThreadRef(ENVIRONMENT_ID, thread.id);
const targetOf = (thread: FakeThread) => ({ kind: "server", threadRef: refOf(thread) }) as const;
const linkOf = (thread: FakeThread, which: "first" | "second") =>
  page.getByRole("link", { name: `${which} of ${thread.id}` });

function twoPaneLayout(): PaneLayout {
  const layout = createInitialLayout(targetOf(LEFT));
  const first = getActiveTab(layout).focusedPaneId;
  let tab = splitLeaf(getActiveTab(layout), first, "right");
  const added = listLeaves(tab.root).find((leaf) => leaf.id !== first)!;
  tab = setLeafTarget(tab, added.id, targetOf(RIGHT));
  return replaceTab(layout, { ...tab, focusedPaneId: first });
}

/** A desktop app with a browser, and a server that opens each tab it is asked for. */
function setup(layout: PaneLayout) {
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
  const environment = installFakeEnvironment([LEFT, RIGHT, SIDE], {
    providers: [CLAUDE_PROVIDER],
  });
  let opened = 0;
  const openAnswer = answerRpc(WS_METHODS.previewOpen, (input: PreviewOpenInput) => {
    opened += 1;
    return Effect.succeed({
      threadId: input.threadId,
      tabId: `tab-${opened}`,
      navStatus: { _tag: "Loading", url: input.url, title: "" },
      canGoBack: false,
      canGoForward: false,
      profileId: input.profileId,
      updatedAt: `2026-11-23T10:00:0${opened}.000Z`,
    });
  });
  // The stock app takes a `window.desktopBridge` for the whole desktop bridge, so the test
  // answers the two questions that the fork asks about it.
  const stock = [artifactLinkHost.browserAvailable, browserPaneHost.available] as const;
  artifactLinkHost.browserAvailable = () => true;
  browserPaneHost.available = () => true;
  const blockNavigation = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
  };
  window.addEventListener("click", blockNavigation);
  return {
    [Symbol.dispose]: () => {
      window.removeEventListener("click", blockNavigation);
      [artifactLinkHost.browserAvailable, browserPaneHost.available] = stock;
      openAnswer[Symbol.dispose]();
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
  await expect.element(linkOf(LEFT, "first")).toBeVisible();
  return stack.move();
}

/** A real mouse, so pointer capture and the stock tab reorder act as they do for a user. */
function mouse(
  type: "mousePressed" | "mouseMoved" | "mouseReleased",
  at: { x: number; y: number },
) {
  const frame = window.frameElement?.getBoundingClientRect();
  return cdp().send("Input.dispatchMouseEvent", {
    type,
    x: at.x + (frame?.left ?? 0),
    y: at.y + (frame?.top ?? 0),
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
  });
}
function hover(at: { x: number; y: number }) {
  const frame = window.frameElement?.getBoundingClientRect();
  return cdp().send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: at.x + (frame?.left ?? 0),
    y: at.y + (frame?.top ?? 0),
    button: "none",
    buttons: 0,
  });
}
async function press(at: { x: number; y: number }) {
  await hover(at);
  await mouse("mousePressed", at);
}

const one = <T extends Element = HTMLElement>(selector: string) => {
  const found = document.querySelector<T>(selector);
  if (found === null) throw new Error(`No element for ${selector}`);
  return found;
};
const centerOf = (element: Element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
const boxOf = (element: Element) => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};
const tabOf = (surfaceId: string) => one(`[data-right-panel-surface="${surfaceId}"]`);
/** The tab titles of a panel strip, in order. */
const panelSurfaceIds = (thread: FakeThread) =>
  selectThreadRightPanelState(
    useRightPanelStore.getState().byThreadKey,
    refOf(thread),
  ).surfaces.map((surface) => surface.id);
const panelOpen = (thread: FakeThread) =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refOf(thread)).isOpen;
const overlay = () => document.querySelector("[data-pane-drop-overlay]");
const zone = () =>
  document.querySelector<HTMLElement>("[data-pane-drop-zone]")?.dataset.paneDropZone;

function shape(node: PaneNode): unknown {
  if (node.kind === "split") return { [node.axis]: node.children.map(shape) };
  const threadId = node.target?.kind === "server" ? node.target.threadRef.threadId : "none";
  return node.view === "browser" ? `${threadId}*` : threadId;
}
const tabShapes = () => usePaneStore.getState().layout.tabs.map((tab) => shape(tab.root));

/** The chat area of the one pane, left of its right panel. */
function chatArea() {
  const panel = one("[data-preview-panel-mode]").getBoundingClientRect();
  const cell = one("[data-splitpane-root]").getBoundingClientRect();
  return { left: cell.left, top: cell.top, right: panel.left, bottom: cell.bottom };
}

it("drags a browser tab of the right panel out to a browser pane, and keeps a click and the stock reorder", async () => {
  using _setup = setup(createInitialLayout(targetOf(LEFT)));
  await page.viewport(1280, 800);
  await using _app = await openApp();

  // The one pane is wide, so each link opens a tab of the right panel.
  await userEvent.click(linkOf(LEFT, "first"));
  await userEvent.click(linkOf(LEFT, "second"));
  await vi.waitFor(() => expect(panelSurfaceIds(LEFT)).toEqual(["browser:tab-1", "browser:tab-2"]));
  await vi.waitFor(() => expect(tabOf("browser:tab-2").dataset.activeTab).toBe("true"));

  // A press with no move is the stock click: it selects the tab.
  const first = centerOf(tabOf("browser:tab-1").querySelector("button:last-of-type")!);
  await press(first);
  await mouse("mouseReleased", first);
  await vi.waitFor(() => expect(tabOf("browser:tab-1").dataset.activeTab).toBe("true"));
  expect(overlay()).toBeNull();

  // Inside the panel the drag is the stock reorder: no zone, and the tab moves past the next.
  const second = centerOf(tabOf("browser:tab-2"));
  await press(first);
  await mouse("mouseMoved", { x: first.x + 10, y: first.y });
  await mouse("mouseMoved", { x: second.x + 30, y: second.y });
  expect(overlay()).toBeNull();
  await mouse("mouseReleased", { x: second.x + 30, y: second.y });
  await vi.waitFor(() => expect(panelSurfaceIds(LEFT)).toEqual(["browser:tab-2", "browser:tab-1"]));

  // Out of the panel the zones show. Escape hides them, and the release changes nothing: no
  // pane, and no stock reorder to the edge of the strip.
  const area = chatArea();
  const from = centerOf(tabOf("browser:tab-2"));
  await press(from);
  await mouse("mouseMoved", { x: from.x - 10, y: from.y + 10 });
  await mouse("mouseMoved", { x: area.left + 40, y: (area.top + area.bottom) / 2 });
  await vi.waitFor(() => expect(zone()).toBe("left"));
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(overlay()).toBeNull());
  await mouse("mouseReleased", { x: area.left + 40, y: (area.top + area.bottom) / 2 });
  expect(tabShapes()).toEqual([LEFT.id]);
  expect(panelSurfaceIds(LEFT)).toEqual(["browser:tab-2", "browser:tab-1"]);

  // A drop on the left side of its own pane: a browser pane of that tab opens there. The tab
  // that the panel showed is the tab of the pane, so the panel closes: one webview for a tab.
  await press(centerOf(tabOf("browser:tab-1")));
  const start = centerOf(tabOf("browser:tab-1"));
  await mouse("mouseMoved", { x: start.x - 10, y: start.y + 10 });
  await mouse("mouseMoved", { x: area.left + 40, y: (area.top + area.bottom) / 2 });
  await vi.waitFor(() => expect(zone()).toBe("left"));
  await mouse("mouseReleased", { x: area.left + 40, y: (area.top + area.bottom) / 2 });
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: [`${LEFT.id}*`, LEFT.id] }]));
  expect(overlay()).toBeNull();
  expect(readThreadPreviewState(refOf(LEFT)).activeTabId).toBe("tab-1");
  expect(panelOpen(LEFT)).toBe(false);
  // The tab stays in the strip of the thread: opening the panel again is the way back.
  expect(panelSurfaceIds(LEFT)).toEqual(["browser:tab-2", "browser:tab-1"]);
  await expect.element(page.getByText("Browser", { exact: true })).toBeVisible();
});

it("drags a side chat tab out to a chat pane of the side chat, and with the switch off drags nothing out", async () => {
  using _setup = setup(createInitialLayout(targetOf(LEFT)));
  await page.viewport(1280, 800);
  await using _app = await openApp();

  await userEvent.click(linkOf(LEFT, "first"));
  await vi.waitFor(() => expect(panelSurfaceIds(LEFT)).toEqual(["browser:tab-1"]));
  await act(() => useRightPanelStore.getState().openSideChat(refOf(LEFT), SIDE.id));
  await vi.waitFor(() =>
    expect(panelSurfaceIds(LEFT)).toEqual(["browser:tab-1", `side-chat:${SIDE.id}`]),
  );
  const sideTab = () => tabOf(`side-chat:${SIDE.id}`);
  const area = chatArea();

  // A second Escape outside the panel cancels the stock drag too. The release must not skip a
  // later stock reorder of a tab that does not drag out.
  const sideFrom = centerOf(sideTab());
  await press(sideFrom);
  await mouse("mouseMoved", { x: sideFrom.x - 10, y: sideFrom.y + 10 });
  await mouse("mouseMoved", { x: area.left + 40, y: area.bottom - 120 });
  await vi.waitFor(() => expect(overlay()).not.toBeNull());
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(overlay()).toBeNull());
  await userEvent.keyboard("{Escape}");
  await mouse("mouseReleased", { x: area.left + 40, y: area.bottom - 120 });
  expect(panelSurfaceIds(LEFT)).toEqual(["browser:tab-1", `side-chat:${SIDE.id}`]);
  // The cancelled tab slides back to its place before the next press is aimed.
  await vi.waitFor(() => expect(getComputedStyle(sideTab()).transform).toBe("none"));

  // The switch off: no tab is marked, the stock reorder works, and a drag out of the panel
  // shows no zone.
  await act(() => useReadoutSettingsStore.getState().setReadoutSetting("browserPanes", false));
  await vi.waitFor(() => expect(document.querySelector("[data-right-panel-surface]")).toBeNull());
  const tabs = one("[data-right-panel-tab-list]");
  const [browserAt, sideAt] = [...tabs.querySelectorAll("[data-active-tab]")].map(centerOf);
  await press(browserAt!);
  await mouse("mouseMoved", { x: browserAt!.x + 10, y: browserAt!.y });
  await mouse("mouseMoved", { x: sideAt!.x + 30, y: sideAt!.y });
  await mouse("mouseReleased", { x: sideAt!.x + 30, y: sideAt!.y });
  await vi.waitFor(() =>
    expect(panelSurfaceIds(LEFT)).toEqual([`side-chat:${SIDE.id}`, "browser:tab-1"]),
  );
  const lastAt = centerOf([...tabs.querySelectorAll("[data-active-tab]")].at(-1)!);
  await press(lastAt);
  await mouse("mouseMoved", { x: lastAt.x - 10, y: lastAt.y + 10 });
  await mouse("mouseMoved", { x: area.left + 40, y: area.bottom - 120 });
  expect(overlay()).toBeNull();
  await mouse("mouseReleased", { x: area.left + 40, y: area.bottom - 120 });
  expect(tabShapes()).toEqual([LEFT.id]);
  await act(() => useReadoutSettingsStore.getState().setReadoutSetting("browserPanes", true));

  // The new-tab zone: the side chat opens as a chat pane of its own tab, and leaves the panel.
  await vi.waitFor(() => expect(sideTab()).toBeTruthy());
  const from = centerOf(sideTab());
  await press(from);
  await mouse("mouseMoved", { x: from.x - 10, y: from.y + 10 });
  await mouse("mouseMoved", { x: area.left + 40, y: area.bottom - 120 });
  const newTab = await vi.waitFor(() => one("[data-pane-drop-new-tab]"));
  await mouse("mouseMoved", centerOf(newTab));
  await vi.waitFor(() => expect(newTab.className).toContain("border-primary"));
  await mouse("mouseReleased", centerOf(newTab));
  await vi.waitFor(() => expect(tabShapes()).toEqual([LEFT.id, SIDE.id]));
  const { layout } = usePaneStore.getState();
  expect(layout.activeTabId).toBe(layout.tabs[1]!.id);
  expect(panelSurfaceIds(LEFT)).toEqual(["browser:tab-1"]);
  await expect.element(page.getByText(`Answer 0 for ${SIDE.id}.`)).toBeVisible();
});

it("opens a new tab on a drop on the empty end of the tab strip", async () => {
  using _setup = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp();
  await expect.element(linkOf(RIGHT, "first")).toBeVisible();

  // The header of the right chat pane moves it.
  const header = one(
    `[data-splitpane-cell="${listLeaves(getActiveTab(usePaneStore.getState().layout).root)[1]!.id}"] [data-chat-header]`,
  );
  const box = header.getBoundingClientRect();
  let from = { x: box.right - 4, y: box.top + box.height / 2 };
  for (let x = box.right - 4; x > box.left; x -= 4) {
    const hit = document.elementFromPoint(x, from.y);
    if (hit !== null && header.contains(hit) && hit.closest("button, a, input") === null) {
      from = { x, y: from.y };
      break;
    }
  }
  const list = one("[data-pane-tablist]").getBoundingClientRect();
  const lastTab = [...document.querySelectorAll("[data-pane-tab]")].at(-1)!.getBoundingClientRect();
  const end = { x: (lastTab.right + list.right) / 2, y: lastTab.top + lastTab.height / 2 };
  await press(from);
  await mouse("mouseMoved", { x: from.x - 12, y: from.y + 12 });
  await mouse("mouseMoved", end);
  await vi.waitFor(() => expect(zone()).toBe("new-tab"));
  const zoneBox = boxOf(one("[data-pane-drop-zone]"));
  expect(zoneBox.left).toBeCloseTo(lastTab.right, 0);
  expect(zoneBox.left + zoneBox.width).toBeCloseTo(list.right, 0);
  await mouse("mouseReleased", end);
  await vi.waitFor(() => expect(tabShapes()).toEqual([LEFT.id, RIGHT.id]));
  expect(overlay()).toBeNull();

  // A drop on a tab keeps its meaning: the pane goes to that tab.
  const back = one(`[data-splitpane-cell] [data-chat-header]`).getBoundingClientRect();
  let handle = { x: back.right - 4, y: back.top + back.height / 2 };
  for (let x = back.right - 4; x > back.left; x -= 4) {
    const hit = document.elementFromPoint(x, handle.y);
    if (
      hit !== null &&
      hit.closest("[data-chat-header]") &&
      hit.closest("button, a, input") === null
    ) {
      handle = { x, y: handle.y };
      break;
    }
  }
  const firstTab = centerOf(one("[data-pane-tab]"));
  await press(handle);
  await mouse("mouseMoved", { x: handle.x - 12, y: handle.y + 12 });
  await mouse("mouseMoved", firstTab);
  await vi.waitFor(() => expect(zone()).toBe("tab"));
  await mouse("mouseReleased", firstTab);
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]));
});

it("gives the floating preview a hold bar on its top edge that moves it, and none with the switch off", async () => {
  using _setup = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp();
  await expect.element(linkOf(RIGHT, "first")).toBeVisible();

  // Each pane is narrow, so the link opens the floating preview.
  await userEvent.click(linkOf(LEFT, "first"));
  const player = await vi.waitFor(() => one("[data-preview-mini-player]"));
  const bar = player.querySelector<HTMLElement>(":scope > div")!;
  await vi.waitFor(() => {
    const frame = boxOf(player);
    expect(boxOf(bar)).toEqual({
      left: frame.left,
      top: frame.top - 16,
      width: frame.width,
      height: 16,
    });
  });
  expect(getComputedStyle(bar, "::before").content).not.toBe("none");
  expect(getComputedStyle(bar).cursor).toBe("grab");

  // A press on the bar and a move inside the pane is the stock move.
  const before = boxOf(player);
  const at = { x: before.left + 30, y: before.top - 8 };
  await press(at);
  await mouse("mouseMoved", { x: at.x - 20, y: at.y + 4 });
  await mouse("mouseMoved", { x: at.x - 40, y: at.y + 8 });
  expect(overlay()).toBeNull();
  await mouse("mouseReleased", { x: at.x - 40, y: at.y + 8 });
  await vi.waitFor(() => expect(boxOf(player).left).toBeLessThan(before.left - 30));
  const floating = usePreviewMiniPlayerStore.getState().byThreadKey[scopedThreadKey(refOf(LEFT))];
  expect(floating?.lastInteraction).toBe("drag");

  // The pointer on the bar shows the stock button row, and a real click on its close button
  // closes the floating preview: no resize handle covers the row.
  const moved = boxOf(player);
  await hover({ x: moved.left + moved.width / 2, y: moved.top - 8 });
  const close = one<HTMLButtonElement>(
    '[data-preview-mini-player] button[aria-label="Close floating preview"]',
  );
  await vi.waitFor(() => expect(getComputedStyle(close.parentElement!).pointerEvents).toBe("auto"));
  const closeAt = centerOf(close);
  await hover(closeAt);
  expect(close.contains(document.elementFromPoint(closeAt.x, closeAt.y))).toBe(true);
  await mouse("mousePressed", closeAt);
  await mouse("mouseReleased", closeAt);
  await vi.waitFor(() => expect(document.querySelector("[data-preview-mini-player]")).toBeNull());

  // The switch off: the stock dot of 12 px.
  await act(() =>
    useReadoutSettingsStore.getState().setReadoutSetting("largeFloatingPreview", false),
  );
  await userEvent.click(linkOf(RIGHT, "first"));
  const stock = await vi.waitFor(() => one("[data-preview-mini-player]"));
  const dot = stock.querySelector<HTMLElement>(":scope > div")!;
  expect(boxOf(dot)).toMatchObject({ width: 12, height: 12 });
  expect(getComputedStyle(dot, "::before").content).toBe("none");
});

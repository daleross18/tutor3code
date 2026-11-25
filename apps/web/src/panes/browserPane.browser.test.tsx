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
import { useBrowserSurfaceStore } from "~/browser/browserSurfaceStore";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { browserMiniPlayerSource, usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import { readThreadPreviewState, resetPreviewStateForTests } from "~/previewStateStore";
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
import { artifactLinkHost } from "./openArtifactLink";
import { browserPaneHost } from "./paneBrowserActions";
import { usePaneStore } from "./paneStore";
import {
  createBrowserLeaf,
  createInitialLayout,
  getActiveTab,
  insertLeaf,
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

const MODEL = "claude-opus-4-6";
const ACCOUNT = ProviderInstanceId.make(CLAUDE_PROVIDER.instanceId);

/** A thread of a Claude account whose answer holds an artifact link. */
function artifactThread(name: string, url: string): FakeThread {
  const thread = threadWithHistory(name, 1, { instanceId: ACCOUNT, model: MODEL });
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
const LEFT = artifactThread("browser-left", LEFT_URL);
const RIGHT = artifactThread("browser-right", RIGHT_URL);

const refOf = (thread: FakeThread) => scopeThreadRef(ENVIRONMENT_ID, thread.id);
const targetOf = (thread: FakeThread) => ({ kind: "server", threadRef: refOf(thread) }) as const;
const linkOf = (thread: FakeThread) => page.getByRole("link", { name: `report of ${thread.id}` });
const floatingOf = (thread: FakeThread) =>
  usePreviewMiniPlayerStore.getState().byThreadKey[scopedThreadKey(refOf(thread))];

/** LEFT and RIGHT side by side. Each pane is too narrow for the right panel. */
function twoPaneLayout(): PaneLayout {
  const layout = createInitialLayout(targetOf(LEFT));
  const first = getActiveTab(layout).focusedPaneId;
  let tab = splitLeaf(getActiveTab(layout), first, "right");
  const added = listLeaves(tab.root).find((leaf) => leaf.id !== first)!;
  tab = setLeafTarget(tab, added.id, targetOf(RIGHT));
  return replaceTab(layout, { ...tab, focusedPaneId: first });
}

/** A desktop app with a browser, and a server that opens each tab it is asked for. */
function setup(layout: PaneLayout, desktop = true) {
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
  const environment = installFakeEnvironment([LEFT, RIGHT], { providers: [CLAUDE_PROVIDER] });
  const opened: PreviewOpenInput[] = [];
  const openAnswer = answerRpc(WS_METHODS.previewOpen, (input: PreviewOpenInput) => {
    opened.push(input);
    return Effect.succeed({
      threadId: input.threadId,
      tabId: `tab-${opened.length}`,
      navStatus: { _tag: "Loading", url: input.url, title: "" },
      canGoBack: false,
      canGoForward: false,
      profileId: input.profileId,
      updatedAt: `2026-11-20T10:00:0${opened.length}.000Z`,
    });
  });
  const closed: unknown[] = [];
  const closeAnswer = answerRpc(WS_METHODS.previewClose, (input: unknown) => {
    closed.push(input);
    return Effect.undefined;
  });
  // The stock app takes a `window.desktopBridge` for the whole desktop bridge, so the test
  // answers the two questions that the fork asks about it.
  const stock = [artifactLinkHost.browserAvailable, browserPaneHost.available] as const;
  if (desktop) {
    artifactLinkHost.browserAvailable = () => true;
    browserPaneHost.available = () => true;
  }
  // A click that the app does not use would leave the test page.
  const blockNavigation = (event: MouseEvent) => {
    if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
  };
  window.addEventListener("click", blockNavigation);
  return {
    opened,
    closed,
    [Symbol.dispose]: () => {
      window.removeEventListener("click", blockNavigation);
      [artifactLinkHost.browserAvailable, browserPaneHost.available] = stock;
      closeAnswer[Symbol.dispose]();
      openAnswer[Symbol.dispose]();
      environment[Symbol.dispose]();
    },
  };
}

async function openApp(thread: FakeThread = LEFT) {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(await render(<AppRoot router={router} />, { router: false }));
  await expect.element(linkOf(thread)).toBeVisible();
  return stack.move();
}

/** A real mouse, so pointer capture and hover act as they do for a user. */
function mouse(type: "mousePressed" | "mouseMoved" | "mouseReleased", x: number, y: number) {
  const frame = window.frameElement?.getBoundingClientRect();
  return cdp().send("Input.dispatchMouseEvent", {
    type,
    x: x + (frame?.left ?? 0),
    y: y + (frame?.top ?? 0),
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
  });
}
function hover(x: number, y: number) {
  const frame = window.frameElement?.getBoundingClientRect();
  return cdp().send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: x + (frame?.left ?? 0),
    y: y + (frame?.top ?? 0),
    button: "none",
    buttons: 0,
  });
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
const cellOf = (thread: FakeThread) => {
  const leaf = listLeaves(getActiveTab(usePaneStore.getState().layout).root).find(
    (candidate) =>
      candidate.view === undefined &&
      candidate.target?.kind === "server" &&
      candidate.target.threadRef.threadId === thread.id,
  );
  return one(`[data-splitpane-cell="${leaf?.id}"]`);
};
const playerOf = (thread: FakeThread) =>
  cellOf(thread).querySelector<HTMLElement>("[data-preview-mini-player]");

/** Leaf kinds of the active tab as nested arrays: the thread id, with `*` on a browser pane. */
function shape(node: PaneNode): unknown {
  if (node.kind === "split") return { [node.axis]: node.children.map(shape) };
  const threadId = node.target?.kind === "server" ? node.target.threadRef.threadId : "none";
  return node.view === "browser" ? `${threadId}*` : threadId;
}
const tabShapes = () => usePaneStore.getState().layout.tabs.map((tab) => shape(tab.root));

async function openFloatingPreview(thread: FakeThread) {
  await userEvent.click(linkOf(thread));
  await vi.waitFor(() => expect(playerOf(thread)).not.toBeNull());
  return playerOf(thread)!;
}

/** Moves the real pointer onto the grip of the floating preview's button row and presses. */
async function pressPreviewGrip(player: HTMLElement) {
  const dot = centerOf(player.querySelector(":scope > div")!);
  await hover(dot.x, dot.y);
  const grip = player.querySelector<HTMLElement>("[data-preview-drag-grip]")!;
  await vi.waitFor(() => expect(getComputedStyle(grip.parentElement!).pointerEvents).toBe("auto"));
  const at = centerOf(grip);
  await hover(at.x, at.y);
  await mouse("mousePressed", at.x, at.y);
  return at;
}

it("starts the floating preview of an artifact link large, and its grip changes the size in a pane", async () => {
  using _setup = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp();
  await expect.element(linkOf(RIGHT)).toBeVisible();

  const player = await openFloatingPreview(LEFT);
  const canvas = cellOf(LEFT).querySelector("[data-chat-canvas]")!;
  // About 70% of the pane, and taller than wide. Stock gives 320 x 200 here.
  await vi.waitFor(() => {
    const frame = boxOf(player);
    expect(Math.abs(frame.width - canvas.clientWidth * 0.7)).toBeLessThanOrEqual(1);
    expect(frame.height).toBeGreaterThan(frame.width);
  });
  const large = boxOf(player);
  // The page has the size of the frame, so it shows at its real size.
  const fittedOf = () =>
    Object.values(useBrowserSurfaceStore.getState().byTabId).find((entry) => entry.fitSourceContent)
      ?.fittedSourceContent;
  expect(fittedOf()).toMatchObject({
    width: Math.max(390, large.width),
    scale: 1,
  });

  // The stock corner handle is larger and shows a grip.
  const grip = player.querySelector<HTMLElement>('[data-preview-mini-player-resize="southeast"]')!;
  expect(boxOf(grip)).toMatchObject({ width: 26, height: 26 });
  expect(getComputedStyle(grip, "::after").content).not.toBe("none");
  expect(getComputedStyle(grip).cursor).toBe("nwse-resize");

  // A real drag of the grip makes the frame smaller, in a pane, and keeps its shape.
  const at = centerOf(grip);
  await mouse("mousePressed", at.x, at.y);
  await mouse("mouseMoved", at.x - 40, at.y - 50);
  await mouse("mouseMoved", at.x - 80, at.y - 100);
  await mouse("mouseReleased", at.x - 80, at.y - 100);
  await vi.waitFor(() => expect(boxOf(player).width).toBeLessThan(large.width - 40));
  const small = boxOf(player);
  expect(Math.abs(small.width / small.height - large.width / large.height)).toBeLessThan(0.02);
  expect(floatingOf(LEFT)).toMatchObject({ width: small.width, lastInteraction: "resize" });
  // The page follows the frame, and is never narrower than a phone page.
  await vi.waitFor(() =>
    expect(fittedOf()).toMatchObject({ width: Math.max(390, small.width), scale: 1 }),
  );

  // The setting off: the next floating preview has the stock size and no grip.
  await act(() =>
    useReadoutSettingsStore.getState().setReadoutSetting("largeFloatingPreview", false),
  );
  const stock = await openFloatingPreview(RIGHT);
  await vi.waitFor(() => expect(boxOf(stock)).toMatchObject({ width: 320, height: 200 }));
  const stockHandle = stock.querySelector('[data-preview-mini-player-resize="southeast"]')!;
  expect(boxOf(stockHandle)).toMatchObject({ width: 16, height: 16 });
  expect(getComputedStyle(stockHandle, "::after").content).toBe("none");
});

it("shows drop zones while the floating preview is dragged out of its pane, and drops it as a browser pane", async () => {
  using app = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp();
  await expect.element(linkOf(RIGHT)).toBeVisible();

  const player = await openFloatingPreview(LEFT);
  const other = boxOf(cellOf(RIGHT));
  const overlay = () => document.querySelector("[data-pane-drop-overlay]");
  const zone = () => document.querySelector<HTMLElement>("[data-pane-drop-zone]");

  // Inside its own pane the drag is the stock move: no zone shows.
  const start = await pressPreviewGrip(player);
  await mouse("mouseMoved", start.x - 20, start.y + 10);
  expect(overlay()).toBeNull();

  // Outside it, the side of the pane under the pointer shows as the half that the pane takes.
  await mouse("mouseMoved", other.left + other.width - 40, other.top + other.height / 2);
  await vi.waitFor(() => expect(zone()?.dataset.paneDropZone).toBe("right"));
  expect(boxOf(zone()!)).toEqual({
    ...other,
    left: other.left + other.width / 2,
    width: other.width / 2,
  });
  await mouse("mouseMoved", other.left + 30, other.top + other.height / 2);
  await vi.waitFor(() => expect(zone()?.dataset.paneDropZone).toBe("left"));
  await mouse("mouseMoved", other.left + other.width / 2, other.top + 40);
  await vi.waitFor(() => expect(zone()?.dataset.paneDropZone).toBe("up"));

  // A tab of the tab strip, and the zone for a new tab.
  const tabChip = centerOf(one("[data-pane-tab]"));
  await mouse("mouseMoved", tabChip.x, tabChip.y);
  await vi.waitFor(() => expect(zone()?.dataset.paneDropZone).toBe("tab"));
  const newTab = one("[data-pane-drop-new-tab]");
  await mouse("mouseMoved", centerOf(newTab).x, centerOf(newTab).y);
  await vi.waitFor(() => expect(newTab.className).toContain("border-primary"));
  expect(zone()).toBeNull();

  // Escape cancels: the zones go, and the release drops nothing.
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(overlay()).toBeNull());
  await mouse("mouseMoved", other.left + other.width - 40, other.top + other.height / 2);
  expect(overlay()).toBeNull();
  await mouse("mouseReleased", other.left + other.width - 40, other.top + other.height / 2);
  expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]);
  expect(floatingOf(LEFT)).toBeDefined();

  // A second drag, released on the lower part of the other pane: that pane splits, and the new
  // pane shows the browser of the thread.
  await pressPreviewGrip(playerOf(LEFT)!);
  await mouse("mouseMoved", other.left + other.width / 2, other.top + other.height - 60);
  await vi.waitFor(() => expect(zone()?.dataset.paneDropZone).toBe("down"));
  await mouse("mouseReleased", other.left + other.width / 2, other.top + other.height - 60);
  await vi.waitFor(() =>
    expect(tabShapes()).toEqual([{ row: [LEFT.id, { column: [RIGHT.id, `${LEFT.id}*`] }] }]),
  );
  expect(overlay()).toBeNull();
  const pane = one("[data-pane-browser]");
  expect(pane.querySelector("[data-pane-browser-header]")!.textContent).toContain("Browser");
  expect(boxOf(pane.closest("[data-splitpane-cell]")!)).toMatchObject({
    left: other.left,
    width: other.width,
  });
  // One webview exists for a tab: the floating preview of the thread closed.
  expect(floatingOf(LEFT)).toBeUndefined();
  expect(readThreadPreviewState(refOf(LEFT)).activeTabId).toBe("tab-1");

  // A second click on the link shows in the browser pane: no floating preview, no new tab.
  await userEvent.click(linkOf(LEFT));
  expect(app.opened).toHaveLength(1);
  expect(floatingOf(LEFT)).toBeUndefined();
  expect(
    useRightPanelStore.getState().byThreadKey[scopedThreadKey(refOf(LEFT))]?.isOpen ?? false,
  ).toBe(false);
});

it("opens, moves and closes a browser pane by its buttons and its header, and keeps the browser tab", async () => {
  using app = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp();
  await expect.element(linkOf(RIGHT)).toBeVisible();

  const player = await openFloatingPreview(LEFT);
  const pillButton = (label: string) =>
    one<HTMLButtonElement>(`[data-preview-mini-player] button[aria-label="${label}"]`);
  // The button row shows on hover, so the test presses its buttons in the DOM.
  expect(player.contains(pillButton("Open in a split pane"))).toBe(true);
  await act(() => pillButton("Open in a split pane").click());
  // The left pane is taller than wide, so the browser opens under the chat.
  await vi.waitFor(() =>
    expect(tabShapes()).toEqual([{ row: [{ column: [LEFT.id, `${LEFT.id}*`] }, RIGHT.id] }]),
  );
  expect(floatingOf(LEFT)).toBeUndefined();

  // "Back to floating preview": the pane closes and the chat pane of the thread shows the page.
  await userEvent.click(page.getByRole("button", { name: "Back to floating preview" }));
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]));
  expect(floatingOf(LEFT)?.source).toEqual(browserMiniPlayerSource("tab-1"));
  await vi.waitFor(() => expect(playerOf(LEFT)).not.toBeNull());

  // "Move to a new tab".
  await act(() => pillButton("Move to a new tab").click());
  await vi.waitFor(() =>
    expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }, `${LEFT.id}*`]),
  );
  expect(usePaneStore.getState().layout.activeTabId).toBe(
    usePaneStore.getState().layout.tabs[1]!.id,
  );
  await expect.element(page.getByText("Browser", { exact: true })).toBeVisible();
  expect(document.querySelectorAll("[data-pane-tab]")).toHaveLength(2);

  // The header is the drag handle: a drop on the first tab moves the pane to its right edge.
  const header = centerOf(one("[data-pane-browser-header] span"));
  const firstTab = centerOf(one("[data-pane-tab]"));
  await hover(header.x, header.y);
  await mouse("mousePressed", header.x, header.y);
  await mouse("mouseMoved", header.x + 20, header.y + 20);
  await mouse("mouseMoved", firstTab.x, firstTab.y);
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLElement>("[data-pane-drop-zone]")?.dataset.paneDropZone).toBe(
      "tab",
    ),
  );
  await mouse("mouseReleased", firstTab.x, firstTab.y);
  await vi.waitFor(() =>
    expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id, `${LEFT.id}*`] }]),
  );
  expect(document.querySelector("[data-pane-drop-overlay]")).toBeNull();

  // A drag of the header to the left part of the first pane puts the pane on that side.
  const first = boxOf(cellOf(LEFT));
  const handle = centerOf(one("[data-pane-browser-header] span"));
  await hover(handle.x, handle.y);
  await mouse("mousePressed", handle.x, handle.y);
  await mouse("mouseMoved", handle.x - 20, handle.y + 20);
  await mouse("mouseMoved", first.left + 20, first.top + first.height / 2);
  await mouse("mouseReleased", first.left + 20, first.top + first.height / 2);
  await vi.waitFor(() =>
    expect(tabShapes()).toEqual([{ row: [`${LEFT.id}*`, LEFT.id, RIGHT.id] }]),
  );

  // Closing the pane leaves the browser tab of the thread open.
  await userEvent.click(page.getByRole("button", { name: "Close browser pane" }));
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]));
  expect(app.closed).toEqual([]);
  expect(Object.keys(readThreadPreviewState(refOf(LEFT)).sessions)).toEqual(["tab-1"]);
});

it("opens a browser pane from the one pane of the stock layout", async () => {
  using _setup = setup(createInitialLayout(targetOf(LEFT)));
  await page.viewport(1280, 800);
  await using _app = await openApp();

  // The one pane is wide, so the link opens the right panel. The stock button of the panel
  // floats the tab: here the test asks the stock store for the same.
  await userEvent.click(linkOf(LEFT));
  await vi.waitFor(() => expect(readThreadPreviewState(refOf(LEFT)).activeTabId).toBe("tab-1"));
  await act(() => {
    useRightPanelStore.getState().close(refOf(LEFT));
    usePreviewMiniPlayerStore.getState().open(refOf(LEFT), browserMiniPlayerSource("tab-1"));
  });
  await vi.waitFor(() =>
    expect(document.querySelector("[data-preview-mini-player]")).not.toBeNull(),
  );

  await act(() =>
    one<HTMLButtonElement>(
      '[data-preview-mini-player] button[aria-label="Open in a split pane"]',
    ).click(),
  );
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: [LEFT.id, `${LEFT.id}*`] }]));
  await expect.element(page.getByText("Browser", { exact: true })).toBeVisible();
  expect(floatingOf(LEFT)).toBeUndefined();
  // The tab bar shows, and the chat of the thread stays beside its browser.
  expect(document.querySelectorAll("[data-pane-tab]")).toHaveLength(1);
  await expect.element(linkOf(LEFT)).toBeVisible();
});

it("shows the chat of the thread in a browser pane where the client has no desktop browser", async () => {
  const layout = createInitialLayout(targetOf(RIGHT));
  const tab = getActiveTab(layout);
  const withBrowser = insertLeaf(tab, tab.focusedPaneId, "right", createBrowserLeaf(refOf(LEFT)));
  using _setup = setup(replaceTab(layout, withBrowser), false);
  await page.viewport(1280, 800);
  await using _app = await openApp(RIGHT);

  await expect.element(linkOf(LEFT)).toBeVisible();
  expect(document.querySelector("[data-pane-browser]")).toBeNull();
  // The stored pane keeps its kind, for the desktop app.
  expect(tabShapes()).toEqual([{ row: [RIGHT.id, `${LEFT.id}*`] }]);
});

import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { cdp, page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";
import { usePaneStore } from "./paneStore";
import {
  addTab,
  createInitialLayout,
  createTab,
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

// The fake environment does not serve project files, and a new draft waits for that read.
vi.mock(import("~/lib/t3ProjectFileDefaults"), () => ({
  readT3ProjectFile: () => Promise.resolve(null),
}));

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const LEFT = threadWithHistory("drag-left", 1);
const RIGHT = threadWithHistory("drag-right", 1);
const THIRD = threadWithHistory("drag-third", 1);

const targetOf = (thread: FakeThread) =>
  ({ kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, thread.id) }) as const;

/** LEFT and RIGHT side by side, with focus on LEFT. */
function twoPaneLayout(): PaneLayout {
  const layout = createInitialLayout(targetOf(LEFT));
  const first = getActiveTab(layout).focusedPaneId;
  let tab = splitLeaf(getActiveTab(layout), first, "right");
  const added = listLeaves(tab.root).find((leaf) => leaf.id !== first)!;
  tab = setLeafTarget(tab, added.id, targetOf(RIGHT));
  return replaceTab(layout, { ...tab, focusedPaneId: first });
}

function setup(layout: PaneLayout) {
  usePaneStore.setState({ layout, lastRouteKey: null, fillingPaneIds: [] });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  return installFakeEnvironment([LEFT, RIGHT, THIRD]);
}

async function openApp(panes: number) {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${LEFT.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(await render(<AppRoot router={router} />, { router: false }));
  await expect.element(page.getByText(`Answer 0 for ${LEFT.id}.`)).toBeVisible();
  await vi.waitFor(() => {
    expect(document.querySelectorAll("[data-chat-header]")).toHaveLength(panes);
    expect(document.querySelectorAll('[data-testid="composer-editor"]')).toHaveLength(panes);
  });
  return stack.move();
}

/** A real mouse, so pointer capture, focus and the click act as they do for a user. */
function mouse(
  type: "mousePressed" | "mouseMoved" | "mouseReleased",
  at: { x: number; y: number },
  held = true,
) {
  const frame = window.frameElement?.getBoundingClientRect();
  const pressed = held && type !== "mouseReleased";
  return cdp().send("Input.dispatchMouseEvent", {
    type,
    x: at.x + (frame?.left ?? 0),
    y: at.y + (frame?.top ?? 0),
    button: held ? "left" : "none",
    buttons: pressed ? 1 : 0,
    clickCount: 1,
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
const cellOf = (thread: FakeThread) => {
  const leaf = listLeaves(getActiveTab(usePaneStore.getState().layout).root).find(
    (candidate) =>
      candidate.target?.kind === "server" && candidate.target.threadRef.threadId === thread.id,
  );
  return one(`[data-splitpane-cell="${leaf?.id}"]`);
};
const composerOf = (thread: FakeThread) =>
  cellOf(thread).querySelector<HTMLElement>('[data-testid="composer-editor"]')!;
const titleButtonOf = (thread: FakeThread) =>
  cellOf(thread).querySelector<HTMLElement>('[data-chat-header] button[aria-haspopup="menu"]')!;

/** A point of the pane's header that no control covers, as far right as the header has one. */
function handleOfCell(cell: Element) {
  const header = cell.querySelector("[data-chat-header]")!;
  const box = header.getBoundingClientRect();
  const y = box.top + box.height / 2;
  for (let x = box.right - 2; x > box.left; x -= 4) {
    const hit = document.elementFromPoint(x, y);
    if (hit !== null && header.contains(hit) && hit.closest("button, a, input") === null) {
      return { x, y };
    }
  }
  throw new Error("The header has no free area");
}
const handleOf = (thread: FakeThread) => handleOfCell(cellOf(thread));

/** Thread ids of each tab as nested arrays, with `draft` for a draft. */
function shape(node: PaneNode): unknown {
  if (node.kind === "split") return { [node.axis]: node.children.map(shape) };
  return node.target?.kind === "server"
    ? node.target.threadRef.threadId
    : (node.target?.kind ?? "none");
}
const tabShapes = () => usePaneStore.getState().layout.tabs.map((tab) => shape(tab.root));
const overlay = () => document.querySelector("[data-pane-drop-overlay]");
const zone = () => document.querySelector<HTMLElement>("[data-pane-drop-zone]")?.dataset;

/** Presses the handle of the pane and moves far enough for the zones to show. */
async function startDrag(thread: FakeThread | Element) {
  const from = thread instanceof Element ? handleOfCell(thread) : handleOf(thread);
  await mouse("mouseMoved", from, false);
  await mouse("mousePressed", from);
  await mouse("mouseMoved", { x: from.x - 12, y: from.y + 12 });
  await vi.waitFor(() => expect(overlay()).not.toBeNull());
}

async function dropAt(at: { x: number; y: number }, expectedZone: string) {
  await mouse("mouseMoved", at);
  await vi.waitFor(() => expect(zone()?.paneDropZone).toBe(expectedZone));
  await mouse("mouseReleased", at);
}

it("moves a chat pane by its header to a side of another pane, and keeps its view, text and focus", async () => {
  using _environment = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp(2);

  await userEvent.click(composerOf(LEFT));
  await userEvent.keyboard("kept");
  const composer = composerOf(LEFT);
  expect(cellOf(LEFT).dataset.paneDraggable).toBe("true");
  expect(getComputedStyle(one("[data-chat-header]")).cursor).toBe("grab");
  // The header keeps room after the title, so a long title leaves a place to take hold.
  expect(getComputedStyle(one("[data-chat-header] > .flex-1")).marginRight).toBe("20px");

  // A drop on the pane itself is no zone, and changes nothing.
  await startDrag(LEFT);
  const own = cellOf(LEFT).getBoundingClientRect();
  await mouse("mouseMoved", { x: own.left + 30, y: own.top + own.height / 2 });
  expect(zone()).toBeUndefined();
  await mouse("mouseReleased", { x: own.left + 30, y: own.top + own.height / 2 });
  await vi.waitFor(() => expect(overlay()).toBeNull());
  expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]);

  // The right half of the other pane.
  await startDrag(LEFT);
  const other = cellOf(RIGHT).getBoundingClientRect();
  await dropAt({ x: other.right - 40, y: other.top + other.height / 2 }, "right");
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: [RIGHT.id, LEFT.id] }]));
  expect(overlay()).toBeNull();
  // The chat view was not mounted again: the composer is the same element, with its caret.
  expect(composerOf(LEFT)).toBe(composer);
  expect(document.activeElement).toBe(composer);
  await userEvent.keyboard(" text");
  expect(composer.textContent).toBe("kept text");

  // The bottom half of the other pane.
  await startDrag(LEFT);
  const above = cellOf(RIGHT).getBoundingClientRect();
  await dropAt({ x: above.left + above.width / 2, y: above.bottom - 40 }, "down");
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ column: [RIGHT.id, LEFT.id] }]));
  expect(composerOf(LEFT)).toBe(composer);
  expect(composer.textContent).toBe("kept text");
});

it("moves a chat pane to a new tab and to a tab of the tab strip, and closes the tab it leaves empty", async () => {
  using _environment = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp(2);

  await userEvent.click(composerOf(LEFT));
  await userEvent.keyboard("moved text");
  const composer = composerOf(LEFT);

  // The new-tab zone: the pane gets a tab of its own, and that tab shows.
  await startDrag(LEFT);
  const newTab = centerOf(one("[data-pane-drop-new-tab]"));
  await mouse("mouseMoved", newTab);
  await mouse("mouseReleased", newTab);
  await vi.waitFor(() => expect(tabShapes()).toEqual([RIGHT.id, LEFT.id]));
  const { layout } = usePaneStore.getState();
  expect(layout.activeTabId).toBe(layout.tabs[1]!.id);
  await vi.waitFor(() => expect(document.querySelectorAll("[data-chat-header]")).toHaveLength(1));
  // The pane kept its id, so its chat view stayed mounted through the change of tab.
  expect(composerOf(LEFT)).toBe(composer);
  expect(composer.textContent).toBe("moved text");
  expect(document.activeElement).toBe(composer);

  // Alone in its tab, the pane still moves: a drop on the first tab closes the empty tab.
  await startDrag(LEFT);
  await dropAt(centerOf(one("[data-pane-tab]")), "tab");
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: [RIGHT.id, LEFT.id] }]));
  await vi.waitFor(() => expect(document.querySelectorAll("[data-chat-header]")).toHaveLength(2));
  expect(composerOf(LEFT)).toBe(composer);
  expect(composer.textContent).toBe("moved text");
});

it("moves a chat pane to a new tab between two tabs, and into a tab on the middle of a tab", async () => {
  const split = twoPaneLayout();
  const withThird = addTab(split, createTab(targetOf(THIRD)));
  using _environment = setup({ ...withThird, activeTabId: split.activeTabId });
  await page.viewport(1280, 800);
  await using _app = await openApp(2);

  await userEvent.click(composerOf(LEFT));
  await userEvent.keyboard("slot text");
  const composer = composerOf(LEFT);

  // The gap between the first and the second tab: a line marks the place of the new tab.
  const tabBoxes = () =>
    [...document.querySelectorAll("[data-pane-tab]")].map((tab) => tab.getBoundingClientRect());
  const [first, second] = tabBoxes();
  const gap = { x: (first!.right + second!.left) / 2, y: first!.top + first!.height / 2 };
  await startDrag(LEFT);
  await dropAt(gap, "tab-slot");
  await vi.waitFor(() => expect(tabShapes()).toEqual([RIGHT.id, LEFT.id, THIRD.id]));
  const { layout } = usePaneStore.getState();
  expect(layout.activeTabId).toBe(layout.tabs[1]!.id);
  expect(overlay()).toBeNull();
  expect(composerOf(LEFT)).toBe(composer);
  expect(composer.textContent).toBe("slot text");

  // The middle of a tab still means "into this tab": the pane joins the third tab, and the
  // tab it leaves closes.
  await startDrag(LEFT);
  const third = tabBoxes()[2]!;
  await dropAt({ x: third.left + third.width / 2, y: third.top + third.height / 2 }, "tab");
  await vi.waitFor(() => expect(tabShapes()).toEqual([RIGHT.id, { row: [THIRD.id, LEFT.id] }]));
  expect(composerOf(LEFT)).toBe(composer);
});

it("moves a pane that shows a draft, with its draft and its text", async () => {
  using _environment = setup(twoPaneLayout());
  await page.viewport(1800, 800);
  await using _app = await openApp(2);

  // The split key gives the new pane a draft thread of its own.
  await userEvent.click(composerOf(LEFT));
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: [LEFT.id, "draft", RIGHT.id] }]));
  const draftLeaf = () =>
    listLeaves(getActiveTab(usePaneStore.getState().layout).root).find(
      (leaf) => leaf.target?.kind === "draft",
    )!;
  const before = draftLeaf();
  const draftCell = () => one(`[data-splitpane-cell="${before.id}"]`);
  await vi.waitFor(() =>
    expect(draftCell().querySelector('[data-testid="composer-editor"]')).not.toBeNull(),
  );
  const composer = draftCell().querySelector<HTMLElement>('[data-testid="composer-editor"]')!;
  await userEvent.click(composer);
  await userEvent.keyboard("draft text");

  await startDrag(draftCell());
  const first = cellOf(LEFT).getBoundingClientRect();
  await dropAt({ x: first.left + 30, y: first.top + first.height / 2 }, "left");
  await vi.waitFor(() => expect(tabShapes()).toEqual([{ row: ["draft", LEFT.id, RIGHT.id] }]));
  expect(draftLeaf()).toBe(before);
  expect(draftCell().querySelector('[data-testid="composer-editor"]')).toBe(composer);
  expect(composer.textContent).toBe("draft text");
  expect(document.activeElement).toBe(composer);
});

it("cancels a drag with Escape, and leaves a press with no move and a press on a button as clicks", async () => {
  using _environment = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp(2);
  const other = cellOf(RIGHT).getBoundingClientRect();
  const overOther = { x: other.right - 40, y: other.top + other.height / 2 };

  // Escape hides the zones, and the release that follows drops nothing.
  await startDrag(LEFT);
  await mouse("mouseMoved", overOther);
  await vi.waitFor(() => expect(zone()?.paneDropZone).toBe("right"));
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(overlay()).toBeNull());
  await mouse("mouseReleased", overOther);
  expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]);

  // A move with no button held, after a release that never reached the window, ends the drag.
  await startDrag(LEFT);
  await mouse("mouseMoved", overOther);
  await vi.waitFor(() => expect(zone()?.paneDropZone).toBe("right"));
  await mouse("mouseMoved", { x: overOther.x - 10, y: overOther.y }, false);
  await vi.waitFor(() => expect(overlay()).toBeNull());
  await mouse("mouseReleased", overOther);
  expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]);

  // A press on the handle with no move shows no zone.
  const handle = handleOf(LEFT);
  await mouse("mouseMoved", handle, false);
  await mouse("mousePressed", handle);
  await mouse("mouseReleased", handle);
  expect(overlay()).toBeNull();

  // The title is a button: a drag from it moves nothing, and a click on it opens its menu.
  const title = centerOf(titleButtonOf(LEFT));
  await mouse("mouseMoved", title, false);
  await mouse("mousePressed", title);
  await mouse("mouseMoved", { x: title.x + 20, y: title.y + 20 });
  await mouse("mouseMoved", overOther);
  expect(overlay()).toBeNull();
  await mouse("mouseReleased", overOther);
  expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]);

  await mouse("mouseMoved", title, false);
  await mouse("mousePressed", title);
  await mouse("mouseReleased", title);
  await expect.element(page.getByRole("menuitem", { name: "Rename thread" })).toBeVisible();
});

it("drags no pane with the setting off, and none in the stock layout of one pane", async () => {
  using _environment = setup(twoPaneLayout());
  useReadoutSettingsStore.setState({ dragPanes: false });
  await page.viewport(1280, 800);
  await using _app = await openApp(2);
  const other = cellOf(RIGHT).getBoundingClientRect();
  const overOther = { x: other.right - 40, y: other.top + other.height / 2 };

  const drag = async () => {
    const from = handleOf(LEFT);
    await mouse("mouseMoved", from, false);
    await mouse("mousePressed", from);
    await mouse("mouseMoved", { x: from.x - 12, y: from.y + 12 });
    await mouse("mouseMoved", overOther);
    const shown = overlay() !== null;
    await mouse("mouseReleased", overOther);
    return shown;
  };
  expect(document.querySelector("[data-pane-draggable]")).toBeNull();
  expect(getComputedStyle(one("[data-chat-header]")).cursor).not.toBe("grab");
  expect(await drag()).toBe(false);
  expect(tabShapes()).toEqual([{ row: [LEFT.id, RIGHT.id] }]);

  // One tab with one pane is the stock layout, with the setting on too.
  useReadoutSettingsStore.setState({ dragPanes: true });
  await vi.waitFor(() =>
    expect(document.querySelectorAll("[data-pane-draggable]")).toHaveLength(2),
  );
  usePaneStore.getState().closePane(cellOf(RIGHT).dataset.splitpaneCell!);
  await vi.waitFor(() => expect(document.querySelectorAll("[data-chat-header]")).toHaveLength(1));
  expect(document.querySelector("[data-pane-draggable]")).toBeNull();
  expect(await drag()).toBe(false);
  expect(tabShapes()).toEqual([LEFT.id]);
});

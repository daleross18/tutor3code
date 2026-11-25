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
  activateTab,
  createInitialLayout,
  createTab,
  getActiveTab,
  replaceTab,
  splitLeaf,
  type PaneLayout,
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

const FIRST = threadWithHistory("tab-first", 1);
const SECOND = threadWithHistory("tab-second", 1);
const THIRD = threadWithHistory("tab-third", 1);

const targetOf = (thread: FakeThread) =>
  ({ kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, thread.id) }) as const;

/** Three tabs of one thread each, with the first tab active. */
function threeTabLayout(): PaneLayout {
  let layout = createInitialLayout(targetOf(FIRST));
  layout = addTab(layout, createTab(targetOf(SECOND)));
  layout = addTab(layout, createTab(targetOf(THIRD)));
  return activateTab(layout, layout.tabs[0]!.id);
}

/** One tab of two panes: the tab bar shows its one tab. */
function oneTabLayout(): PaneLayout {
  const layout = createInitialLayout(targetOf(FIRST));
  const tab = getActiveTab(layout);
  return replaceTab(layout, splitLeaf(tab, tab.focusedPaneId, "right"));
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
  return installFakeEnvironment([FIRST, SECOND, THIRD]);
}

async function openApp(tabs: number) {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${FIRST.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(await render(<AppRoot router={router} />, { router: false }));
  await expect.element(page.getByText(`Answer 0 for ${FIRST.id}.`)).toBeVisible();
  await vi.waitFor(() => expect(tabElements()).toHaveLength(tabs));
  return stack.move();
}

/** A real mouse, so pointer capture and the click act as they do for a user. */
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

const tabElements = () => [...document.querySelectorAll<HTMLElement>("[data-pane-tab]")];
const tabOrder = () => usePaneStore.getState().layout.tabs.map((tab) => tab.id);
const activeTabId = () => usePaneStore.getState().layout.activeTabId;
const tabElement = (tabId: string) => {
  const found = document.querySelector<HTMLElement>(`[data-pane-tab="${tabId}"]`);
  if (found === null) throw new Error(`No tab ${tabId}`);
  return found;
};
/** A point on the title of the tab, away from its close button. */
const titleOf = (tabId: string) => {
  const box = tabElement(tabId).querySelector('[role="tab"]')!.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
const shifted = () => tabElements().filter((element) => element.style.transform !== "");

/** Presses the title of the tab and moves it to `x`, in steps, with the button held. */
async function dragTabTo(tabId: string, x: number) {
  const from = titleOf(tabId);
  await mouse("mouseMoved", from, false);
  await mouse("mousePressed", from);
  for (const step of [0.25, 0.5, 0.75, 1]) {
    await mouse("mouseMoved", { x: from.x + (x - from.x) * step, y: from.y });
  }
  return { x, y: from.y };
}

it("drags the third tab to the first place, and keeps the active tab", async () => {
  using _environment = setup(threeTabLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp(3);
  const [first, second, third] = tabOrder() as [string, string, string];
  expect(activeTabId()).toBe(first);

  const left = tabElement(first).getBoundingClientRect().left;
  const at = await dragTabTo(third, left + 4);
  // The dragged tab follows the pointer, and the two others move aside to show its place.
  await vi.waitFor(() => expect(shifted()).toHaveLength(3));
  expect(tabElement(first).style.transform).toMatch(/^translateX\(\d/);
  expect(tabElement(second).style.transform).toMatch(/^translateX\(\d/);
  expect(tabElement(third).style.transform).toMatch(/^translateX\(-/);
  await mouse("mouseReleased", at);

  await vi.waitFor(() => expect(tabOrder()).toEqual([third, first, second]));
  // The click that ends the drag does not make the dragged tab active.
  expect(activeTabId()).toBe(first);
  expect(shifted()).toHaveLength(0);
  await vi.waitFor(() =>
    expect(tabElements().map((element) => element.dataset.paneTab)).toEqual([third, first, second]),
  );
  await expect.element(page.getByText(`Answer 0 for ${FIRST.id}.`)).toBeVisible();
});

it("activates a tab on a press with no move, and closes it with its close button", async () => {
  using _environment = setup(threeTabLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp(3);
  const [first, second, third] = tabOrder() as [string, string, string];

  const title = titleOf(second);
  await mouse("mouseMoved", title, false);
  await mouse("mousePressed", title);
  await mouse("mouseMoved", { x: title.x + 3, y: title.y });
  await mouse("mouseReleased", { x: title.x + 3, y: title.y });
  await vi.waitFor(() => expect(activeTabId()).toBe(second));
  expect(tabOrder()).toEqual([first, second, third]);

  const close = tabElement(third).querySelector("[data-pane-tab-close] button")!;
  const box = close.getBoundingClientRect();
  const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  await mouse("mouseMoved", at, false);
  await mouse("mousePressed", at);
  await mouse("mouseReleased", at);
  await vi.waitFor(() => expect(tabOrder()).toEqual([first, second]));
  expect(activeTabId()).toBe(second);
});

it("cancels a tab drag with Escape, and the release then neither moves nor activates", async () => {
  using _environment = setup(threeTabLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp(3);
  const [first, second, third] = tabOrder() as [string, string, string];

  const at = await dragTabTo(third, tabElement(first).getBoundingClientRect().left + 4);
  await vi.waitFor(() => expect(shifted()).toHaveLength(3));
  await userEvent.keyboard("{Escape}");
  expect(shifted()).toHaveLength(0);
  await mouse("mouseMoved", { x: at.x + 10, y: at.y });
  expect(shifted()).toHaveLength(0);
  await mouse("mouseReleased", at);
  expect(tabOrder()).toEqual([first, second, third]);
  expect(activeTabId()).toBe(first);

  // A second Escape drag whose release never reaches the window: the next move with no button
  // ends it, so the next click, here on a close button, is a click again.
  await dragTabTo(third, tabElement(first).getBoundingClientRect().left + 4);
  await vi.waitFor(() => expect(shifted()).toHaveLength(3));
  await userEvent.keyboard("{Escape}");
  await mouse("mouseMoved", at, false);
  const box = tabElement(second).querySelector("[data-pane-tab-close] button")!.getBoundingClientRect();
  const close = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  await mouse("mouseMoved", close, false);
  await mouse("mousePressed", close);
  await mouse("mouseReleased", close);
  await vi.waitFor(() => expect(tabOrder()).toEqual([first, third]));
});

it("cancels a tab drag when a tab opens during it", async () => {
  using _environment = setup(threeTabLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp(3);
  const [first] = tabOrder() as [string, string, string];

  const at = await dragTabTo(tabOrder()[2]!, tabElement(first).getBoundingClientRect().left + 4);
  await vi.waitFor(() => expect(shifted()).toHaveLength(3));
  usePaneStore.setState(({ layout }) => ({
    layout: addTab(layout, createTab(targetOf(FIRST))),
  }));
  const opened = tabOrder();
  await vi.waitFor(() => expect(tabElements()).toHaveLength(4));
  expect(shifted()).toHaveLength(0);
  await mouse("mouseReleased", at);
  expect(tabOrder()).toEqual(opened);
});

it("keeps the drop place under the pointer when the strip scrolls during a drag", async () => {
  using _environment = setup(threeTabLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp(3);
  const [first, second, third] = tabOrder() as [string, string, string];
  const list = document.querySelector<HTMLElement>("[data-pane-tablist]")!;
  list.style.maxWidth = `${tabElement(third).getBoundingClientRect().width + 8}px`;
  list.scrollLeft = list.scrollWidth;
  await vi.waitFor(() => expect(list.scrollLeft).toBeGreaterThan(0));

  const from = titleOf(third);
  const at = await dragTabTo(third, from.x - 10);
  await vi.waitFor(() => expect(tabElement(third).style.transform).toMatch(/^translateX\(-/));
  const before = list.scrollLeft;
  list.scrollLeft = 0;
  // The dragged tab stays under the pointer, and the tabs it passed move aside.
  await vi.waitFor(() => {
    const box = tabElement(third).getBoundingClientRect();
    expect(box.left < at.x && at.x < box.right).toBe(true);
    expect(shifted().length).toBeGreaterThan(1);
  });
  expect(before).toBeGreaterThan(0);
  const passed = shifted().length - 1;
  await mouse("mouseReleased", at);
  const placed = [first, second].toSpliced(2 - passed, 0, third);
  await vi.waitFor(() => expect(tabOrder()).toEqual(placed));
});

it("drags no tab with the setting off, and none with one tab", async () => {
  using _environment = setup(threeTabLayout());
  useReadoutSettingsStore.setState({ dragPanes: false });
  await page.viewport(1280, 800);
  await using _app = await openApp(3);
  const [first, second, third] = tabOrder() as [string, string, string];

  const at = await dragTabTo(third, tabElement(first).getBoundingClientRect().left + 4);
  expect(shifted()).toHaveLength(0);
  await mouse("mouseReleased", at);
  expect(tabOrder()).toEqual([first, second, third]);

  useReadoutSettingsStore.setState({ dragPanes: true });
  usePaneStore.setState({ layout: oneTabLayout() });
  await vi.waitFor(() => expect(tabElements()).toHaveLength(1));
  const only = tabOrder()[0]!;
  const end = await dragTabTo(only, titleOf(only).x + 60);
  expect(shifted()).toHaveLength(0);
  await mouse("mouseReleased", end);
  expect(tabOrder()).toEqual([only]);
});

import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import {
  CheckpointId,
  CheckpointRef,
  CheckpointScopeId,
  MessageId,
  NodeId,
  ORCHESTRATION_V2_WS_METHODS,
  type OrchestrationV2ProviderThread,
  ProviderDriverKind,
  ProviderSessionId,
  ProviderThreadId,
  ProviderTurnId,
  RunAttemptId,
  RunId,
  type ThreadId,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { recordServerClock } from "@t3tools/client-runtime/clock";
import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  answerRpc,
  assistantItem,
  dispatchedCommands,
  emitThreadEvent,
  installFakeEnvironment,
  runningRun,
  threadWithHistory,
  threadWithQuestion,
  userItem,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, fakeTimers, render, stubGlobal } from "../../test/render";
import { DEFAULT_PANE_DENSITY_SETTINGS, usePaneDensityStore } from "./paneDensity";
import { isInPassivePane } from "./paneDom";
import { usePaneStore } from "./paneStore";
import {
  createInitialLayout,
  getActiveTab,
  listLeaves,
  MIN_PANE_HEIGHT_PX,
  MIN_PANE_WIDTH_PX,
  type PaneNode,
} from "./paneTree";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

// The socket is faked; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

// The fake environment does not serve project files, and a new draft waits for that read.
vi.mock(import("~/lib/t3ProjectFileDefaults"), () => ({
  readT3ProjectFile: () => Promise.resolve(null),
}));

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

/** The stores outlive a test, so each test starts from one tab with one empty pane, no drafts. */
function setup(
  threads: ReadonlyArray<FakeThread>,
  options?: Parameters<typeof installFakeEnvironment>[1],
) {
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
  });
  usePaneDensityStore.setState(DEFAULT_PANE_DENSITY_SETTINGS);
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  useRightPanelStore.setState({ byThreadKey: {} });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  return installFakeEnvironment(threads, options);
}

function routerAt(thread: FakeThread) {
  return getRouter(createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }));
}

async function openThread(thread: FakeThread, router = routerAt(thread)) {
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

const paneCells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
const paneTargets = () =>
  listLeaves(getActiveTab(usePaneStore.getState().layout).root).map((leaf) => leaf.target);
const activeCellIndex = () =>
  paneCells().findIndex((cell) => cell.contains(document.activeElement));
const focusedCellIndex = () => paneCells().findIndex((cell) => cell.dataset.paneFocused === "true");
const composers = () => [
  ...document.querySelectorAll<HTMLElement>('[data-testid="composer-editor"]'),
];

const boxOf = (element: Element | null | undefined) => {
  if (!element) throw new Error("The element is missing.");
  return element.getBoundingClientRect();
};
const intersects = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const contains = (outer: DOMRect, inner: DOMRect) =>
  inner.top >= outer.top - 1 &&
  inner.bottom <= outer.bottom + 1 &&
  inner.left >= outer.left - 1 &&
  inner.right <= outer.right + 1;
const rightPanelOf = (cell: HTMLElement) =>
  cell.querySelector<HTMLElement>('[data-preview-panel-mode="inline"]');
const rightPanelToggles = () => document.querySelectorAll("[data-right-panel-toggle]");

function paneRoot(): HTMLElement {
  const roots = document.querySelectorAll<HTMLElement>('main[data-slot="sidebar-inset"]');
  expect(roots).toHaveLength(1);
  return roots[0]!;
}

it("one tab with one pane adds no box and no tab bar to the stock thread view", async () => {
  const thread = threadWithHistory("pane-single", 1);
  using _environment = setup([thread]);
  await using _app = await openThread(thread);

  const root = paneRoot();
  expect(root.dataset.multi).toBe("false");
  // The grid is the only child, so no tab bar and no divider exist.
  expect(root.children).toHaveLength(1);
  const grid = root.children[0]!;
  expect(grid.hasAttribute("data-splitpane-grid")).toBe(true);
  expect(getComputedStyle(grid).display).toBe("contents");
  expect(grid.children).toHaveLength(1);
  const cell = grid.children[0]!;
  expect(cell.getAttribute("data-pane-focused")).toBe("true");
  expect(getComputedStyle(cell).display).toBe("contents");
  expect(cell.contains(page.getByTestId("composer-editor").element())).toBe(true);
});

it("a split keeps the first pane's thread view mounted, and an empty pane takes its own draft", async () => {
  const thread = threadWithHistory("pane-split", 1);
  using _environment = setup([thread]);
  await using _app = await openThread(thread);
  const composer = page.getByTestId("composer-editor").element();
  const firstPaneId = getActiveTab(usePaneStore.getState().layout).focusedPaneId;

  // What a stored layout can hold: a pane with no thread. No pane action runs here.
  await act(() => usePaneStore.getState().splitPane(firstPaneId, "right"));

  await vi.waitFor(() => expect(paneTargets()[1]?.kind).toBe("draft"));
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  expect(document.body.textContent).not.toContain("No thread in this pane");
  const root = paneRoot();
  expect(root.dataset.multi).toBe("true");
  const cells = [...root.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
  expect(cells.map((cell) => cell.dataset.splitpaneCell)[0]).toBe(firstPaneId);
  expect(cells).toHaveLength(2);
  // The same node, so the first split did not remount the thread view.
  expect(cells[0]!.contains(composer)).toBe(true);
  expect(isInPassivePane(composer)).toBe(true);
  expect(isInPassivePane(composers()[1])).toBe(false);
  const [left, right] = cells.map((cell) => cell.getBoundingClientRect());
  expect(left!.width).toBeGreaterThan(0);
  expect(right!.left).toBeCloseTo(left!.right, 0);
  expect(right!.width).toBeCloseTo(left!.width, 0);
  expect(right!.height).toBeCloseTo(left!.height, 0);

  // Each pane has a close button in its top right corner. The button of the passive pane closes
  // that pane, the other pane keeps its thread view, and one pane has no button.
  const closeButtons = () => [
    ...document.querySelectorAll<HTMLElement>("[data-pane-close] button"),
  ];
  expect(closeButtons()).toHaveLength(2);
  expect(cells[0]!.contains(closeButtons()[0]!)).toBe(true);
  await userEvent.click(closeButtons()[0]!);
  await vi.waitFor(() => expect(composers()).toHaveLength(1));
  expect(paneTargets()).toHaveLength(1);
  expect(paneTargets()[0]?.kind).toBe("draft");
  expect(closeButtons()).toHaveLength(0);
});

it("the pane keys split, move focus with the URL, and close a pane after the stock close layers", async () => {
  const thread = threadWithHistory("pane-keys", 1);
  using _environment = setup([thread]);
  const router = routerAt(thread);
  await using _app = await openThread(thread, router);
  const composer = page.getByTestId("composer-editor").element();
  const threadPath = router.state.location.pathname;

  // At a phone width a half pane is below the minimum, so the split is refused with the sizes.
  await page.viewport(390, 800);
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await expect
    .element(page.getByText("Each half would be 195 px wide. The minimum is 200 px."))
    .toBeVisible();
  expect(paneCells()).toHaveLength(1);

  // Wide enough for the right panel beside the chat column of each half.
  await page.viewport(1800, 800);
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  // The new pane takes focus and a draft thread of the same project.
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  expect(paneCells()).toHaveLength(2);
  expect(focusedCellIndex()).toBe(1);
  expect(paneCells()[0]!.contains(composer)).toBe(true);
  expect(paneCells()[1]!.contains(composers()[1]!)).toBe(true);
  const draftPath = router.state.location.pathname;
  expect(draftPath).toContain("/draft/");

  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(router.state.location.pathname).toBe(threadPath));
  expect(focusedCellIndex()).toBe(0);
  await userEvent.keyboard("{Control>}{Alt>}{ArrowRight}{/Alt}{/Control}");
  await vi.waitFor(() => expect(router.state.location.pathname).toBe(draftPath));
  expect(focusedCellIndex()).toBe(1);

  // The close key closes the open right-panel surface of the focused pane first, as in stock.
  const draftPane = page.elementLocator(paneCells()[1]!);
  const toggle = draftPane.getByRole("button", { name: "Toggle right panel", exact: true });
  await toggle.click();
  await draftPane.getByRole("button", { name: /^Files/ }).click();
  await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
  // The panel is beside the chat column, inside its pane.
  const chatColumn = paneCells()[1]!.querySelector<HTMLElement>("[data-chat-column]")!;
  expect(chatColumn.dataset.chatColumnMaximizedAway).toBe("false");
  expect(chatColumn.getBoundingClientRect().width).toBeGreaterThanOrEqual(360);
  expect(contains(boxOf(paneCells()[1]), boxOf(rightPanelOf(paneCells()[1]!)))).toBe(true);
  await userEvent.keyboard("{ControlOrMeta>}w{/ControlOrMeta}");
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  expect(paneCells()).toHaveLength(2);
  await draftPane.getByTestId("composer-editor").click();

  // With no surface open and no terminal focus, the same key closes the pane.
  await userEvent.keyboard("{ControlOrMeta>}w{/ControlOrMeta}");
  await vi.waitFor(() => expect(paneCells()).toHaveLength(1));
  expect(paneRoot().dataset.multi).toBe("false");
  expect(paneCells()[0]!.contains(composer)).toBe(true);
  await vi.waitFor(() => expect(router.state.location.pathname).toBe(threadPath));
});

it("typed text and DOM focus follow the focused pane through clicks, focus keys and tab switches", async () => {
  const first = threadWithHistory("pane-focus-a", 1);
  const second = threadWithHistory("pane-focus-b", 1);
  using _environment = setup([first, second]);
  const router = routerAt(first);
  await using _app = await openThread(first, router);
  await page.viewport(1280, 800);
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  // No pane shows the second thread, so the focused pane takes it.
  await router.navigate({
    to: "/$environmentId/$threadId",
    params: { environmentId: ENVIRONMENT_ID, threadId: second.id },
  });
  await expect.element(page.getByText(`Answer 0 for ${second.id}.`)).toBeVisible();
  expect(paneRoot().querySelector("[data-pane-tabbar]")).not.toBeNull();

  await userEvent.click(composers()[0]!);
  await userEvent.keyboard("one");
  await userEvent.click(composers()[1]!);
  await userEvent.keyboard("two");
  expect(composers().map((composer) => composer.textContent)).toEqual(["one", "two"]);

  // A focus key moves DOM focus with the pane focus, so the next key lands in that pane.
  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(activeCellIndex()).toBe(0));
  await userEvent.keyboard("!");
  expect(composers().map((composer) => composer.textContent)).toEqual(["one!", "two"]);

  // A passive pane that takes focus by itself gives it back, and the caret stays where it was.
  await userEvent.keyboard("{ArrowLeft}");
  composers()[1]!.focus();
  await vi.waitFor(() => expect(activeCellIndex()).toBe(0));
  expect(focusedCellIndex()).toBe(0);
  await userEvent.keyboard("-");
  expect(composers().map((composer) => composer.textContent)).toEqual(["one-!", "two"]);

  // A control that keeps DOM focus where it is, as "Scroll to end" and the microphone do. A
  // press on one in a passive pane focuses the pane, and the keyboard must follow.
  const keepFocus = document.createElement("button");
  keepFocus.textContent = "keep focus";
  keepFocus.style.cssText = "position:absolute;top:4rem;left:1rem;z-index:100";
  keepFocus.addEventListener("pointerdown", (event) => event.preventDefault());
  paneCells()[1]!.append(keepFocus);
  await userEvent.click(keepFocus);
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(1));
  await vi.waitFor(() => expect(activeCellIndex()).toBe(1));
  await userEvent.keyboard("3");
  expect(composers().map((composer) => composer.textContent)).toEqual(["one-!", "two3"]);
  keepFocus.remove();
  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(activeCellIndex()).toBe(0));

  // The panes of the first tab mount again on return, and its focused pane takes DOM focus.
  await userEvent.keyboard("{ControlOrMeta>}t{/ControlOrMeta}");
  await vi.waitFor(() => expect(document.querySelectorAll("[data-pane-tab]")).toHaveLength(2));
  await vi.waitFor(() => expect(paneCells()).toHaveLength(1));
  // A press on the padding of a tab selects it, not only a press on its title.
  await userEvent.click(document.querySelector("[data-pane-tab]")!, { position: { x: 2, y: 2 } });
  await vi.waitFor(() => expect(paneCells()).toHaveLength(2));
  await vi.waitFor(() => expect(activeCellIndex()).toBe(0));
  await userEvent.keyboard("?");
  await vi.waitFor(() => expect(composers()[0]!.textContent).toBe("one-!?"));
  expect(composers()[1]!.textContent).toBe("two3");
});

it("each pane keeps its own draft, send target and live timeline while focus moves the URL", async () => {
  const first = threadWithHistory("pane-walk-a", 1);
  const second = threadWithHistory("pane-walk-b", 1);
  using _environment = setup([first, second], { acceptCommands: true });
  const router = routerAt(first);
  await using _app = await openThread(first, router);
  await page.viewport(1280, 800);
  const firstComposer = page.getByTestId("composer-editor").element();
  await userEvent.click(firstComposer);
  await userEvent.keyboard("draft a");

  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  expect(paneCells()).toHaveLength(2);
  expect(paneRoot().querySelector("[data-pane-tabbar]")).not.toBeNull();
  // The same node with its text, so the split did not remount the first thread view.
  expect(composers()[0]).toBe(firstComposer);
  expect(firstComposer.textContent).toBe("draft a");

  // No pane shows the second thread, so the focused new pane takes it.
  await router.navigate({
    to: "/$environmentId/$threadId",
    params: { environmentId: ENVIRONMENT_ID, threadId: second.id },
  });
  const [firstPane, secondPane] = paneCells().map((cell) => page.elementLocator(cell));
  await expect.element(secondPane!.getByText(`Answer 0 for ${second.id}.`)).toBeVisible();
  await expect.element(firstPane!.getByText(`Answer 0 for ${first.id}.`)).toBeVisible();
  expect(paneCells()[0]!.textContent).not.toContain(`Answer 0 for ${second.id}.`);
  const historyLength = router.history.length;
  const pathname = () => router.state.location.pathname;

  await userEvent.click(composers()[1]!);
  await userEvent.keyboard("to b");
  await userEvent.click(composers()[0]!);
  await userEvent.keyboard(" more");
  expect(composers().map((composer) => composer.textContent)).toEqual(["draft a more", "to b"]);
  // A click focuses its pane and replaces the URL, so Back does not step through focus changes.
  await vi.waitFor(() => expect(pathname().endsWith(`/${first.id}`)).toBe(true));
  expect(router.history.length).toBe(historyLength);

  const lastSend = () =>
    dispatchedCommands().findLast((command) => command.type === "message.dispatch");
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() =>
    expect(lastSend()).toMatchObject({ threadId: first.id, text: "draft a more" }),
  );
  await userEvent.click(composers()[1]!);
  await vi.waitFor(() => expect(pathname().endsWith(`/${second.id}`)).toBe(true));
  expect(router.history.length).toBe(historyLength);
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(lastSend()).toMatchObject({ threadId: second.id, text: "to b" }));

  // A passive pane stays subscribed to its thread and renders what arrives.
  expect(focusedCellIndex()).toBe(1);
  const live = assistantItem(
    first.id,
    RunId.make(`${first.id}-run-0`),
    `${first.id}-live`,
    2,
    "Live answer for the passive pane.",
  );
  await act(() => emitThreadEvent(first.id, { type: "turn-item.updated", payload: live }));
  await expect.element(firstPane!.getByText("Live answer for the passive pane.")).toBeVisible();
  expect(paneCells()[1]!.textContent).not.toContain("Live answer for the passive pane.");

  // A stock window key acts in the focused pane only. The panes are wide enough for the panel.
  await page.viewport(1800, 800);
  const [firstToggle, secondToggle] = [firstPane!, secondPane!].map((pane) =>
    pane.getByRole("button", { name: "Toggle right panel", exact: true }),
  );
  await userEvent.keyboard("{ControlOrMeta>}{Alt>}b{/Alt}{/ControlOrMeta}");
  await expect.element(secondToggle!).toHaveAttribute("aria-pressed", "true");
  await expect.element(firstToggle!).toHaveAttribute("aria-pressed", "false");
  expect(composers()[0]).toBe(firstComposer);
});

const waitForDraftPanes = (count: number) =>
  vi.waitFor(() => {
    expect(paneTargets().filter((target) => target?.kind === "draft")).toHaveLength(count);
    expect(composers()).toHaveLength(count + 1);
  });

it("each new pane and each new tab opens its own draft, laid out inside its pane", async () => {
  const thread = threadWithHistory("pane-drafts", 1);
  using _environment = setup([thread]);
  const router = routerAt(thread);
  await using _app = await openThread(thread, router);
  await page.viewport(1440, 720);

  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await waitForDraftPanes(1);
  // The new pane already shows a draft, and the split from it must open a second draft.
  await userEvent.keyboard("{ControlOrMeta>}{Shift>}d{/Shift}{/ControlOrMeta}");
  await waitForDraftPanes(2);
  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(0));
  await userEvent.keyboard("{ControlOrMeta>}{Shift>}d{/Shift}{/ControlOrMeta}");
  await waitForDraftPanes(3);

  // A 2x2 grid: the thread, and three panes that each hold a different draft.
  expect(paneCells()).toHaveLength(4);
  expect(document.body.textContent).not.toContain("No thread in this pane");
  const draftIds = paneTargets().flatMap((target) =>
    target?.kind === "draft" ? [target.draftId] : [],
  );
  expect(new Set(draftIds).size).toBe(3);
  await vi.waitFor(() => expect(activeCellIndex()).toBe(focusedCellIndex()));
  const focusedTarget = paneTargets()[focusedCellIndex()];
  expect(focusedTarget?.kind === "draft" ? `/draft/${focusedTarget.draftId}` : null).toBe(
    router.state.location.pathname,
  );
  const activeTab = document.querySelector('[data-pane-tab][data-active-tab="true"]');
  expect(activeTab?.textContent).toContain("New thread");

  // Stock centers the composer and hangs the headline above it, by the window height. In panes
  // this short, that puts the headline over the pane header. At 322 px the whole block fits.
  await page.viewport(1440, 680);
  for (const [index, cell] of paneCells().entries()) {
    if (paneTargets()[index]?.kind !== "draft") continue;
    const heading = cell.querySelector("h1");
    await expect.element(page.elementLocator(heading!)).toBeVisible();
    const cellBox = boxOf(cell);
    const headerBox = boxOf(cell.querySelector("[data-chat-header]"));
    expect(intersects(boxOf(heading), headerBox)).toBe(false);
    expect(contains(cellBox, boxOf(heading))).toBe(true);
    expect(contains(cellBox, headerBox)).toBe(true);
  }

  // Text typed in one pane's composer stays in that pane.
  for (const [index, composer] of composers().entries()) {
    await userEvent.click(composer);
    await userEvent.keyboard(`text ${index}`);
  }
  expect(composers().map((composer) => composer.textContent)).toEqual([
    "text 0",
    "text 1",
    "text 2",
    "text 3",
  ]);

  // Two new tabs: each one has its own draft too.
  await userEvent.keyboard("{ControlOrMeta>}t{/ControlOrMeta}");
  await vi.waitFor(() => expect(paneTargets()[0]?.kind).toBe("draft"));
  const firstTabDraft = paneTargets()[0];
  await userEvent.keyboard("{ControlOrMeta>}t{/ControlOrMeta}");
  await vi.waitFor(() => {
    expect(usePaneStore.getState().layout.tabs).toHaveLength(3);
    expect(paneTargets()[0]?.kind).toBe("draft");
  });
  expect(paneTargets()[0]).not.toEqual(firstTabDraft);
  expect(draftIds.map((draftId) => ({ kind: "draft", draftId }))).not.toContainEqual(
    paneTargets()[0],
  );
  // One pane in the tab, so no focus mark is drawn around it.
  expect(getComputedStyle(paneCells()[0]!, "::after").content).toBe("none");
});

it("with the mirror setting off, a route to a thread that another pane shows moves the keyboard to that pane", async () => {
  const first = threadWithHistory("pane-route-a", 1);
  const second = threadWithHistory("pane-route-b", 1);
  using _environment = setup([first, second]);
  // The setting on is in paneMirror.browser.test.tsx.
  useReadoutSettingsStore.setState({ mirrorPanes: false });
  const router = routerAt(first);
  await using _app = await openThread(first, router);
  await page.viewport(1440, 800);
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await waitForDraftPanes(1);
  const toThread = (thread: FakeThread) =>
    router.navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: ENVIRONMENT_ID, threadId: thread.id },
    });
  await toThread(second);
  await expect.element(page.getByText(`Answer 0 for ${second.id}.`)).toBeVisible();
  await userEvent.click(composers()[1]!);
  expect(activeCellIndex()).toBe(1);

  // What the sidebar, the thread keys and Back do: the route names the first pane's thread.
  await toThread(first);
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(0));
  await vi.waitFor(() => expect(activeCellIndex()).toBe(0));
  await userEvent.keyboard("here");
  expect(composers().map((composer) => composer.textContent)).toEqual(["here", ""]);
});

it("a pane whose thread is gone takes its own new draft, and the other pane stays", async () => {
  const thread = threadWithHistory("pane-gone", 1);
  using _environment = setup([thread]);
  const router = routerAt(thread);
  await using _app = await openThread(thread, router);
  await page.viewport(1440, 800);
  const firstComposer = page.getByTestId("composer-editor").element();
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await waitForDraftPanes(1);
  await userEvent.click(firstComposer);
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(0));
  const passivePaneId = paneCells()[1]!.dataset.splitpaneCell!;

  // A draft with no session: what a pane holds after its draft was discarded elsewhere.
  const gone = DraftId.make("pane-gone-draft");
  await act(() =>
    usePaneStore.getState().setPaneTarget(passivePaneId, { kind: "draft", draftId: gone }),
  );
  await vi.waitFor(() => {
    const target = paneTargets()[1];
    expect(target?.kind).toBe("draft");
    expect(target).not.toEqual({ kind: "draft", draftId: gone });
  });
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  await expect.element(page.elementLocator(paneCells()[1]!.querySelector("h1")!)).toBeVisible();
  // The pane kept its place, and the focused pane kept its thread view, focus and URL.
  expect(paneCells()[1]!.dataset.splitpaneCell).toBe(passivePaneId);
  expect(composers()[0]).toBe(firstComposer);
  expect(focusedCellIndex()).toBe(0);
  expect(router.state.location.pathname.endsWith(`/${thread.id}`)).toBe(true);
});

it("a pane too narrow for the right panel has no toggle, no panel and no panel keys", async () => {
  const thread = threadWithHistory("pane-narrow", 1);
  using _environment = setup([thread]);
  await using _app = await openThread(thread);
  await page.viewport(1800, 800);
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await waitForDraftPanes(1);
  const pane = () => paneCells()[1]!;
  const toggle = () =>
    page.elementLocator(pane()).getByRole("button", { name: "Toggle right panel", exact: true });

  // Two panes of 796 px: each has the toggle, and the panel opens beside the chat column.
  expect(rightPanelToggles()).toHaveLength(2);
  await toggle().click();
  await page
    .elementLocator(pane())
    .getByRole("button", { name: /^Files/ })
    .click();
  await expect.element(toggle()).toHaveAttribute("aria-pressed", "true");
  await vi.waitFor(() => expect(rightPanelOf(pane())).not.toBeNull());

  // Two panes of 536 px, below the 720 px that the panel and the chat column need.
  await page.viewport(1280, 800);
  await vi.waitFor(() => expect(rightPanelToggles()).toHaveLength(0));
  await vi.waitFor(() => expect(rightPanelOf(pane())).toBeNull());
  expect(pane().dataset.paneNarrow).toBe("true");
  const chatColumn = pane().querySelector<HTMLElement>("[data-chat-column]")!;
  expect(chatColumn.dataset.chatColumnMaximizedAway).toBe("false");
  expect(chatColumn.getBoundingClientRect().width).toBeCloseTo(boxOf(pane()).width, 0);
  // The other two header controls stay.
  expect(pane().querySelectorAll("[data-panel-layout-controls] button")).toHaveLength(2);

  // The panel keys do nothing here: the toggle key and the diff key.
  await userEvent.click(pane().querySelector<HTMLElement>('[data-testid="composer-editor"]')!);
  await userEvent.keyboard("{ControlOrMeta>}{Alt>}b{/Alt}{/ControlOrMeta}");
  await userEvent.keyboard("{ControlOrMeta>}{Alt>}g{/Alt}{/ControlOrMeta}");
  expect(rightPanelOf(pane())).toBeNull();

  // A request for a panel surface, as a file link makes it, is refused with a message. The
  // stored panel state stays, so nothing opens later by itself.
  const [openKey] = Object.entries(useRightPanelStore.getState().byThreadKey).find(
    ([, panel]) => panel.isOpen,
  )!;
  const panelRef = parseScopedThreadKey(openKey)!;
  const storedPanel = () =>
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, panelRef);
  const before = storedPanel();
  await act(() => useRightPanelStore.getState().openFile(panelRef, "README.md"));
  await expect
    .element(page.getByText("Make this pane 720 px wide or more to use the right panel."))
    .toBeVisible();
  expect(storedPanel()).toBe(before);

  // Wide again: the panel returns as it was, so no key or request changed its stored state.
  await page.viewport(1800, 800);
  await vi.waitFor(() => expect(rightPanelToggles()).toHaveLength(2));
  await expect.element(toggle()).toHaveAttribute("aria-pressed", "true");
  await vi.waitFor(() => expect(rightPanelOf(pane())).not.toBeNull());
  expect(pane().querySelector('[data-active-tab="true"]')?.textContent).toContain("Files");

  // In a narrow pane the close key has no panel surface to close, so it closes the pane.
  await page.viewport(1280, 800);
  await vi.waitFor(() => expect(rightPanelToggles()).toHaveLength(0));
  await userEvent.keyboard("{ControlOrMeta>}w{/ControlOrMeta}");
  await vi.waitFor(() => expect(paneCells()).toHaveLength(1));
  // One tab with one pane is stock at any width: the toggle is back.
  await vi.waitFor(() => expect(rightPanelToggles()).toHaveLength(1));
});

it("a narrow pane never shows its stored-open right panel, also not in the commit that mounts it", async () => {
  const thread = threadWithHistory("pane-first-frame", 1);
  using _environment = setup([thread]);
  await using _app = await openThread(thread);
  await page.viewport(1280, 800);
  const toggle = page.getByRole("button", { name: "Toggle right panel", exact: true });
  await toggle.click();
  await page.getByRole("button", { name: /^Files/ }).click();
  await vi.waitFor(() => expect(rightPanelOf(paneCells()[0]!)).not.toBeNull());

  // What a painted frame can show: the DOM after each commit. A pane measured its box after the
  // paint before, so it kept the size class of its old box, or "wide" at its mount, for a frame.
  let panelsInNarrowPanes = 0;
  using observer = new DisposableStack();
  const mutations = new MutationObserver(() => {
    for (const cell of paneCells()) {
      if (boxOf(cell).width < 720 && rightPanelOf(cell) !== null) panelsInNarrowPanes += 1;
    }
  });
  mutations.observe(document.body, { childList: true, subtree: true });
  observer.defer(() => mutations.disconnect());

  // The split makes the thread's pane 536 px wide.
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await waitForDraftPanes(1);
  expect(paneCells()[0]!.dataset.paneNarrow).toBe("true");
  // A new tab, then back: the panes of the first tab mount again.
  await userEvent.keyboard("{ControlOrMeta>}t{/ControlOrMeta}");
  await vi.waitFor(() => expect(paneCells()).toHaveLength(1));
  await userEvent.click(document.querySelector("[data-pane-tab]")!);
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  await expect.element(page.getByText(`Answer 0 for ${thread.id}.`)).toBeVisible();

  expect(panelsInNarrowPanes).toBe(0);
  expect(rightPanelToggles()).toHaveLength(0);
});

it("a 2x2 pane splits again, and a tab holds 12 panes of the minimum size with header, composer and bottom bar", async () => {
  const thread = threadWithHistory("pane-small", 3);
  using _environment = setup([thread]);
  await using _app = await openThread(thread);

  // The 2x2 grid of a 1470 x 834 window: panes 399 px high. A minimum of 240 px refused the
  // split down, which gives halves of 199 px.
  await page.viewport(1470, 834);
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await waitForDraftPanes(1);
  await userEvent.keyboard("{ControlOrMeta>}{Shift>}d{/Shift}{/ControlOrMeta}");
  await waitForDraftPanes(2);
  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(0));
  await userEvent.keyboard("{ControlOrMeta>}{Shift>}d{/Shift}{/ControlOrMeta}");
  await waitForDraftPanes(3);
  await userEvent.keyboard("{ControlOrMeta>}{Shift>}d{/Shift}{/ControlOrMeta}");
  await waitForDraftPanes(4);
  expect(paneCells()).toHaveLength(5);
  expect(boxOf(paneCells()[focusedCellIndex()]).height).toBeLessThan(MIN_PANE_HEIGHT_PX * 2);

  // 4 columns of 3 rows in a grid of 804 x 423 px: every pane is at the minimum size. The
  // empty panes take their own drafts, as the panes of a stored layout do.
  const tab = getActiveTab(usePaneStore.getState().layout);
  const first = listLeaves(tab.root)[0]!;
  const columns = [0, 1, 2, 3].map((column): PaneNode => {
    const leaves = [0, 1, 2].map((row): PaneNode =>
      column === 0 && row === 0
        ? first
        : { kind: "leaf", id: `small-${column}-${row}`, target: null },
    );
    return {
      kind: "split",
      id: `small-column-${column}`,
      axis: "column",
      children: leaves,
      sizes: [1 / 3, 1 / 3, 1 / 3],
    };
  });
  const root: PaneNode = {
    kind: "split",
    id: "small-row",
    axis: "row",
    children: columns,
    sizes: [0.25, 0.25, 0.25, 0.25],
  };
  await page.viewport(1012, 460);
  // The sidebar width is not fixed, so the window follows the measured grid.
  const grid = boxOf(document.querySelector("[data-splitpane-grid]"));
  await page.viewport(
    1012 + 4 * (MIN_PANE_WIDTH_PX + 1) - Math.round(grid.width),
    460 + 3 * (MIN_PANE_HEIGHT_PX + 1) - Math.round(grid.height),
  );
  await act(() =>
    usePaneStore.setState({
      layout: { tabs: [{ ...tab, root, focusedPaneId: first.id }], activeTabId: tab.id },
    }),
  );
  await vi.waitFor(() => expect(composers()).toHaveLength(12));
  expect(paneCells()).toHaveLength(12);
  expect(rightPanelToggles()).toHaveLength(0);

  // Split panes are Compact by default. Normal is the tallest composer, so it runs last and the
  // screen stays in it for the rest of the test.
  for (const splitPaneDensity of ["compact", "very-compact", "normal"] as const) {
    await act(() =>
      usePaneDensityStore.getState().setDensity("splitPaneDensity", splitPaneDensity),
    );
    await vi.waitFor(() => expect(paneRoot().dataset.chatDensity).toBe(splitPaneDensity));
    for (const cell of paneCells()) {
      const cellBox = boxOf(cell);
      expect(Math.abs(cellBox.width - MIN_PANE_WIDTH_PX - 1)).toBeLessThan(1);
      expect(Math.abs(cellBox.height - MIN_PANE_HEIGHT_PX - 1)).toBeLessThan(1);
      expect(cell.dataset.paneShort).toBe("true");
      const headerBox = boxOf(cell.querySelector("[data-chat-header]"));
      const composerBox = boxOf(cell.querySelector('[data-chat-composer-form="true"]'));
      const stripBox = boxOf(cell.querySelector('[data-slot="composer-context-strip"]'));
      // The whole header, at its small height, the whole composer and the whole strip under it
      // show, one under the other. The pane itself is 1 px taller than the minimum, so the
      // strip must end 1 px above the pane's end to fit a pane of the minimum.
      expect(headerBox.height).toBe(40);
      expect(contains(cellBox, headerBox)).toBe(true);
      expect(contains(cellBox, composerBox)).toBe(true);
      expect(composerBox.top).toBeGreaterThanOrEqual(headerBox.bottom);
      expect(stripBox.top).toBeGreaterThanOrEqual(composerBox.bottom - 0.5);
      expect(stripBox.bottom).toBeLessThanOrEqual(cellBox.bottom - 1);
      expect(stripBox.height).toBeGreaterThanOrEqual(20);
      // The header controls and the send button stay inside the pane.
      for (const control of cell.querySelectorAll(
        '[data-panel-layout-controls] button, [data-chat-composer-form="true"] button[type="submit"]',
      )) {
        expect(contains(cellBox, boxOf(control))).toBe(true);
      }
      // One line of text, not the two lines of the stock composer.
      const editor = boxOf(cell.querySelector('[data-testid="composer-editor"]'));
      expect(editor.height).toBeLessThan(40);
    }
  }

  // The new-thread screen of a minimum pane shows the composer, and its headline with the
  // project picker scrolls into view from above.
  const draftCell = paneCells()[7]!;
  const overlay = draftCell.querySelector<HTMLElement>('[data-chat-composer-overlay="true"]')!;
  const picker = draftCell.querySelector<HTMLElement>("[data-draft-project-trigger]")!;
  expect(boxOf(picker).bottom).toBeLessThanOrEqual(boxOf(overlay).top);
  overlay.scrollTo({ top: -overlay.scrollHeight });
  await vi.waitFor(() => expect(contains(boxOf(overlay), boxOf(picker))).toBe(true));
  overlay.scrollTo({ top: 0 });

  // The composer of a minimum pane takes text. A prompt of 12 lines scrolls inside the editor:
  // the composer stays under the header, and the send button and the strip stay in the pane.
  // The started thread docks its composer, and the draft pane centers it.
  for (const index of [0, 7]) {
    const cell = paneCells()[index]!;
    await userEvent.click(composers()[index]!);
    await userEvent.keyboard("small");
    for (let line = 2; line <= 12; line += 1) {
      await userEvent.keyboard(`{Shift>}{Enter}{/Shift}line ${line}`);
    }
    expect(composers()[index]!.textContent).toContain("line 12");
    const cellBox = boxOf(cell);
    const composerBox = boxOf(cell.querySelector('[data-chat-composer-form="true"]'));
    expect(composerBox.top).toBeGreaterThanOrEqual(
      boxOf(cell.querySelector("[data-chat-header]")).bottom,
    );
    expect(contains(cellBox, composerBox)).toBe(true);
    expect(contains(cellBox, boxOf(cell.querySelector('button[type="submit"]')))).toBe(true);
    expect(
      contains(cellBox, boxOf(cell.querySelector('[data-slot="composer-context-strip"]'))),
    ).toBe(true);
    const editor = composers()[index]!;
    expect(editor.scrollHeight).toBeGreaterThan(editor.clientHeight);
  }
  expect(composers().filter((composer) => composer.textContent !== "")).toHaveLength(2);

  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await expect.element(page.getByText("A tab holds at most 12 panes.")).toBeVisible();
  expect(paneCells()).toHaveLength(12);
});

const SCROLL_KEY = "{ControlOrMeta>}{ArrowDown}{/ControlOrMeta}";
const SCROLL_BUTTON = "[data-scroll-to-end]";
// Enough turns for a timeline several times the height of the window.
const SCROLL_TURNS = 12;
const scrollerOf = (cell: HTMLElement) =>
  cell.querySelector<HTMLElement>(".messages-timeline-scroll")!;
const distanceFromEnd = (scroller: HTMLElement) =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

/** Scrolls the timeline of a pane away from its end, until stock offers "Scroll to end". */
async function scrollUp(cell: HTMLElement) {
  const scroller = scrollerOf(cell);
  // Stock follows the end until the user scrolls, and a wheel event is how it sees the user.
  scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -2000, bubbles: true }));
  scroller.scrollTop = 0;
  await vi.waitFor(() => {
    expect(cell.querySelector(SCROLL_BUTTON)).not.toBeNull();
    expect(distanceFromEnd(scrollerOf(cell))).toBeGreaterThan(200);
  });
}

async function expectAtEnd(cell: HTMLElement) {
  await vi.waitFor(() => {
    expect(distanceFromEnd(scrollerOf(cell))).toBeLessThan(2);
    expect(cell.querySelector(SCROLL_BUTTON)).toBeNull();
  });
}

/** Where the caret is in the text of the composer, in characters from the start. */
function caretOffset(composer: HTMLElement): number {
  const selection = document.getSelection()!;
  const before = document.createRange();
  before.setStart(composer, 0);
  before.setEnd(selection.focusNode!, selection.focusOffset);
  return before.toString().length;
}

async function openLongThread(name: string) {
  const thread = threadWithHistory(name, SCROLL_TURNS);
  await using stack = new AsyncDisposableStack();
  stack.use(setup([thread]));
  // The stock action scrolls with an animation, which ends later than a test waits. With
  // reduced motion it jumps, so the end is reached at once.
  const matchMedia = window.matchMedia.bind(window);
  stack.use(
    stubGlobal("matchMedia", (query: string) =>
      matchMedia(query.includes("prefers-reduced-motion") ? "all" : query),
    ),
  );
  await page.viewport(1280, 700);
  const router = routerAt(thread);
  await router.load();
  stack.use(
    await render(<AppRoot router={router} />, {
      // AppRoot brings its own router.
      router: false,
    }),
  );
  // A thread opens at its end, so the last answer shows and the first one does not.
  await expect
    .element(page.getByText(`Answer ${SCROLL_TURNS - 1} for ${thread.id}.`))
    .toBeVisible();
  await expectAtEnd(paneCells()[0]!);
  return stack.move();
}

it("mod+down scrolls the chat to its end with one pane, after the caret of a text field is at the end of its text", async () => {
  await using _app = await openLongThread("scroll-key");
  const cell = paneCells()[0]!;

  // Focus outside a text field: the key is the stock button.
  await scrollUp(cell);
  (document.activeElement as HTMLElement | null)?.blur();
  await userEvent.keyboard(SCROLL_KEY);
  await expectAtEnd(cell);

  // An empty composer with focus: the caret has no text behind it, so the chat scrolls.
  await scrollUp(cell);
  await userEvent.click(composers()[0]!);
  await userEvent.keyboard(SCROLL_KEY);
  await expectAtEnd(cell);

  // A caret inside the text: the first press is the native key, which moves the caret to the
  // end of the text. The chat stays where it is.
  await userEvent.keyboard("a long prompt");
  await scrollUp(cell);
  await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
  expect(caretOffset(composers()[0]!)).toBe("a long prompt".length - 3);
  await userEvent.keyboard(SCROLL_KEY);
  await vi.waitFor(() => expect(caretOffset(composers()[0]!)).toBe("a long prompt".length));
  expect(cell.querySelector(SCROLL_BUTTON)).not.toBeNull();
  expect(distanceFromEnd(scrollerOf(cell))).toBeGreaterThan(200);
  // The second press finds the caret at the end, and scrolls the chat.
  await userEvent.keyboard(SCROLL_KEY);
  await expectAtEnd(cell);
  expect(composers()[0]!.textContent).toBe("a long prompt");
});

it("mod+down scrolls the chat of the focused pane only", async () => {
  await using _app = await openLongThread("scroll-key-panes");
  // The new pane takes the focus, with its own new thread.
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => {
    expect(paneCells()).toHaveLength(2);
    expect(paneCells()[1]!.dataset.paneFocused).toBe("true");
    expect(composers()[1]).not.toBeNull();
  });
  const first = paneCells()[0]!;
  await scrollUp(first);
  await userEvent.keyboard(SCROLL_KEY);
  // Focus moves back to the first pane. Its chat is where the user left it.
  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(paneCells()[0]!.dataset.paneFocused).toBe("true"));
  expect(first.querySelector(SCROLL_BUTTON)).not.toBeNull();
  expect(distanceFromEnd(scrollerOf(first))).toBeGreaterThan(200);
  // The same key now scrolls it.
  (document.activeElement as HTMLElement | null)?.blur();
  await userEvent.keyboard(SCROLL_KEY);
  await expectAtEnd(first);
});

const STOP_KEY = "{Control>}c{/Control}";
const STOP_MESSAGE = "Take this message back";
// The time of every fixture of the fake environment.
const FIXTURE_TIME = DateTime.makeUnsafe("2026-03-17T19:12:28.000Z");
const commandsOfType = (type: string) =>
  dispatchedCommands().filter((command) => command.type === type);

/** A thread with one settled turn, and the provider thread that the stock rewind asks for. */
function stoppableThread(name: string) {
  const thread = threadWithHistory(name, 1);
  const driver = ProviderDriverKind.make("codex");
  const providerThread: OrchestrationV2ProviderThread = {
    id: ProviderThreadId.make(`${name}-provider-thread`),
    driver,
    providerInstanceId: thread.modelSelection!.instanceId,
    providerSessionId: ProviderSessionId.make(`${name}-provider-session`),
    appThreadId: thread.id,
    ownerNodeId: null,
    nativeThreadRef: { driver, nativeId: `${name}-native`, strength: "strong" },
    nativeConversationHeadRef: null,
    status: "idle",
    firstRunOrdinal: 1,
    lastRunOrdinal: 2,
    handoffIds: [],
    forkedFrom: null,
    pendingBackgroundTasks: [],
    contextUsage: null,
    nativeMetadata: null,
    goal: null,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  return { ...thread, providerThread, providerThreads: [providerThread] };
}

/**
 * Starts a second run in an open thread, as a server does after a send. The first run gets the
 * checkpoint and the provider turn that give the new message a stock rewind target ("Edit from
 * here") once its run is settled.
 */
async function startSecondRun(thread: ReturnType<typeof stoppableThread>) {
  const firstRun = thread.runs[0]!;
  const nodeId = NodeId.make(`${thread.id}-node`);
  const attemptId = RunAttemptId.make(`${thread.id}-attempt`);
  const providerTurnId = ProviderTurnId.make(`${thread.id}-provider-turn`);
  const checkpoint = {
    id: CheckpointId.make(`${thread.id}-checkpoint`),
    threadId: thread.id,
    scopeId: CheckpointScopeId.make(`${thread.id}-scope`),
    runId: firstRun.id,
    nodeId,
    parentCheckpointId: null,
    ordinalWithinScope: 1,
    appRunOrdinal: 1,
    ref: CheckpointRef.make(`${thread.id}-ref`),
    status: "ready" as const,
    files: [],
    capturedAt: FIXTURE_TIME,
  };
  const messageId = `${thread.id}-user-1`;
  const run = runningRun(thread.id, `${thread.id}-run-1`, 2, messageId);
  await act(async () => {
    await emitThreadEvent(thread.id, {
      type: "run-attempt.created",
      payload: {
        id: attemptId,
        runId: firstRun.id,
        attemptOrdinal: 1,
        rootNodeId: nodeId,
        providerInstanceId: firstRun.providerInstanceId,
        providerThreadId: thread.providerThread.id,
        providerTurnId,
        reason: "initial",
        status: "completed",
        startedAt: FIXTURE_TIME,
        completedAt: FIXTURE_TIME,
      },
    });
    await emitThreadEvent(thread.id, {
      type: "provider-turn.updated",
      payload: {
        id: providerTurnId,
        providerThreadId: thread.providerThread.id,
        nodeId,
        runAttemptId: attemptId,
        nativeTurnRef: null,
        ordinal: 1,
        status: "completed",
        startedAt: FIXTURE_TIME,
        completedAt: FIXTURE_TIME,
      },
    });
    await emitThreadEvent(thread.id, {
      type: "run.updated",
      payload: { ...firstRun, activeAttemptId: attemptId },
    });
    await emitThreadEvent(thread.id, { type: "checkpoint.captured", payload: checkpoint });
    await emitThreadEvent(thread.id, {
      type: "message.updated",
      payload: {
        id: MessageId.make(messageId),
        threadId: thread.id,
        runId: run.id,
        nodeId: null,
        role: "user",
        text: STOP_MESSAGE,
        attachments: [],
        streaming: false,
        createdBy: "user",
        creationSource: "web",
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      },
    });
    await emitThreadEvent(thread.id, { type: "run.created", payload: run });
    await emitThreadEvent(thread.id, {
      type: "turn-item.updated",
      payload: userItem(thread.id, run.id, messageId, 2, STOP_MESSAGE),
    });
  });
  return { run, checkpoint };
}

// Read from the DOM at each use. A locator of a pane cell that was made earlier stopped
// matching in these tests, in a run of the whole file.
const timelineTextOf = (cellIndex: number) => scrollerOf(paneCells()[cellIndex]!).textContent;
const rewindButtonOf = (cellIndex: number) =>
  paneCells()[cellIndex]!.querySelector<HTMLButtonElement>('button[aria-label="Edit from here"]');

/** The fake server has no `thread.stop`, so the stock stop asks for the runs of the thread. */
const answerRunsOf = (runs: ReadonlyArray<ReturnType<typeof runningRun>>) =>
  answerRpc(
    ORCHESTRATION_V2_WS_METHODS.getThreadProjection,
    (input: { readonly threadId: ThreadId }) =>
      Effect.succeed({ runs: runs.filter((run) => run.threadId === input.threadId) }),
  );

const settleStoppedRun = (run: ReturnType<typeof runningRun>) =>
  act(() =>
    emitThreadEvent(run.threadId, {
      type: "run.updated",
      payload: { ...run, status: "interrupted", completedAt: FIXTURE_TIME },
    }),
  );

it("ctrl+c stops the turn of the focused pane only, leaves an old message in the timeline, stays the copy key while text is selected or a dialog has focus, and gives a take back up after 10 s", async () => {
  const first = stoppableThread("stop-key-a");
  const second = stoppableThread("stop-key-b");
  using _environment = setup([first, second], { acceptCommands: true });
  const router = routerAt(first);
  await using _app = await openThread(first, router);
  await page.viewport(1280, 800);
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  // No pane shows the second thread, so the focused new pane takes it.
  await router.navigate({
    to: "/$environmentId/$threadId",
    params: { environmentId: ENVIRONMENT_ID, threadId: second.id },
  });
  await vi.waitFor(() => expect(timelineTextOf(1)).toContain(`Answer 0 for ${second.id}.`));
  expect(focusedCellIndex()).toBe(1);

  // A turn runs in each pane. Both messages carry the fixture time, which is long ago.
  const passive = await startSecondRun(first);
  const focused = await startSecondRun(second);
  await vi.waitFor(() => {
    expect(timelineTextOf(0)).toContain(STOP_MESSAGE);
    expect(timelineTextOf(1)).toContain(STOP_MESSAGE);
  });
  using _runs = answerRunsOf([passive.run, focused.run]);
  // A key that the fork takes stops in the capture phase and never reaches this listener.
  const passedOn: boolean[] = [];
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "c") passedOn.push(event.defaultPrevented);
  };
  document.addEventListener("keydown", onKeyDown);
  using _listener = { [Symbol.dispose]: () => document.removeEventListener("keydown", onKeyDown) };

  // Selected text: the key is the copy key, and the turn goes on.
  document.getSelection()!.selectAllChildren(scrollerOf(paneCells()[1]!));
  await userEvent.keyboard(STOP_KEY);
  expect(passedOn).toEqual([false]);
  expect(commandsOfType("run.interrupt")).toEqual([]);
  document.getSelection()!.removeAllRanges();

  // Focus in a dialog or in the floating preview: stock shows the spreadsheet viewer and the
  // browser page there, which read the key themselves and hold no selection of the document.
  for (const [tag, attribute, value] of [
    ["div", "role", "dialog"],
    ["section", "data-preview-mini-player", "tab"],
  ] as const) {
    const host = document.createElement(tag);
    host.setAttribute(attribute, value);
    const field = host.appendChild(document.createElement("textarea"));
    document.body.append(host);
    using _host = { [Symbol.dispose]: () => host.remove() };
    field.focus();
    expect(document.activeElement).toBe(field);
    await userEvent.keyboard(STOP_KEY);
  }
  expect(passedOn).toEqual([false, false, false]);
  expect(commandsOfType("run.interrupt")).toEqual([]);
  passedOn.length = 1;

  // No selection: the key stops the turn of the focused pane, and no other turn.
  await userEvent.keyboard(STOP_KEY);
  await vi.waitFor(() =>
    expect(commandsOfType("run.interrupt")).toMatchObject([
      { threadId: second.id, runId: focused.run.id, holdQueue: true },
    ]),
  );
  expect(passedOn).toEqual([false]);

  // The stopped run settles. Stock now offers its rewind for the message, and the key asked
  // for none: the message was not sent a moment ago, so it stays in the timeline.
  await settleStoppedRun(focused.run);
  await vi.waitFor(() => expect(rewindButtonOf(1)?.disabled).toBe(false));
  expect(rewindButtonOf(0)).toBeNull();
  expect(commandsOfType("checkpoint.rollback")).toEqual([]);
  expect(timelineTextOf(1)).toContain(STOP_MESSAGE);
  expect(composers().map((composer) => composer.textContent)).toEqual(["", ""]);
  // The key is a plain key again when no turn can stop in the focused pane.
  await userEvent.keyboard(STOP_KEY);
  expect(passedOn).toEqual([false, false]);
  expect(commandsOfType("run.interrupt")).toHaveLength(1);
  expect(commandsOfType("checkpoint.rollback")).toEqual([]);

  // The turn of the first pane still runs. The key press is two seconds after its message, so
  // a take back waits for the stopped run. The server does not settle the run in 10 seconds.
  await userEvent.click(composers()[0]!);
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(0));
  {
    using _timers = fakeTimers();
    vi.setSystemTime(DateTime.toEpochMillis(FIXTURE_TIME) + 2_000);
    await userEvent.keyboard(STOP_KEY);
    await vi.waitFor(() =>
      expect(commandsOfType("run.interrupt")).toMatchObject([
        { threadId: second.id },
        { threadId: first.id, runId: passive.run.id },
      ]),
    );
    // The text is in the composer at the key press, with no wait for the server.
    await vi.waitFor(() => expect(composers()[0]!.textContent).toBe(STOP_MESSAGE));
    await act(() => vi.advanceTimersByTime(10_000));
  }
  // The run settles after that. The take back is gone: the message stays where it is, and the
  // composer keeps the returned text.
  await settleStoppedRun(passive.run);
  await vi.waitFor(() => expect(rewindButtonOf(0)?.disabled).toBe(false));
  expect(commandsOfType("checkpoint.rollback")).toEqual([]);
  expect(timelineTextOf(0)).toContain(STOP_MESSAGE);
  expect(composers()[0]!.textContent).toBe(STOP_MESSAGE);
});

it("ctrl+c returns a message that was sent a moment ago to the composer at the key press, and rewinds with the stock rewind that keeps the files, also after its pane lost focus", async () => {
  const thread = stoppableThread("take-back");
  using _environment = setup([thread], { acceptCommands: true });
  await using _app = await openThread(thread);
  await page.viewport(1280, 800);
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  // Focus goes back to the pane of the thread.
  await userEvent.click(composers()[0]!);
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(0));
  const { run, checkpoint } = await startSecondRun(thread);
  await vi.waitFor(() => expect(timelineTextOf(0)).toContain(STOP_MESSAGE));
  using _runs = answerRunsOf([run]);

  {
    // The key press is two seconds after the message, on the clock of the server. That clock
    // is one hour ahead of the clock of this client, so the age is right only on the first.
    recordServerClock(ENVIRONMENT_ID, {
      serverTimeMs: 3_600_000,
      requestedAtMs: 0,
      receivedAtMs: 0,
    });
    using _clock = {
      [Symbol.dispose]: () =>
        recordServerClock(ENVIRONMENT_ID, {
          serverTimeMs: undefined,
          requestedAtMs: 0,
          receivedAtMs: 0,
        }),
    };
    using _now = vi
      .spyOn(Date, "now")
      .mockReturnValue(DateTime.toEpochMillis(FIXTURE_TIME) - 3_600_000 + 2_000);
    await userEvent.keyboard(STOP_KEY);
  }
  await vi.waitFor(() =>
    expect(commandsOfType("run.interrupt")).toMatchObject([{ threadId: thread.id, runId: run.id }]),
  );
  // Stock refuses a rewind while the run is not settled, so nothing is asked yet. The text is
  // already in the composer, and the message is still in the timeline.
  expect(commandsOfType("checkpoint.rollback")).toEqual([]);
  await vi.waitFor(() => expect(composers()[0]!.textContent).toBe(STOP_MESSAGE));
  expect(timelineTextOf(0)).toContain(STOP_MESSAGE);

  // The user moves to the other pane before the server settles the stopped run.
  await userEvent.click(composers()[1]!);
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(1));
  let focusEnteredFirstPane = 0;
  const onFocusIn = () => {
    focusEnteredFirstPane += 1;
  };
  const firstCell = paneCells()[0]!;
  firstCell.addEventListener("focusin", onFocusIn);
  using _listener = { [Symbol.dispose]: () => firstCell.removeEventListener("focusin", onFocusIn) };

  await settleStoppedRun(run);
  // "Revert and keep changes": one rollback that restores no file, and no question first.
  await vi.waitFor(() =>
    expect(commandsOfType("checkpoint.rollback")).toMatchObject([
      {
        threadId: thread.id,
        checkpointId: checkpoint.id,
        scopeId: checkpoint.scopeId,
        restoreFiles: false,
      },
    ]),
  );
  await expect.element(page.getByText("Edit from here?")).not.toBeInTheDocument();
  await act(async () => {
    await emitThreadEvent(thread.id, {
      type: "provider-thread.updated",
      payload: { ...thread.providerThread, lastRunOrdinal: 1 },
    });
    await emitThreadEvent(thread.id, {
      type: "run.updated",
      payload: { ...run, status: "rolled_back", completedAt: FIXTURE_TIME },
    });
  });

  // The message left the timeline, and the composer of its pane holds the text one time.
  await vi.waitFor(() => expect(timelineTextOf(0)).not.toContain(STOP_MESSAGE));
  expect(composers()[0]!.textContent).toBe(STOP_MESSAGE);
  expect(commandsOfType("checkpoint.rollback")).toHaveLength(1);
  // The rewind makes no focus call: the pane is passive now, and the keyboard stays where the
  // user is.
  expect(focusEnteredFirstPane).toBe(0);
  expect(activeCellIndex()).toBe(1);
  expect(focusedCellIndex()).toBe(1);
  await userEvent.keyboard("next");
  await vi.waitFor(() => expect(composers()[1]!.textContent).toBe("next"));
  expect(composers()[0]!.textContent).toBe(STOP_MESSAGE);
});

const FOCUS_INPUT_KEY = "{ControlOrMeta>}l{/ControlOrMeta}";

it("mod+l puts the caret at the end of the composer of the focused pane, from a button outside the composers, and a second press or a disabled editor leaves the key alone", async () => {
  const thread = threadWithHistory("focus-input", 1);
  const asking = threadWithQuestion("focus-input-question", "Which file should change?");
  using _environment = setup([thread, asking]);
  const router = routerAt(thread);
  await using _app = await openThread(thread, router);
  await page.viewport(1280, 800);
  await userEvent.click(composers()[0]!);
  await userEvent.keyboard("one");
  // The new pane takes the focus, with its own new thread.
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  await userEvent.click(composers()[1]!);
  // The caret is left inside the text, so the next text shows where the key puts it.
  await userEvent.keyboard("two{ArrowLeft}");
  expect(focusedCellIndex()).toBe(1);

  // A key that the fork takes stops in the capture phase and never reaches this listener.
  const passedOn: boolean[] = [];
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "l") passedOn.push(event.defaultPrevented);
  };
  document.addEventListener("keydown", onKeyDown);
  using _listener = { [Symbol.dispose]: () => document.removeEventListener("keydown", onKeyDown) };

  // A button of the tab bar is outside every pane.
  const button = document.querySelector<HTMLElement>("[data-pane-tabbar] button")!;
  button.focus();
  expect(document.activeElement).toBe(button);
  await userEvent.keyboard(FOCUS_INPUT_KEY);
  await vi.waitFor(() => expect(document.activeElement).toBe(composers()[1]));
  expect(passedOn).toEqual([]);
  await userEvent.keyboard("!");
  expect(composers().map((composer) => composer.textContent)).toEqual(["one", "two!"]);

  // The caret is in the composer now: the key is not consumed, so it is the key of the browser.
  await userEvent.keyboard(FOCUS_INPUT_KEY);
  expect(passedOn).toEqual([false]);
  expect(document.activeElement).toBe(composers()[1]);

  // The other pane takes the focus. The same key from the same button now goes to its composer.
  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(activeCellIndex()).toBe(0));
  button.focus();
  expect(document.activeElement).toBe(button);
  await userEvent.keyboard(FOCUS_INPUT_KEY);
  await vi.waitFor(() => expect(document.activeElement).toBe(composers()[0]));
  expect(passedOn).toEqual([false]);
  await userEvent.keyboard("?");
  expect(composers().map((composer) => composer.textContent)).toEqual(["one?", "two!"]);

  // The agent of the focused pane asks a question with fixed answers, so stock disables the
  // editor. It takes no caret: the key is not consumed, and focus stays where it is.
  await router.navigate({
    to: "/$environmentId/$threadId",
    params: { environmentId: ENVIRONMENT_ID, threadId: asking.id },
  });
  await expect.element(page.getByText("Which file should change?")).toBeVisible();
  await vi.waitFor(() => expect(composers()[0]!.getAttribute("contenteditable")).toBe("false"));
  expect(focusedCellIndex()).toBe(0);
  button.focus();
  expect(document.activeElement).toBe(button);
  await userEvent.keyboard(FOCUS_INPUT_KEY);
  expect(passedOn).toEqual([false, false]);
  expect(document.activeElement).toBe(button);
});

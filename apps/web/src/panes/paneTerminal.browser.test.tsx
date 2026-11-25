import "~/index.css";

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { createMemoryHistory } from "@tanstack/react-router";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
import { useComposerDraftStore } from "~/composerDraftStore";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import { useTerminalUiStateStore } from "~/terminalUiStateStore";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";
import { usePaneStore } from "./paneStore";
import {
  createInitialLayout,
  getActiveTab,
  listLeaves,
  MIN_PANE_HEIGHT_PX,
  type PaneNode,
} from "./paneTree";

// Apart from panes.browser.test.tsx for one reason: the app keeps the thread list that the first
// test of a file loaded, and a terminal drawer mounts only for a thread of that list.

// The socket is faked; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

// The drawer's layout and focus are under test, not the terminal: the surface never loads its
// WASM module. It adds the input that takes the keys, as the real surface does.
vi.mock("~/terminal/ghostty/surface", () => ({
  GhosttyTerminalSurface: {
    create: (mount: HTMLElement) => {
      mount.append(document.createElement("textarea"));
      return new Promise(() => {});
    },
  },
}));

/** The stores outlive a test, so the test starts from one tab with one empty pane, no drafts. */
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

const paneCells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
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
const contains = (outer: DOMRect, inner: DOMRect) =>
  inner.top >= outer.top - 1 &&
  inner.bottom <= outer.bottom + 1 &&
  inner.left >= outer.left - 1 &&
  inner.right <= outer.right + 1;
const rightPanelOf = (cell: HTMLElement) =>
  cell.querySelector<HTMLElement>('[data-preview-panel-mode="inline"]');
const rightPanelToggles = () => document.querySelectorAll("[data-right-panel-toggle]");

it("each pane opens its own terminal drawer, a short pane gives it the pane, and it is never hidden", async () => {
  const threads = ["a", "b", "c", "d"].map((name) => threadWithHistory(`pane-term-${name}`, 1));
  using _environment = setup(threads);
  await using _app = await openThread(threads[0]!);
  await page.viewport(1470, 834);

  // A 2x2 grid of four threads, as a stored layout holds it.
  const tab = getActiveTab(usePaneStore.getState().layout);
  const first = listLeaves(tab.root)[0]!;
  const leafOf = (index: number): PaneNode =>
    index === 0
      ? first
      : {
          kind: "leaf",
          id: `term-${index}`,
          target: { kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, threads[index]!.id) },
        };
  const columnOf = (column: number): PaneNode => ({
    kind: "split",
    id: `term-column-${column}`,
    axis: "column",
    children: [leafOf(column * 2), leafOf(column * 2 + 1)],
    sizes: [0.5, 0.5],
  });
  const root: PaneNode = {
    kind: "split",
    id: "term-row",
    axis: "row",
    children: [columnOf(0), columnOf(1)],
    sizes: [0.5, 0.5],
  };
  await act(() =>
    usePaneStore.setState({
      layout: { tabs: [{ ...tab, root, focusedPaneId: first.id }], activeTabId: tab.id },
    }),
  );
  await vi.waitFor(() => expect(composers()).toHaveLength(4));

  const drawerOf = (cell: HTMLElement) =>
    cell.querySelector<HTMLElement>(
      '[data-thread-terminal-drawer][data-workspace-area="terminal"]',
    );
  const drawerToggle = (index: number) =>
    page
      .elementLocator(paneCells()[index]!)
      .getByRole("button", { name: "Toggle terminal drawer", exact: true });
  const openDrawers = () => paneCells().map((cell) => drawerOf(cell) !== null);
  const composerShows = (cell: HTMLElement) =>
    cell.querySelector<HTMLElement>('[data-testid="composer-editor"]')!.checkVisibility({
      visibilityProperty: true,
    });

  // The toggle of each pane, also of a pane without focus, opens the drawer of that pane only.
  // Panes of 399 px keep the stock layout: header, composer, and the drawer under them.
  for (const index of [0, 1, 2, 3]) {
    await drawerToggle(index).click();
    await vi.waitFor(() => expect(drawerOf(paneCells()[index]!)).not.toBeNull());
    expect(focusedCellIndex()).toBe(index);
    expect(openDrawers()).toEqual([0, 1, 2, 3].map((other) => other <= index));
    const cell = paneCells()[index]!;
    const cellBox = boxOf(cell);
    const drawerBox = boxOf(drawerOf(cell));
    expect(contains(cellBox, drawerBox)).toBe(true);
    expect(drawerBox.width).toBeCloseTo(cellBox.width, 0);
    expect(drawerBox.height).toBeGreaterThan(100);
    expect(drawerBox.bottom).toBeCloseTo(cellBox.bottom, 0);
    expect(composerShows(cell)).toBe(true);
    expect(drawerBox.top).toBeGreaterThanOrEqual(
      boxOf(cell.querySelector('[data-chat-composer-form="true"]')).bottom,
    );
  }

  // The toggle key acts on the focused pane only.
  await userEvent.keyboard("{ControlOrMeta>}j{/ControlOrMeta}");
  await vi.waitFor(() => expect(openDrawers()).toEqual([true, true, true, false]));
  await userEvent.keyboard("{ControlOrMeta>}j{/ControlOrMeta}");
  await vi.waitFor(() => expect(openDrawers()).toEqual([true, true, true, true]));

  // Panes of the minimum height. Stock leaves the drawer 5 px there. The open drawer takes the
  // pane below the header, and the covered composer takes no focus.
  const grid = boxOf(document.querySelector("[data-splitpane-grid]"));
  await page.viewport(1470, 834 + 2 * (MIN_PANE_HEIGHT_PX + 1) - Math.round(grid.height));
  await vi.waitFor(() => expect(paneCells()[0]!.dataset.paneShort).toBe("true"));
  for (const cell of paneCells()) {
    const cellBox = boxOf(cell);
    const headerBox = boxOf(cell.querySelector("[data-chat-header]"));
    await vi.waitFor(() => {
      const drawerBox = boxOf(drawerOf(cell));
      expect(drawerBox.top).toBeCloseTo(headerBox.bottom, 0);
      expect(drawerBox.bottom).toBeCloseTo(cellBox.bottom, 0);
    });
    expect(boxOf(drawerOf(cell)).height).toBeGreaterThanOrEqual(MIN_PANE_HEIGHT_PX - 40);
    expect(composerShows(cell)).toBe(false);
  }
  const terminalInputOf = (index: number) =>
    drawerOf(paneCells()[index]!)!.querySelector("textarea");
  // The key closes the drawer, and the chat of that pane is back with the keyboard in it.
  expect(focusedCellIndex()).toBe(3);
  await userEvent.keyboard("{ControlOrMeta>}j{/ControlOrMeta}");
  await vi.waitFor(() => expect(openDrawers()).toEqual([true, true, true, false]));
  expect(composerShows(paneCells()[3]!)).toBe(true);
  await userEvent.keyboard("chat");
  await vi.waitFor(() => expect(composers()[3]!.textContent).toBe("chat"));

  // A press on the header of a pane leaves DOM focus on the body, and stock then sends typed
  // text to the composer. Where the terminal covers the composer, the terminal takes the keys.
  await userEvent.click(paneCells()[1]!.querySelector("[data-chat-header]")!, {
    position: { x: 80, y: 8 },
  });
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(1));
  await vi.waitFor(() => expect(document.activeElement).toBe(terminalInputOf(1)));

  // A drawer that opens in a pane without focus, as a project script opens it. A focus key
  // into that pane finds its composer covered and moves the keyboard to its terminal.
  await act(() =>
    useTerminalUiStateStore
      .getState()
      .setTerminalOpen(scopeThreadRef(ENVIRONMENT_ID, threads[3]!.id), true),
  );
  await vi.waitFor(() => expect(openDrawers()).toEqual([true, true, true, true]));
  expect(activeCellIndex()).toBe(1);
  await userEvent.keyboard("{Control>}{Alt>}{ArrowRight}{/Alt}{/Control}");
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(3));
  await vi.waitFor(() => expect(document.activeElement).toBe(terminalInputOf(3)));
  expect(composers()[3]!.textContent).toBe("chat");
  // The same press on the header of the pane that has focus.
  await userEvent.click(paneCells()[3]!.querySelector("[data-chat-header]")!, {
    position: { x: 80, y: 8 },
  });
  await vi.waitFor(() => expect(document.activeElement).toBe(terminalInputOf(3)));

  // A maximized right panel gives the chat column, and the drawer in it, no width. A drawer
  // that opens restores the panel to its place beside the chat column.
  await page.viewport(1800, 834);
  await vi.waitFor(() => expect(rightPanelToggles()).toHaveLength(4));
  await drawerToggle(2).click();
  await vi.waitFor(() => expect(openDrawers()).toEqual([true, true, false, true]));
  const pane = page.elementLocator(paneCells()[2]!);
  await pane.getByRole("button", { name: "Toggle right panel", exact: true }).click();
  await pane.getByRole("button", { name: /^Files/ }).click();
  await pane.getByRole("button", { name: "Maximize panel", exact: true }).click();
  const chatColumn = paneCells()[2]!.querySelector<HTMLElement>("[data-chat-column]")!;
  await vi.waitFor(() => expect(chatColumn.dataset.chatColumnMaximizedAway).toBe("true"));
  await userEvent.keyboard("{ControlOrMeta>}j{/ControlOrMeta}");
  await vi.waitFor(() => expect(chatColumn.dataset.chatColumnMaximizedAway).toBe("false"));
  await vi.waitFor(() =>
    expect(boxOf(drawerOf(paneCells()[2]!)).width).toBeGreaterThanOrEqual(360),
  );
  expect(rightPanelOf(paneCells()[2]!)).not.toBeNull();
});

// Render counts of the fork's split panes (apps/web/src/panes), on the harness of
// appScenarios.renders.tsx. The counts are asserted here and not written as a report, so the
// stock report of scripts/render-metrics.ts keeps its scenarios.
import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { AppRoot } from "~/AppRoot";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { usePaneStore } from "~/panes/paneStore";
import { getActiveTab, listLeaves, MAX_PANES_PER_TAB, type PaneNode } from "~/panes/paneTree";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "./fakeEnvironment";
import { commitsSoFar, startCounting, stopCounting, type RenderReport } from "./renderCounter";
import { act, fakeTimers, render } from "./render";

// The socket is faked; see appScenarios.renders.tsx.
vi.mock("../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("./fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const HISTORY_TURNS = 20;
const COLUMNS = 4;
const ROWS = MAX_PANES_PER_TAB / COLUMNS;
const THREADS = Array.from({ length: MAX_PANES_PER_TAB }, (_, index) =>
  threadWithHistory(`pane-cost-${index}`, HISTORY_TURNS),
);

async function quiet() {
  let seen = -1;
  await vi.waitFor(
    () => {
      const now = commitsSoFar();
      const settled = now === seen;
      seen = now;
      expect(settled).toBe(true);
    },
    { interval: 100, timeout: 15_000 },
  );
}

async function measure(action: () => Promise<void>): Promise<RenderReport> {
  await quiet();
  startCounting();
  await action();
  await quiet();
  return stopCounting();
}

const composers = () => [
  ...document.querySelectorAll<HTMLElement>('[data-testid="composer-editor"]'),
];
const focusedCellIndex = () =>
  [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")].findIndex(
    (cell) => cell.dataset.paneFocused === "true",
  );

/** Columns of rows, each pane on its own server thread. `firstId` keeps the mounted pane. */
function threadGrid(firstId: string): PaneNode {
  const columns = Array.from({ length: COLUMNS }, (_, column): PaneNode => {
    const leaves = Array.from({ length: ROWS }, (_, row): PaneNode => {
      const index = column * ROWS + row;
      return {
        kind: "leaf",
        id: index === 0 ? firstId : `pane-cost-${index}`,
        target: { kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, THREADS[index]!.id) },
      };
    });
    return {
      kind: "split",
      id: `pane-cost-column-${column}`,
      axis: "column",
      children: leaves,
      sizes: leaves.map(() => 1 / ROWS),
    };
  });
  return {
    kind: "split",
    id: "pane-cost-row",
    axis: "row",
    children: columns,
    sizes: columns.map(() => 1 / COLUMNS),
  };
}

it("a focus move and a typed character in a tab of 12 panes render two chat views and none", async () => {
  // Relative times re-render on ticks of the wall clock; only Date is frozen.
  using _clock = fakeTimers({ toFake: ["Date"], now: new Date("2026-03-18T09:00:30.000Z") });
  using _environment = installFakeEnvironment(THREADS);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  await page.viewport(1728, 1000);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${THREADS[0]!.id}`] }),
  );
  await router.load();
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });
  const lastAnswer = (index: number) => `Answer ${HISTORY_TURNS - 1} for ${THREADS[index]!.id}.`;
  await expect.element(page.getByText(lastAnswer(0))).toBeVisible();

  const tab = getActiveTab(usePaneStore.getState().layout);
  const first = listLeaves(tab.root)[0]!;
  await act(() =>
    usePaneStore.setState({
      layout: {
        tabs: [{ ...tab, root: threadGrid(first.id), focusedPaneId: first.id }],
        activeTabId: tab.id,
      },
    }),
  );
  await vi.waitFor(() => expect(composers()).toHaveLength(MAX_PANES_PER_TAB), { timeout: 30_000 });
  await expect.element(page.getByText(lastAnswer(MAX_PANES_PER_TAB - 1))).toBeVisible();
  await document.fonts.ready;

  // The first key in a composer mounts its menus, so one character warms it up.
  await userEvent.click(composers()[0]!);
  await userEvent.keyboard("a");
  const typed = await measure(() => userEvent.keyboard("b"));
  expect(typed.components.ChatView ?? 0).toBe(0);

  // A focus move changes the URL. Only the pane that lost focus and the pane that took it
  // commit a render of their chat view. The counter counts a component that did work. It does
  // not count the chat views of the other panes, whose function runs and finds no change
  // (FORK.md, "Render cost").
  const moved = await measure(async () => {
    await userEvent.keyboard("{Control>}{Alt>}{ArrowRight}{/Alt}{/Control}");
    await vi.waitFor(() => expect(focusedCellIndex()).toBe(ROWS));
  });
  expect(moved.components.ChatView).toBe(2);
  expect(moved.components.ThreadRouteView).toBe(2);
});

import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { environmentThreadShells } from "~/state/threads";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { serveThreadShells, threadPullRequest as pullRequest } from "../../test/paneThreadShell";
import { render } from "../../test/render";
import { focusPane } from "./paneActions";
import { usePaneArmedThreadStore } from "./paneArmedThreadStore";
import { locationForTarget } from "./paneRouteSync";
import { usePaneStore } from "./paneStore";
import { DEFAULT_PANE_THREAD_SETTINGS, usePaneThreadStore } from "./paneThreadStore";
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

// The fake environment does not serve project files, and a new draft waits for that read. A
// test can hold the read, as a real environment does for the time of one request.
const projectFile = vi.hoisted(() => ({ held: null as Promise<void> | null }));
vi.mock(import("~/lib/t3ProjectFileDefaults"), () => ({
  readT3ProjectFile: () => (projectFile.held ?? Promise.resolve()).then(() => null),
}));

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

/** The stores outlive a test, so each test starts from this layout, no drafts and the defaults. */
function setup(threads: ReadonlyArray<FakeThread>, layout: PaneLayout = createInitialLayout()) {
  projectFile.held = null;
  usePaneStore.setState({ layout, lastRouteKey: null, fillingPaneIds: [] });
  usePaneThreadStore.setState(DEFAULT_PANE_THREAD_SETTINGS);
  // The test reads the merge from the stock pull request badge of the strip. The chip of the
  // fork takes the place of that badge, so the chip is off here.
  useReadoutSettingsStore.setState({ ...DEFAULT_READOUT_SETTINGS, showPullRequestChip: false });
  usePaneArmedThreadStore.setState({ armedThreadKeys: [] });
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

const targetOf = (thread: FakeThread) =>
  ({ kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, thread.id) }) as const;

/** One tab with the threads side by side, the first one focused. */
function rowLayout(threads: ReadonlyArray<FakeThread>): PaneLayout {
  const layout = createInitialLayout(targetOf(threads[0]!));
  let tab = getActiveTab(layout);
  const first = tab.focusedPaneId;
  for (const thread of threads.slice(1)) {
    const before = new Set(listLeaves(tab.root).map((leaf) => leaf.id));
    tab = splitLeaf(tab, first, "right");
    const added = listLeaves(tab.root).find((leaf) => !before.has(leaf.id))!;
    tab = setLeafTarget(tab, added.id, targetOf(thread));
  }
  return replaceTab(layout, { ...tab, focusedPaneId: first });
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
  return { router, stack: stack.move() };
}

const paneCells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
const paneShowing = (thread: FakeThread) =>
  paneCells().find((cell) => cell.textContent.includes(`Answer 0 for ${thread.id}.`));
const leafTargets = () =>
  usePaneStore
    .getState()
    .layout.tabs.map((tab) => listLeaves(tab.root).map((leaf) => leaf.target?.kind ?? "empty"));

it("a pane whose thread settles after its merge shows its own new thread, in every tab, while the setting is on", async () => {
  const merging = threadWithHistory("settle-merging", 1);
  const working = threadWithHistory("settle-working", 1);
  const alreadySettled = threadWithHistory("settle-already", 1);
  const hidden = threadWithHistory("settle-hidden-tab", 1);
  const byHand = threadWithHistory("settle-by-hand", 1);
  const byHandMirror = threadWithHistory("settle-by-hand-mirror", 1);
  const first = rowLayout([merging, working, alreadySettled, byHand, byHandMirror]);
  // A second tab that is not mounted, with a thread that also merges.
  // That tab also holds a thread that merged and settled while the app was closed.
  const overnight = threadWithHistory("settle-overnight", 1);
  let secondTab = createTab(targetOf(hidden));
  secondTab = splitLeaf(secondTab, secondTab.focusedPaneId, "right");
  const added = listLeaves(secondTab.root).find((leaf) => leaf.target === null)!;
  secondTab = setLeafTarget(secondTab, added.id, targetOf(overnight));
  const layout = { ...addTab(first, secondTab), activeTabId: first.activeTabId };
  using _environment = setup(
    [merging, working, alreadySettled, hidden, byHand, byHandMirror, overnight],
    layout,
  );
  usePaneArmedThreadStore.setState({
    armedThreadKeys: [scopedThreadKey(targetOf(overnight).threadRef)],
  });
  using shell = serveThreadShells(
    new Map([
      [merging, { pullRequests: [pullRequest(31, "dale/merging", "open")] }],
      [working, { pullRequests: [pullRequest(32, "dale/working", "open")] }],
      // Opened when it was settled, as from the Settled list: its pane keeps it.
      [
        alreadySettled,
        {
          pullRequests: [pullRequest(33, "dale/done", "merged")],
          settledOverride: "settled" as const,
        },
      ],
      [hidden, { pullRequests: [pullRequest(34, "dale/hidden", "open")] }],
      [byHand, { pullRequests: [pullRequest(36, "dale/by-hand", "open")] }],
      [byHandMirror, { pullRequests: [pullRequest(37, "dale/by-hand-mirror", "open")] }],
      [
        overnight,
        {
          pullRequests: [pullRequest(35, "dale/overnight", "merged")],
          settledOverride: "settled" as const,
        },
      ],
    ]),
  );
  await page.viewport(1800, 800);
  const app = await openThread(merging);
  await using _app = app.stack;
  await vi.waitFor(() => {
    expect(paneCells()).toHaveLength(5);
    expect(paneShowing(working)).toBeDefined();
    expect(paneShowing(alreadySettled)).toBeDefined();
  });
  await vi.waitFor(() =>
    expect(usePaneArmedThreadStore.getState().armedThreadKeys).toHaveLength(5),
  );
  // The armed mark of the last session frees the pane of the thread that merged meanwhile.
  await vi.waitFor(() =>
    expect(leafTargets()).toEqual([
      ["server", "server", "server", "server", "server"],
      ["server", "draft"],
    ]),
  );
  const workingCell = paneShowing(working)!;

  // A settle with no merge keeps the pane: the pull request of the thread is still open.
  shell.change(working, { settledOverride: "settled" });
  // The server reports the merge, then settles the thread.
  shell.change(merging, { pullRequests: [pullRequest(31, "dale/merging", "merged")] });
  shell.change(merging, { settledOverride: "settled" });
  shell.change(hidden, {
    pullRequests: [pullRequest(34, "dale/hidden", "merged")],
    settledOverride: "settled",
  });

  await vi.waitFor(() => {
    expect(paneShowing(merging)).toBeUndefined();
    expect(leafTargets()).toEqual([
      ["draft", "server", "server", "server", "server"],
      ["draft", "draft"],
    ]);
  });
  // The new thread screen of the freed pane, in the project of the thread that settled.
  await vi.waitFor(() => {
    const freed = paneCells().find((cell) => cell.dataset.paneFocused === "true")!;
    expect(freed.querySelector("[data-draft-project-trigger]")).not.toBeNull();
    expect(freed.querySelector('[data-testid="composer-editor"]')).not.toBeNull();
  });
  // No other pane was mounted again or lost its thread.
  expect(paneShowing(working)).toBe(workingCell);
  expect(paneShowing(alreadySettled)).toBeDefined();
  expect(document.body.textContent).not.toContain("No thread in this pane");

  // A settle by hand of the focused pane's thread, after its merge. The stock settle action
  // moves the route to the next thread, which another pane shows. That pane takes the route with
  // the mirror setting off, and the pane of the settled thread takes it with the setting on. In
  // both, the pane of the settled thread then has its own new thread and the focus.
  const focusedPaneId = () => getActiveTab(usePaneStore.getState().layout).focusedPaneId;
  const targetOfPane = (paneId: string) =>
    listLeaves(getActiveTab(usePaneStore.getState().layout).root).find((leaf) => leaf.id === paneId)
      ?.target;
  const nextThreadCell = paneShowing(alreadySettled)!;
  for (const [thread, number, branch, mirror] of [
    [byHand, 36, "dale/by-hand", false],
    [byHandMirror, 37, "dale/by-hand-mirror", true],
  ] as const) {
    useReadoutSettingsStore.setState({ mirrorPanes: mirror });
    const cell = paneShowing(thread)!;
    const paneId = cell.dataset.splitpaneCell!;
    focusPane(app.router, paneId);
    await vi.waitFor(() => expect(cell.dataset.paneFocused).toBe("true"));
    shell.change(thread, { pullRequests: [pullRequest(number, branch, "merged")] });
    await expect
      .element(
        page.elementLocator(cell).getByRole("link", { name: new RegExp(`PR #${number} - Merged`) }),
      )
      .toBeVisible();
    const stopStockMove = appAtomRegistry.subscribe(
      environmentThreadShells.threadShellAtom(targetOf(thread).threadRef),
      (settling) => {
        if (settling?.settledOverride !== "settled") return;
        // Stock navigates in the continuation of its settle command.
        queueMicrotask(() => void app.router.navigate(locationForTarget(targetOf(alreadySettled))));
      },
    );
    // The draft of the pane waits for the project file, so the stock move ends first.
    const projectFileRead = { finish: () => {} };
    projectFile.held = new Promise<void>((resolve) => {
      projectFileRead.finish = resolve;
    });
    shell.change(thread, { settledOverride: "settled" });
    await vi.waitFor(() => {
      expect(app.router.state.location.pathname.endsWith(`/${alreadySettled.id}`)).toBe(true);
      expect(focusedPaneId() === paneId).toBe(mirror);
      expect(usePaneStore.getState().fillingPaneIds).toEqual([paneId]);
    });
    projectFileRead.finish();
    await vi.waitFor(() => {
      expect(paneShowing(thread)).toBeUndefined();
      expect(focusedPaneId()).toBe(paneId);
      expect(targetOfPane(paneId)?.kind).toBe("draft");
      expect(cell.querySelector('[data-testid="composer-editor"]')).not.toBeNull();
      expect(app.router.state.location.pathname).toContain("/draft/");
    });
    stopStockMove();
    expect(paneShowing(alreadySettled)).toBe(nextThreadCell);
  }
  // Each split is made beside the first pane, so the threads of the last two splits come next.
  expect(leafTargets()[0]).toEqual(["draft", "draft", "draft", "server", "server"]);

  // With the setting off, a pane keeps a thread whose merge arrives. The thread was armed
  // and is settled, so the pane would be free with the setting on.
  usePaneThreadStore.getState().setReleasePaneOnMergeSettle(false);
  await vi.waitFor(() => expect(usePaneArmedThreadStore.getState().armedThreadKeys).toEqual([]));
  shell.change(working, { pullRequests: [pullRequest(32, "dale/working", "merged")] });
  await expect
    .element(page.elementLocator(workingCell).getByRole("link", { name: /PR #32 - Merged/ }))
    .toBeVisible();
  expect(paneShowing(working)).toBe(workingCell);
  // The setting comes back on: a thread that is settled by then is not armed and stays.
  usePaneThreadStore.getState().setReleasePaneOnMergeSettle(true);
  await vi.waitFor(() => expect(usePaneArmedThreadStore.getState().armedThreadKeys).toEqual([]));
  expect(leafTargets()).toEqual([
    ["draft", "draft", "draft", "server", "server"],
    ["draft", "draft"],
  ]);
});

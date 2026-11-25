import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  ORCHESTRATION_V2_WS_METHODS,
  WS_METHODS,
  type OrchestrationV2ShellStreamItem,
  type OrchestrationV2ThreadStreamItem,
  type VcsListRefsInput,
  type VcsSwitchRefInput,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  answerRpc,
  fakeDriver,
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
  replaceTab,
  setLeafTarget,
  splitLeaf,
  type PaneLayout,
  type PaneSplitDirection,
} from "./paneTree";

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

const STRIP = '[data-slot="composer-context-strip"]';
// The branch control: the one combobox of the strip that opens a dialog (paneContextStrip.css).
const BRANCH_CONTROL = '[role="combobox"][aria-haspopup="dialog"]';

interface Checkout {
  readonly thread: FakeThread;
  readonly branch: string;
  readonly worktreePath: string;
}

function checkoutOf(name: string): Checkout {
  return {
    thread: threadWithHistory(name, 1),
    branch: `feature/${name}`,
    worktreePath: `/worktrees/${name}`,
  };
}

type RpcHandler = (input: never) => unknown;

/** The fake environment's own answer to `method`, read before a test replaces it. */
function stockRpc<Item>(method: string): (input: never) => Stream.Stream<Item> {
  // oxlint-disable-next-line t3code/no-manual-effect-runtime-in-tests -- the fake driver hands out its client only inside this already-succeeded Effect; no test logic runs in it
  const lease = Effect.runSync(Effect.scoped(fakeDriver.connect({ target: null } as never)));
  const handler = (lease.session.client as unknown as Record<string, RpcHandler>)[method];
  return handler as (input: never) => Stream.Stream<Item>;
}

/**
 * The fake environment puts every thread on `main` in the project folder. This gives each thread
 * its own worktree and branch, in the shell and in the thread detail, and answers the ref list
 * and the ref switch of each worktree.
 */
function serveCheckouts(checkouts: ReadonlyArray<Checkout>) {
  const byThread = new Map(checkouts.map((checkout) => [String(checkout.thread.id), checkout]));
  const placed = <T extends { readonly id: unknown }>(thread: T): T => {
    const checkout = byThread.get(String(thread.id));
    return checkout
      ? { ...thread, branch: checkout.branch, worktreePath: checkout.worktreePath }
      : thread;
  };
  const stockShell = stockRpc<OrchestrationV2ShellStreamItem>(
    ORCHESTRATION_V2_WS_METHODS.subscribeShell,
  );
  const stockThread = stockRpc<OrchestrationV2ThreadStreamItem>(
    ORCHESTRATION_V2_WS_METHODS.subscribeThread,
  );
  const switched: VcsSwitchRefInput[] = [];
  const answers = [
    answerRpc(ORCHESTRATION_V2_WS_METHODS.subscribeShell, (input: never) =>
      Stream.map(stockShell(input), (item) =>
        item.kind === "snapshot"
          ? { ...item, snapshot: { ...item.snapshot, threads: item.snapshot.threads.map(placed) } }
          : item,
      ),
    ),
    answerRpc(ORCHESTRATION_V2_WS_METHODS.subscribeThread, (input: never) =>
      Stream.map(stockThread(input), (item) =>
        item.kind === "snapshot"
          ? { ...item, projection: { ...item.projection, thread: placed(item.projection.thread) } }
          : item,
      ),
    ),
    answerRpc(WS_METHODS.vcsListRefs, (input: VcsListRefsInput) => {
      const checkout = checkouts.find((candidate) => candidate.worktreePath === input.cwd);
      const refs = (
        checkout
          ? [
              { name: checkout.branch, current: true, worktreePath: checkout.worktreePath },
              { name: `${checkout.branch}-next`, current: false, worktreePath: null },
            ]
          : [{ name: "main", current: true, worktreePath: null }]
      )
        .filter((ref) => input.query === undefined || ref.name.includes(input.query))
        .map((ref) => ({ ...ref, isDefault: false }));
      return Effect.succeed({
        refs,
        isRepo: true,
        hasPrimaryRemote: false,
        nextCursor: null,
        totalCount: refs.length,
      });
    }),
    // Left unanswered, like a checkout that still runs.
    answerRpc(WS_METHODS.vcsSwitchRef, (input: VcsSwitchRefInput) => {
      switched.push(input);
      return Effect.never;
    }),
  ];
  return {
    switched,
    [Symbol.dispose]: () => {
      for (const answer of answers) answer[Symbol.dispose]();
    },
  };
}

/** The stores outlive a test, so each test starts from this layout and no drafts. */
function setup(threads: ReadonlyArray<FakeThread>, layout: PaneLayout = createInitialLayout()) {
  usePaneStore.setState({ layout, lastRouteKey: null, fillingPaneIds: [] });
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

/** What a stored layout holds: one tab with a 2x2 grid, one thread in each pane. */
function gridLayout(threads: readonly [FakeThread, FakeThread, FakeThread, FakeThread]) {
  const layout = createInitialLayout(targetOf(threads[0]));
  let tab = getActiveTab(layout);
  const first = tab.focusedPaneId;
  const split = (leafId: string, direction: PaneSplitDirection, thread: FakeThread) => {
    const before = new Set(listLeaves(tab.root).map((leaf) => leaf.id));
    tab = splitLeaf(tab, leafId, direction);
    const added = listLeaves(tab.root).find((leaf) => !before.has(leaf.id))!;
    tab = setLeafTarget(tab, added.id, targetOf(thread));
    return added.id;
  };
  const right = split(first, "right", threads[1]);
  split(first, "down", threads[2]);
  split(right, "down", threads[3]);
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
  return stack.move();
}

/** Forces every pane to one size, which a divider drag cannot reach at the current minimum. */
function forcePaneSize(widthPx: number, heightPx: number): Disposable {
  const style = document.createElement("style");
  style.textContent = `[data-splitpane-cell] { width: ${widthPx}px !important; height: ${heightPx}px !important; }`;
  document.head.append(style);
  return { [Symbol.dispose]: () => style.remove() };
}

const paneCells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
const paneOf = (thread: FakeThread) => {
  const cell = paneCells().find((candidate) =>
    candidate.textContent.includes(`Answer 0 for ${thread.id}.`),
  );
  if (!cell) throw new Error(`No pane shows ${thread.id}.`);
  return cell;
};
const stripOf = (cell: HTMLElement) => cell.querySelector<HTMLElement>(STRIP);
const visibleWithin = (outer: DOMRect, element: HTMLElement) => {
  const inner = element.getBoundingClientRect();
  return (
    element.checkVisibility({ checkOpacity: true, visibilityProperty: true }) &&
    inner.width > 0 &&
    inner.height > 0 &&
    inner.top >= outer.top - 1 &&
    inner.bottom <= outer.bottom + 1 &&
    inner.left >= outer.left - 1 &&
    inner.right <= outer.right + 1
  );
};

it("each pane of a 2x2 grid of started threads shows the strip under its composer, with its own branch and working controls", async () => {
  const checkouts = ["strip-a", "strip-b", "strip-c", "strip-d"].map(checkoutOf);
  const [a, b, c, d] = checkouts.map((checkout) => checkout.thread);
  using _environment = setup([a!, b!, c!, d!], gridLayout([a!, b!, c!, d!]));
  using served = serveCheckouts(checkouts);
  await page.viewport(1280, 800);
  await using _app = await openThread(a!);

  await vi.waitFor(() => {
    expect(paneCells()).toHaveLength(4);
    for (const { thread, branch } of checkouts) {
      const cell = paneOf(thread);
      const strip = stripOf(cell);
      expect(strip, `the strip of ${thread.id}`).not.toBeNull();
      const cellBox = cell.getBoundingClientRect();
      expect(visibleWithin(cellBox, strip!)).toBe(true);
      // Under the composer of its own pane.
      const composer = cell.querySelector<HTMLElement>('[data-testid="composer-editor"]')!;
      expect(strip!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        composer.getBoundingClientRect().bottom,
      );
      const control = strip!.querySelector<HTMLElement>(BRANCH_CONTROL)!;
      expect(control.getAttribute("aria-label")).toBe(`Branch: ${branch}`);
      expect(
        visibleWithin(cellBox, control.querySelector<HTMLElement>("[data-composer-label]")!),
      ).toBe(true);
      expect(strip!.textContent).toContain(branch);
    }
  });
  // One focused pane and three passive panes, and each of them has the strip.
  expect(paneCells().map((cell) => cell.dataset.paneFocused)).toEqual([
    "true",
    "false",
    "false",
    "false",
  ]);
  expect(paneOf(a!).dataset.paneFocused).toBe("true");

  // The branch control of a passive pane acts on that pane's thread: its own ref list, and a
  // switch in its own worktree.
  const passive = checkouts[3]!;
  const passiveCell = paneOf(passive.thread);
  const trigger = page.elementLocator(passiveCell.querySelector<HTMLElement>(BRANCH_CONTROL)!);
  await expect.element(trigger).toBeEnabled();
  await trigger.click();
  const nextRef = page.getByRole("option").filter({ hasText: `${passive.branch}-next` });
  await expect.element(nextRef).toBeVisible();
  expect(passiveCell.dataset.paneFocused).toBe("true");
  expect(document.body.textContent).not.toContain(`${checkouts[0]!.branch}-next`);
  await nextRef.click();
  await vi.waitFor(() =>
    expect(served.switched).toEqual([
      { cwd: passive.worktreePath, refName: `${passive.branch}-next` },
    ]),
  );

  // About the smallest pane that the fork plans to allow. The strip stays inside its pane, and
  // the branch keeps its name where stock collapses every label to its icon.
  using _small = forcePaneSize(200, 140);
  await vi.waitFor(() => {
    // Not the fourth pane: its branch is between two names while the switch runs.
    for (const { thread, branch } of checkouts.slice(0, 3)) {
      const cell = paneOf(thread);
      const cellBox = cell.getBoundingClientRect();
      expect(Math.round(cellBox.width)).toBe(200);
      expect(Math.round(cellBox.height)).toBe(140);
      const strip = stripOf(cell)!;
      expect(visibleWithin(cellBox, strip)).toBe(true);
      expect(strip.hasAttribute("data-compact")).toBe(true);
      const control = strip.querySelector<HTMLElement>(BRANCH_CONTROL)!;
      expect(visibleWithin(cellBox, control)).toBe(true);
      const label = control.querySelector<HTMLElement>("[data-composer-label]")!;
      expect(label.textContent).toBe(branch);
      // Stock animates a label to its collapsed width, so read the width when that has ended.
      expect(label.getAnimations()).toHaveLength(0);
      expect(visibleWithin(cellBox, label)).toBe(true);
      expect(label.getBoundingClientRect().width).toBeGreaterThan(20);
    }
  });
});

it("one tab with one pane follows the stock setting, and a split adds the strip without a remount", async () => {
  const thread = threadWithHistory("strip-single", 1);
  using _environment = setup([thread]);
  await page.viewport(1280, 800);
  await using _app = await openThread(thread);
  const composer = page.getByTestId("composer-editor").element();
  const firstPaneId = getActiveTab(usePaneStore.getState().layout).focusedPaneId;

  // Stock: the setting is off, so a started thread has no strip.
  expect(document.querySelector(STRIP)).toBeNull();

  await act(() => usePaneStore.getState().splitPane(firstPaneId, "right"));
  await vi.waitFor(() => expect(document.querySelectorAll(STRIP)).toHaveLength(2));
  // The URL moves to the draft after its strip shows. A close before that leaves a late route.
  await vi.waitFor(() => expect(usePaneStore.getState().lastRouteKey).toMatch(/^draft:/), {
    timeout: 5_000,
  });
  const [threadCell, draftCell] = paneCells();
  expect(threadCell!.contains(composer)).toBe(true);
  // The strip of a new thread names the permissions too, as in stock.
  expect(stripOf(draftCell!)!.querySelector('[aria-label^="Permissions"]')).not.toBeNull();
  for (const cell of [threadCell!, draftCell!]) {
    expect(visibleWithin(cell.getBoundingClientRect(), stripOf(cell)!)).toBe(true);
  }

  // Back to one pane: stock again, with the same composer node.
  await act(() => usePaneStore.getState().closePane(draftCell!.dataset.splitpaneCell!));
  await vi.waitFor(() => expect(document.querySelector(STRIP)).toBeNull());
  expect(paneCells()).toHaveLength(1);
  expect(paneCells()[0]!.contains(composer)).toBe(true);
});

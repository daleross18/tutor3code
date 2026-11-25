import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { WS_METHODS, type PullRequestRef } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
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
  answerRpc,
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { serveThreadShells, threadPullRequest as pullRequest } from "../../test/paneThreadShell";
import { render } from "../../test/render";
import { usePaneStore } from "./paneStore";
import {
  createInitialLayout,
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

// The fake environment does not serve project files, and a new draft waits for that read.
vi.mock(import("~/lib/t3ProjectFileDefaults"), () => ({
  readT3ProjectFile: () => Promise.resolve(null),
}));

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

// The fake environment does not say that it can list checks.
vi.mock(import("./pullRequestChecksSupport"), () => ({
  usePullRequestChecksSupport: () => true,
}));

const STRIP = '[data-slot="composer-context-strip"]';
const CHIP = "[data-pull-request-chip]";

/** The stores outlive a test, so the test starts from this layout, no drafts and the defaults. */
function setup(threads: ReadonlyArray<FakeThread>, layout: PaneLayout) {
  usePaneStore.setState({ layout, lastRouteKey: null, fillingPaneIds: [] });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
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

/** One tab with the two threads side by side, the first one focused. */
function rowLayout(first: FakeThread, second: FakeThread): PaneLayout {
  const layout = createInitialLayout(targetOf(first));
  const tab = getActiveTab(layout);
  const split = splitLeaf(tab, tab.focusedPaneId, "right");
  const added = listLeaves(split.root).find((leaf) => leaf.id !== tab.focusedPaneId)!;
  return replaceTab(layout, {
    ...setLeafTarget(split, added.id, targetOf(second)),
    focusedPaneId: tab.focusedPaneId,
  });
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

/** Forces every pane to one width, which the viewport of the test cannot give two panes. */
function forcePaneWidth(widthPx: number): Disposable {
  const style = document.createElement("style");
  style.textContent = `[data-splitpane-cell] { width: ${widthPx}px !important; }`;
  document.head.append(style);
  return { [Symbol.dispose]: () => style.remove() };
}

const stripOf = (thread: FakeThread) => {
  const cell = [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")].find(
    (candidate) => candidate.textContent.includes(`Answer 0 for ${thread.id}.`),
  );
  const strip = cell?.querySelector<HTMLElement>(STRIP);
  if (!cell || !strip) throw new Error(`No pane shows the strip of ${thread.id}.`);
  return { cell, strip };
};
const shown = (element: Element) =>
  element.checkVisibility({ checkOpacity: true, visibilityProperty: true }) &&
  element.getBoundingClientRect().width > 0;
/** Every link of the strip to the pull request that shows: the stock badge and the chip. */
const shownLinks = (strip: HTMLElement, number: number) =>
  [...strip.querySelectorAll<HTMLElement>(`a[href$="/pull/${number}"]`)].filter(shown);

it("each pane shows the pull request of its own thread in the bottom bar, with the CI mark, and a narrow pane collapses it", async () => {
  const failing = threadWithHistory("chip-failing", 1);
  const plain = threadWithHistory("chip-none", 1);
  const link = pullRequest(42, "dale/failing", "open");
  using _environment = setup([failing, plain], rowLayout(failing, plain));
  using _shell = serveThreadShells(
    new Map([
      [
        failing,
        { pullRequests: [{ ...link, snapshot: { ...link.snapshot!, checksState: "failing" } }] },
      ],
    ]),
  );
  using _summary = answerRpc(WS_METHODS.pullRequestsSummary, (input: PullRequestRef) =>
    Effect.succeed({
      provider: "github",
      projectId: input.projectId,
      repository: input.repository,
      number: input.number,
      title: `Pull request ${input.number}`,
      url: `https://github.com/${input.repository}/pull/${input.number}`,
      state: "open",
      headBranch: "dale/failing",
      baseBranch: "dev",
      updatedAt: "2026-11-18T10:00:00.000Z",
      headSha: `sha${input.number}`,
      checksState: "failing",
    }),
  );
  using _checks = answerRpc(WS_METHODS.pullRequestsChecks, () =>
    Effect.succeed({
      state: "open",
      checks: [
        { name: "lint", status: "success", description: null, url: null },
        { name: "e2e", status: "failure", description: null, url: null },
      ],
    }),
  );
  await page.viewport(1700, 800);
  await using _app = await openThread(failing);

  // The pane of the thread with the pull request: the glyph, the number and the red mark, and
  // no lane name. The stock badge of the strip leaves, so one link names the pull request.
  await vi.waitFor(() => {
    const { cell, strip } = stripOf(failing);
    const chip = strip.querySelector<HTMLElement>(CHIP)!;
    expect(chip).not.toBeNull();
    expect(chip.dataset.pullRequestChip).toBe("open");
    expect(chip.querySelector("[data-pull-request-chip-mark]")).not.toBeNull();
    expect(
      chip.querySelector<HTMLElement>("[data-pull-request-chip-mark]")!.dataset.pullRequestChipMark,
    ).toBe("failed");
    expect(chip.textContent).toBe("#42");
    expect(strip.hasAttribute("data-compact")).toBe(false);
    expect(shown(chip.querySelector("[data-composer-label]")!)).toBe(true);
    const cellBox = cell.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    expect(chipBox.left).toBeGreaterThanOrEqual(cellBox.left);
    expect(chipBox.right).toBeLessThanOrEqual(cellBox.right);
    expect(shownLinks(strip, 42)).toEqual([chip.querySelector("a")]);
  });
  // The other pane shows a thread with no pull request: its strip has no chip.
  expect(stripOf(plain).strip.querySelector(CHIP)).toBeNull();

  // A narrow pane: the strip collapses its labels, and the chip keeps the glyph and the mark.
  {
    using _narrow = forcePaneWidth(220);
    await vi.waitFor(() => {
      const { cell, strip } = stripOf(failing);
      expect(Math.round(cell.getBoundingClientRect().width)).toBe(220);
      expect(strip.hasAttribute("data-compact")).toBe(true);
      const chip = strip.querySelector<HTMLElement>(CHIP)!;
      const label = chip.querySelector<HTMLElement>("[data-composer-label]")!;
      // Stock animates a label to its collapsed width, so read the width when that has ended.
      expect(label.getAnimations()).toHaveLength(0);
      expect(label.getBoundingClientRect().width).toBe(0);
      const cellBox = cell.getBoundingClientRect();
      for (const part of [
        chip.querySelector("svg")!,
        chip.querySelector("[data-pull-request-chip-mark] svg")!,
      ]) {
        const box = part.getBoundingClientRect();
        expect(shown(part)).toBe(true);
        expect(box.left).toBeGreaterThanOrEqual(cellBox.left);
        expect(box.right).toBeLessThanOrEqual(cellBox.right);
      }
    });

    // This pane has no right panel, so the click must not ask for one: it stays a plain link.
    // The stock action would stop the event before it reaches the document.
    const clicks: boolean[] = [];
    const record = (event: MouseEvent) => {
      clicks.push(event.defaultPrevented);
      // The test must not open the pull request in a new browser tab.
      event.preventDefault();
    };
    document.addEventListener("click", record);
    using _record = { [Symbol.dispose]: () => document.removeEventListener("click", record) };
    await page
      .elementLocator(stripOf(failing).strip.querySelector<HTMLElement>(`${CHIP} a`)!)
      .click();
    expect(clicks).toEqual([false]);
    expect(document.body.textContent).not.toContain("too narrow for the right panel");
  }

  // The setting off is stock: no chip, and the stock badge of the strip is back.
  useReadoutSettingsStore.getState().setReadoutSetting("showPullRequestChip", false);
  await vi.waitFor(() => {
    const { strip } = stripOf(failing);
    expect(document.querySelector(CHIP)).toBeNull();
    expect(shownLinks(strip, 42)).toHaveLength(1);
  });
});

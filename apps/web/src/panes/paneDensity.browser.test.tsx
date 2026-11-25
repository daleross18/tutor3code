import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { RunId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
import { useComposerDraftStore } from "~/composerDraftStore";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  assistantItem,
  installFakeEnvironment,
  threadWithHistory,
  userItem,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";
import {
  DEFAULT_PANE_DENSITY_SETTINGS,
  PANE_DENSITY_STORAGE_KEY,
  createPaneDensityStore,
  usePaneDensityStore,
  type ChatDensity,
  type PaneDensitySettings,
} from "./paneDensity";
import { usePaneStore } from "./paneStore";
import { createInitialLayout, getActiveTab, listLeaves } from "./paneTree";

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

const PROSE =
  "The pane host resolves one density for the active tab and writes it to the root element. " +
  "Every pane of the tab reads that value through the cascade, so a split changes the text " +
  "size and the spacing of each timeline without a new mount of any chat view.";

const ANSWER = [
  "## What changed",
  PROSE,
  "- The timeline rows sit closer together",
  "- The composer is shorter, so the timeline is taller",
  "- Code blocks and tables use the same multipliers",
  "```ts\nexport const clamp = (value: number, low: number, high: number) =>\n  Math.min(high, Math.max(low, value));\n```",
  "| Step | Tool | Result |\n| --- | --- | --- |\n| Read | `read` | 1 file |\n| Test | `execute` | 12 passed |",
  PROSE,
].join("\n\n");

/** Three turns, each with a user message, a reasoning row, a command row and a markdown answer. */
function denseThread(name: string): FakeThread {
  const history = threadWithHistory(name, 3);
  const items = history.runs.flatMap((_run, turn) => {
    const runId = RunId.make(`${name}-run-${turn}`);
    const item = (suffix: string, slot: number, text = "") =>
      assistantItem(history.id, runId, `${name}-${suffix}-${turn}`, turn * 4 + slot, text);
    const { messageId: _r, streaming: _rs, ...reasoning } = item("reasoning", 1, "Reading files.");
    const { messageId: _c, streaming: _cs, text: _ct, ...command } = item("command", 2);
    return [
      userItem(history.id, runId, `${name}-user-${turn}`, turn * 4, `${name}: request ${turn}`),
      { ...reasoning, type: "reasoning" as const, streaming: false },
      {
        ...command,
        type: "command_execution" as const,
        input: "pnpm exec vp test run src/panes",
        output: "12 passed",
        exitCode: 0,
      },
      item("assistant", 3, `Answer ${turn} for ${name}.\n\n${ANSWER}`),
    ];
  });
  return { ...history, items };
}

/** The stores outlive a test, so each test starts from one pane and the default densities. */
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
  usePaneDensityStore.setState(DEFAULT_PANE_DENSITY_SETTINGS);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  return installFakeEnvironment(threads);
}

async function openApp(path: string) {
  const router = getRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  // AppRoot brings its own router.
  return render(<AppRoot router={router} />, { router: false });
}

async function openThread(thread: FakeThread) {
  await using stack = new AsyncDisposableStack();
  stack.use(await openApp(`/${ENVIRONMENT_ID}/${thread.id}`));
  await expect.element(page.getByText(`Answer 0 for ${thread.id}.`)).toBeVisible();
  return stack.move();
}

const root = () => document.querySelector<HTMLElement>("[data-splitpane-root]")!;
const density = () => root().dataset.chatDensity;
const paneCells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
const paneIds = () =>
  listLeaves(getActiveTab(usePaneStore.getState().layout).root).map((leaf) => leaf.id);
const fontSize = (element: Element) => Number.parseFloat(getComputedStyle(element).fontSize);
const firstParagraph = (scope: ParentNode = document) =>
  scope.querySelector<HTMLElement>(".messages-timeline-scroll .chat-markdown p")!;
const composerStack = (scope: ParentNode = document) =>
  scope.querySelector<HTMLElement>('[data-chat-composer-stack="true"]')!;
/** The card alone. A split pane also keeps the strip under it, which one pane does not show. */
const composerCard = (scope: ParentNode = document) =>
  scope.querySelector<HTMLElement>('[data-chat-composer-form="true"]')!;
const timelineRows = (scope: ParentNode = document) => [
  ...scope.querySelectorAll<HTMLElement>(".messages-timeline-scroll [data-timeline-row-kind]"),
];
/** The rows hold their own gaps, so the sum does not depend on where the list has put them. */
const timelineContentHeight = (scope: ParentNode = document) =>
  timelineRows(scope).reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);

async function setDensity(key: keyof PaneDensitySettings, value: ChatDensity) {
  await act(() => usePaneDensityStore.getState().setDensity(key, value));
  await vi.waitFor(() => expect(usePaneDensityStore.getState()[key]).toBe(value));
}

async function splitFocusedPane() {
  const count = paneCells().length;
  const tab = getActiveTab(usePaneStore.getState().layout);
  await act(() => usePaneStore.getState().splitPane(tab.focusedPaneId, "right"));
  await vi.waitFor(() => expect(paneCells()).toHaveLength(count + 1));
}

/** What a layout reads: the box of every element of the pane host and its sizing styles. */
function layoutSnapshot(): ReadonlyArray<string> {
  const properties = ["font-size", "line-height", "padding", "margin", "gap", "vertical-align"];
  return [...root().querySelectorAll("*")].map((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const sizes = properties.map((property) => style.getPropertyValue(property)).join("|");
    return `${element.tagName} ${sizes} ${box.x},${box.y},${box.width},${box.height}`;
  });
}

function densitySheets(): ReadonlyArray<CSSStyleSheet> {
  return [...document.styleSheets].filter((sheet) =>
    [...sheet.cssRules].some((rule) => rule.cssText.includes("--fork-density-text")),
  );
}

it("one pane shows Normal by default, and Normal is the page with no density sheet", async () => {
  const thread = denseThread("density-normal");
  using _environment = setup([thread]);
  await page.viewport(1280, 900);
  await using _app = await openThread(thread);

  expect(usePaneDensityStore.getState()).toMatchObject({
    chatDensity: "normal",
    splitPaneDensity: "compact",
  });
  expect(density()).toBe("normal");
  expect(fontSize(firstParagraph())).toBe(14);

  const sheets = densitySheets();
  expect(sheets.length).toBeGreaterThan(0);
  const withSheet = layoutSnapshot();
  using _restore = {
    [Symbol.dispose]: () => {
      for (const sheet of sheets) sheet.disabled = false;
    },
  };
  for (const sheet of sheets) sheet.disabled = true;
  root().removeAttribute("data-chat-density");
  expect(layoutSnapshot()).toEqual(withSheet);
});

it("the first split turns every pane Compact with no remount, and one pane is Normal again", async () => {
  const thread = denseThread("density-split");
  using _environment = setup([thread]);
  await page.viewport(1280, 900);
  await using _app = await openThread(thread);
  const paragraph = firstParagraph();
  const composer = page.getByTestId("composer-editor").element();
  const normalComposerHeight = composerStack().getBoundingClientRect().height;
  const normalCardHeight = composerCard().getBoundingClientRect().height;
  expect(density()).toBe("normal");

  await splitFocusedPane();
  await vi.waitFor(() => expect(density()).toBe("compact"));
  // The same nodes, so the density change did not remount the first pane.
  expect(paragraph.isConnected).toBe(true);
  expect(composer.isConnected).toBe(true);
  expect(fontSize(paragraph)).toBeCloseTo(14 * 0.93, 1);
  expect(composerCard(paneCells()[0]!).getBoundingClientRect().height).toBeLessThan(
    normalCardHeight - 10,
  );
  // The new pane's draft screen reads the same density.
  await vi.waitFor(() =>
    expect(paneCells()[1]!.querySelector('[data-testid="composer-editor"]')).not.toBeNull(),
  );
  const draftEditor = paneCells()[1]!.querySelector('[data-testid="composer-editor"]')!;
  expect(fontSize(draftEditor)).toBeCloseTo(fontSize(composer), 2);
  // The URL moves to the draft after its composer shows. A close of the new pane before that
  // leaves a late route, which puts the draft in the first pane and mounts it again.
  await vi.waitFor(() => expect(usePaneStore.getState().lastRouteKey).toMatch(/^draft:/), {
    timeout: 5_000,
  });
  expect(fontSize(composer)).toBeCloseTo(14 * 0.93, 1);

  // Each setting acts in its own mode only.
  await setDensity("chatDensity", "very-compact");
  expect(density()).toBe("compact");
  await setDensity("splitPaneDensity", "very-compact");
  await vi.waitFor(() => expect(density()).toBe("very-compact"));
  expect(fontSize(paragraph)).toBeCloseTo(14 * 0.86, 1);
  await setDensity("splitPaneDensity", "normal");
  await vi.waitFor(() => expect(density()).toBe("normal"));
  expect(fontSize(paragraph)).toBe(14);
  await setDensity("splitPaneDensity", "compact");
  await setDensity("chatDensity", "normal");

  await act(() => usePaneStore.getState().closePane(paneIds()[1]!));
  await vi.waitFor(() => expect(paneCells()).toHaveLength(1));
  await vi.waitFor(() => expect(density()).toBe("normal"));
  expect(paragraph.isConnected).toBe(true);
  expect(fontSize(paragraph)).toBe(14);
  // The send button eases its size, so the composer reaches the stock height after a moment.
  await vi.waitFor(() =>
    expect(composerStack().getBoundingClientRect().height).toBe(normalComposerHeight),
  );

  // Two tabs of one pane each are not a split.
  await act(() => usePaneStore.getState().newTab());
  await vi.waitFor(() => expect(root().dataset.multi).toBe("true"));
  expect(density()).toBe("normal");
});

it("Compact and Very compact fit more of a thread into the same height, and follow the interface font size", async () => {
  const thread = denseThread("density-fit");
  using _environment = setup([thread]);
  // Tall, so the list mounts every row and each density measures the same rows.
  await page.viewport(1280, 2600);
  await using _app = await openThread(thread);
  // A finished turn folds its work. Open each fold, then each group of tool rows in it.
  const rowsOfKind = (kind: string) =>
    document.querySelectorAll<HTMLElement>(`[data-timeline-row-kind="${kind}"]`);
  for (const fold of rowsOfKind("turn-fold")) {
    await act(() => fold.querySelector("button")!.click());
  }
  await vi.waitFor(() => expect(rowsOfKind("work-toggle")).toHaveLength(3));
  for (const group of rowsOfKind("work-toggle")) {
    await act(() => group.querySelector("button")!.click());
  }
  await vi.waitFor(() => expect(rowsOfKind("work").length).toBeGreaterThanOrEqual(3));
  const rowCount = timelineRows().length;
  const paragraph = firstParagraph();

  const measure = async (value: ChatDensity) => {
    await setDensity("chatDensity", value);
    await vi.waitFor(() => expect(density()).toBe(value));
    expect(timelineRows()).toHaveLength(rowCount);
    return {
      content: timelineContentHeight(),
      composer: composerStack().getBoundingClientRect().height,
      text: fontSize(paragraph),
    };
  };
  const normal = await measure("normal");
  const compact = await measure("compact");
  const veryCompact = await measure("very-compact");
  const gain = (dense: { content: number }) => normal.content / dense.content;

  // The aim is 25% and 45% more timeline content for each pane height.
  expect(gain(compact)).toBeGreaterThan(1.15);
  expect(gain(compact)).toBeLessThan(1.4);
  expect(gain(veryCompact)).toBeGreaterThan(1.35);
  expect(gain(veryCompact)).toBeLessThan(1.7);
  expect(gain(veryCompact)).toBeGreaterThan(gain(compact) + 0.1);
  expect(normal.composer).toBeGreaterThan(compact.composer);
  expect(compact.composer).toBeGreaterThan(veryCompact.composer);
  expect([normal.text, compact.text, veryCompact.text]).toEqual([
    14,
    expect.closeTo(14 * 0.93, 1),
    expect.closeTo(14 * 0.86, 1),
  ]);

  // The sizes are multiples of `rem`, which the Interface font size setting defines, and of
  // the prompt and code sizes of Settings > Appearance > Typography.
  const rootStyle = document.documentElement.style;
  const stockRootStyle = rootStyle.cssText;
  using _restore = {
    [Symbol.dispose]: () => {
      rootStyle.cssText = stockRootStyle;
    },
  };
  rootStyle.fontSize = "20px";
  rootStyle.setProperty("--font-size-prompt", "18px");
  rootStyle.setProperty("--font-size-code", "15px");
  // Each check reads its node again: a later render can replace it, as seen for `code` under load.
  const editor = () => page.getByTestId("composer-editor").element();
  const code = () => document.querySelector(".messages-timeline-scroll .chat-markdown pre code")!;
  const workIcon = () =>
    document.querySelector<HTMLElement>(
      '[data-timeline-row-kind="work"] .align-\\[calc\\(0\\.5cap_-_0\\.75rem\\)\\]',
    )!;
  expect(fontSize(paragraph)).toBeCloseTo(0.875 * 20 * 0.86, 1);
  expect(fontSize(editor())).toBeCloseTo(18 * 0.86, 1);
  expect(fontSize(code())).toBeCloseTo(15 * 0.86, 1);
  // The icon box of a work row and its offset on the text line shrink together.
  expect(workIcon().getBoundingClientRect().height).toBeCloseTo(1.5 * 20 * 0.75, 1);
  const veryCompactIconOffset = getComputedStyle(workIcon()).verticalAlign;
  await setDensity("chatDensity", "normal");
  await vi.waitFor(() => expect(density()).toBe("normal"));
  await vi.waitFor(() => {
    expect(fontSize(firstParagraph())).toBeCloseTo(0.875 * 20, 3);
    expect(fontSize(editor())).toBe(18);
    expect(fontSize(code())).toBe(15);
    expect(getComputedStyle(workIcon()).verticalAlign).not.toBe(veryCompactIconOffset);
  });
});

it("the composer of a small pane stays inside the pane and shrinks with each density", async () => {
  const thread = denseThread("density-small");
  using _environment = setup([thread]);
  await page.viewport(1280, 900);
  await using _app = await openThread(thread);
  await splitFocusedPane();
  await vi.waitFor(() => expect(density()).toBe("compact"));
  // The layout is a set of fractions, so a small window gives panes near the minimum size.
  await page.viewport(520, 300);

  const heights: number[] = [];
  for (const value of ["normal", "compact", "very-compact"] as const) {
    await setDensity("splitPaneDensity", value);
    await vi.waitFor(() => expect(density()).toBe(value));
    const cell = paneCells()[0]!;
    const cellBox = cell.getBoundingClientRect();
    expect(cellBox.width).toBeLessThan(280);
    const stack = composerStack(cell).getBoundingClientRect();
    expect(stack.bottom).toBeLessThanOrEqual(cellBox.bottom);
    expect(stack.left).toBeGreaterThanOrEqual(cellBox.left);
    expect(stack.right).toBeLessThanOrEqual(cellBox.right);
    // No row is wider than the pane, so the smaller text never needs a horizontal scroll.
    const scroller = cell.querySelector<HTMLElement>(".messages-timeline-scroll")!;
    expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth);
    heights.push(stack.height);
  }
  expect(heights[0]!).toBeGreaterThan(heights[1]!);
  expect(heights[1]!).toBeGreaterThan(heights[2]!);
});

it("Settings > Appearance sets both densities, and a new store reads them from storage", async () => {
  using _environment = setup([threadWithHistory("density-settings", 1)]);
  await page.viewport(1280, 900);
  await using _app = await openApp("/settings/appearance");

  const chat = page.getByRole("combobox", { name: "Chat density", exact: true });
  const split = page.getByRole("combobox", { name: "Split pane density", exact: true });
  await expect.element(chat).toHaveTextContent("Normal");
  await expect.element(split).toHaveTextContent("Compact");
  await expect.element(page.getByText("Applies when a tab shows two or more panes.")).toBeVisible();

  await split.click();
  await page.getByRole("option", { name: "Very compact", exact: true }).click();
  await expect.element(split).toHaveTextContent("Very compact");
  await chat.click();
  await page.getByRole("option", { name: "Compact", exact: true }).click();
  await expect.element(chat).toHaveTextContent("Compact");
  expect(usePaneDensityStore.getState()).toMatchObject({
    chatDensity: "compact",
    splitPaneDensity: "very-compact",
  });

  // What a reload does: a new store on the same browser storage.
  expect(window.localStorage.getItem(PANE_DENSITY_STORAGE_KEY)).toContain("very-compact");
  expect(createPaneDensityStore(window.localStorage).getState()).toMatchObject({
    chatDensity: "compact",
    splitPaneDensity: "very-compact",
  });

  await page.getByRole("button", { name: "Reset split pane density to default" }).click();
  await expect.element(split).toHaveTextContent("Compact");
  await page.getByRole("button", { name: "Reset chat density to default" }).click();
  await expect.element(chat).toHaveTextContent("Normal");
  expect(usePaneDensityStore.getState()).toMatchObject(DEFAULT_PANE_DENSITY_SETTINGS);
});

import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { RunId } from "@t3tools/contracts";
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
import { useRightPanelStore } from "~/rightPanelStore";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  assistantItem,
  dispatchedCommands,
  emitThreadEvent,
  installFakeEnvironment,
  isThreadSubscribed,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";
import { DEFAULT_PANE_DENSITY_SETTINGS, usePaneDensityStore } from "./paneDensity";
import { usePaneStore } from "./paneStore";
import { createInitialLayout, getActiveTab, listLeaves } from "./paneTree";
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

const paneCells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
const paneThreadIds = () =>
  listLeaves(getActiveTab(usePaneStore.getState().layout).root).map((leaf) =>
    leaf.target?.kind === "server" ? leaf.target.threadRef.threadId : (leaf.target?.kind ?? null),
  );
const activeCellIndex = () =>
  paneCells().findIndex((cell) => cell.contains(document.activeElement));
const focusedCellIndex = () => paneCells().findIndex((cell) => cell.dataset.paneFocused === "true");
const composers = () => [
  ...document.querySelectorAll<HTMLElement>('[data-testid="composer-editor"]'),
];
const composerTexts = () => composers().map((composer) => composer.textContent);
const scrollerOf = (cell: HTMLElement) =>
  cell.querySelector<HTMLElement>(".messages-timeline-scroll")!;
const distanceFromEnd = (scroller: HTMLElement) =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
const lastAnswerOf = (thread: FakeThread, turns: number) => `Answer ${turns - 1} for ${thread.id}.`;
// Not an element locator: that is a selector of the text the pane had when it was made, and a
// pane changes its text with its thread.
const expectPaneShows = (cell: HTMLElement, text: string) =>
  vi.waitFor(() => expect(cell.textContent).toContain(text));

/** Where the caret is in the text of the composer, in characters from the start. */
function caretOffset(composer: HTMLElement): number {
  const selection = document.getSelection()!;
  const before = document.createRange();
  before.setStart(composer, 0);
  before.setEnd(selection.focusNode!, selection.focusOffset);
  return before.toString().length;
}

/** Opens `thread` in one pane, splits it, and returns the router. The new pane has focus. */
async function openSplit(thread: FakeThread, turns: number) {
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
  await expect.element(page.getByText(lastAnswerOf(thread, turns))).toBeVisible();
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => {
    expect(paneThreadIds()).toEqual([thread.id, "draft"]);
    expect(composers()).toHaveLength(2);
    // The route of the new draft is placed. A later route is then a route of the test.
    expect(usePaneStore.getState().lastRouteKey).toMatch(/^draft:/);
  });
  const toThread = (target: FakeThread) =>
    router.navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: ENVIRONMENT_ID, threadId: target.id },
    });
  return { router, toThread, stack: stack.move() };
}

/** Both panes show `thread`, and the second pane has focus. */
async function openMirror(thread: FakeThread) {
  const app = await openSplit(thread, 1);
  await using stack = new AsyncDisposableStack();
  stack.use(app.stack);
  // What a click in the sidebar does: the route names the thread of the first pane.
  await app.toThread(thread);
  await vi.waitFor(() => expect(paneThreadIds()).toEqual([thread.id, thread.id]));
  for (const cell of paneCells()) {
    await expectPaneShows(cell, lastAnswerOf(thread, 1));
  }
  expect(focusedCellIndex()).toBe(1);
  return { ...app, stack: stack.move() };
}

// The first test of a file also pays for the first load of the app, so the short test is first.
it("closing one of two panes that show one thread leaves the thread and the other pane as they are", async () => {
  const thread = threadWithHistory("mirror-close", 1);
  using _environment = setup([thread], { acceptCommands: true });
  await page.viewport(1440, 700);
  const app = await openMirror(thread);
  await using _app = app.stack;
  const [firstCell] = paneCells();
  const firstComposer = composers()[0]!;
  await userEvent.click(composers()[1]!);
  await userEvent.keyboard("keep");
  await vi.waitFor(() => expect(composerTexts()).toEqual(["keep", "keep"]));
  const commandsBefore = dispatchedCommands().length;

  await userEvent.keyboard("{ControlOrMeta>}w{/ControlOrMeta}");
  await vi.waitFor(() => expect(paneCells()).toHaveLength(1));
  expect(paneThreadIds()).toEqual([thread.id]);
  // The same mounted view, with the shared text, and the keyboard in it.
  expect(paneCells()[0]).toBe(firstCell);
  expect(composers()).toEqual([firstComposer]);
  expect(firstComposer.textContent).toBe("keep");
  await vi.waitFor(() => expect(firstCell!.contains(document.activeElement)).toBe(true));
  expect(app.router.state.location.pathname.endsWith(`/${thread.id}`)).toBe(true);
  // No stop, no archive and no other command went to the server.
  expect(dispatchedCommands()).toHaveLength(commandsBefore);
  expect(isThreadSubscribed(thread.id)).toBe(true);
  const live = assistantItem(
    thread.id,
    RunId.make(`${thread.id}-run-0`),
    `${thread.id}-live`,
    2,
    "Live answer after the close.",
  );
  await act(() => emitThreadEvent(thread.id, { type: "turn-item.updated", payload: live }));
  await expectPaneShows(firstCell!, "Live answer after the close.");
});

it("two panes that show one thread share its composer text: typing in one shows in the other, with no caret jump, and one send goes out", async () => {
  const thread = threadWithHistory("mirror-type", 1);
  using _environment = setup([thread], { acceptCommands: true });
  await page.viewport(1440, 700);
  const app = await openMirror(thread);
  await using _app = app.stack;
  const [firstCell, secondCell] = paneCells();

  await userEvent.click(composers()[1]!);
  await userEvent.keyboard("o");
  await vi.waitFor(() => expect(composerTexts()).toEqual(["o", "o"]));
  let draftWrites = 0;
  const stopCount = useComposerDraftStore.subscribe((state, previous) => {
    if (state.draftsByThreadKey !== previous.draftsByThreadKey) draftWrites += 1;
  });
  await userEvent.keyboard("n");
  await vi.waitFor(() => expect(composerTexts()).toEqual(["on", "on"]));
  await userEvent.keyboard("e");
  await vi.waitFor(() => expect(composerTexts()).toEqual(["one", "one"]));
  stopCount();
  // One typed character is one write of the shared draft: the mirror writes nothing back.
  expect(draftWrites).toBe(2);
  await userEvent.keyboard("two");
  await vi.waitFor(() => expect(composerTexts()).toEqual(["onetwo", "onetwo"]));
  expect(activeCellIndex()).toBe(1);
  expect(caretOffset(composers()[1]!)).toBe(6);
  // The caret of the pane that types stays where the user put it.
  await userEvent.keyboard("{ArrowLeft}{ArrowLeft}X");
  await vi.waitFor(() => expect(composerTexts()).toEqual(["onetXwo", "onetXwo"]));
  expect(caretOffset(composers()[1]!)).toBe(5);
  expect(activeCellIndex()).toBe(1);

  // The other pane types into the same text, at its own caret, which is at the end.
  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(0));
  await vi.waitFor(() => expect(activeCellIndex()).toBe(0));
  await userEvent.keyboard("!");
  await vi.waitFor(() => expect(composerTexts()).toEqual(["onetXwo!", "onetXwo!"]));

  await userEvent.keyboard("{Enter}");
  const sends = () => dispatchedCommands().filter((command) => command.type === "message.dispatch");
  await vi.waitFor(() => expect(sends()).toHaveLength(1));
  expect(sends()[0]).toMatchObject({ threadId: thread.id, text: "onetXwo!" });
  await vi.waitFor(() => expect(composerTexts()).toEqual(["", ""]));
  expect(sends()).toHaveLength(1);

  // Both panes stay subscribed to the thread and render what arrives.
  const live = assistantItem(
    thread.id,
    RunId.make(`${thread.id}-run-0`),
    `${thread.id}-live`,
    2,
    "Live answer for both panes.",
  );
  await act(() => emitThreadEvent(thread.id, { type: "turn-item.updated", payload: live }));
  for (const cell of [firstCell!, secondCell!]) {
    await expectPaneShows(cell, "Live answer for both panes.");
  }
});

it("a route to a thread that another pane shows opens it in the focused pane, and the other pane stays as it is", async () => {
  const TURNS = 12;
  const first = threadWithHistory("mirror-route-a", TURNS);
  const second = threadWithHistory("mirror-route-b", 1);
  using _environment = setup([first, second]);
  await page.viewport(1440, 700);
  const app = await openSplit(first, TURNS);
  await using _app = app.stack;
  await app.toThread(second);
  const [firstCell, secondCell] = paneCells();
  await expectPaneShows(secondCell!, lastAnswerOf(second, 1));
  await userEvent.click(composers()[1]!);
  expect(activeCellIndex()).toBe(1);

  // The first pane is passive and scrolled away from its end.
  const firstScroller = scrollerOf(firstCell!);
  firstScroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -2000, bubbles: true }));
  firstScroller.scrollTop = 0;
  await vi.waitFor(() => expect(distanceFromEnd(scrollerOf(firstCell!))).toBeGreaterThan(200));
  const firstComposer = composers()[0]!;
  const firstLeaf = listLeaves(getActiveTab(usePaneStore.getState().layout).root)[0]!;

  // What the sidebar, the thread keys, the command palette and a link do.
  await app.toThread(first);
  await vi.waitFor(() => expect(paneThreadIds()).toEqual([first.id, first.id]));
  // The focused pane shows the thread at its end, and keeps the keyboard.
  await expectPaneShows(secondCell!, lastAnswerOf(first, TURNS));
  expect(secondCell!.textContent).not.toContain(lastAnswerOf(second, 1));
  expect(focusedCellIndex()).toBe(1);
  await vi.waitFor(() => expect(activeCellIndex()).toBe(1));
  expect(app.router.state.location.pathname.endsWith(`/${first.id}`)).toBe(true);
  // The other pane: the same leaf, the same mounted view, the same scroll position, no focus.
  expect(listLeaves(getActiveTab(usePaneStore.getState().layout).root)[0]).toBe(firstLeaf);
  expect(paneCells()[0]).toBe(firstCell);
  expect(composers()[0]).toBe(firstComposer);
  expect(scrollerOf(firstCell!)).toBe(firstScroller);
  expect(firstScroller.scrollTop).toBeLessThan(2);
  expect(distanceFromEnd(firstScroller)).toBeGreaterThan(200);
  expect(firstCell!.dataset.paneFocused).toBe("false");

  // A route away from the mirror changes the focused pane only.
  await app.toThread(second);
  await vi.waitFor(() => expect(paneThreadIds()).toEqual([first.id, second.id]));
  expect(focusedCellIndex()).toBe(1);
  expect(firstScroller.scrollTop).toBeLessThan(2);

  // With the setting off, the pane that shows the thread takes the focus and the keyboard.
  useReadoutSettingsStore.setState({ mirrorPanes: false });
  await app.toThread(first);
  await vi.waitFor(() => expect(focusedCellIndex()).toBe(0));
  await vi.waitFor(() => expect(activeCellIndex()).toBe(0));
  expect(paneThreadIds()).toEqual([first.id, second.id]);
});

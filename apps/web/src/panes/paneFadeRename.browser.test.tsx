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

const FIRST = threadWithHistory("fade-first", 1);
const SECOND = threadWithHistory("fade-second", 1);
const THIRD = threadWithHistory("fade-third", 1);

const targetOf = (thread: FakeThread) =>
  ({ kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, thread.id) }) as const;

/** Two tabs of one pane each, with the first tab active. */
function twoTabLayout(): PaneLayout {
  const layout = addTab(createInitialLayout(targetOf(FIRST)), createTab(targetOf(SECOND)));
  return activateTab(layout, layout.tabs[0]!.id);
}

/** One tab of two panes, the first pane on the first thread and focused. */
function twoPaneLayout(): PaneLayout {
  const layout = createInitialLayout(targetOf(FIRST));
  const tab = getActiveTab(layout);
  const split = splitLeaf(tab, tab.focusedPaneId, "right");
  return replaceTab(layout, {
    ...split,
    root:
      split.root.kind === "split"
        ? {
            ...split.root,
            children: split.root.children.map((child, index) =>
              index === 1 && child.kind === "leaf" ? { ...child, target: targetOf(SECOND) } : child,
            ),
          }
        : split.root,
    focusedPaneId: tab.focusedPaneId,
  });
}

function setup(layout: PaneLayout, fillingPaneIds: string[] = []) {
  usePaneStore.setState({ layout, lastRouteKey: null, fillingPaneIds });
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

async function openApp() {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${FIRST.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(await render(<AppRoot router={router} />, { router: false }));
  await expect.element(page.getByText(`Answer 0 for ${FIRST.id}.`)).toBeVisible();
  return stack.move();
}

/** A real mouse, so the click count and the pointer events act as they do for a user. */
async function mouseClick(
  at: { x: number; y: number },
  clickCount = 1,
  button: "left" | "right" = "left",
) {
  const frame = window.frameElement?.getBoundingClientRect();
  const point = { x: at.x + (frame?.left ?? 0), y: at.y + (frame?.top ?? 0) };
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  for (let count = 1; count <= clickCount; count++) {
    for (const type of ["mousePressed", "mouseReleased"] as const) {
      await cdp().send("Input.dispatchMouseEvent", {
        type,
        ...point,
        button,
        buttons: type === "mousePressed" ? (button === "left" ? 1 : 2) : 0,
        clickCount: count,
      });
    }
  }
}

const centerOf = (element: Element) => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
const tabElement = (tabId: string) => {
  const found = document.querySelector<HTMLElement>(`[data-pane-tab="${tabId}"]`);
  if (found === null) throw new Error(`No tab ${tabId}`);
  return found;
};
const tabLabel = (tabId: string) => tabElement(tabId).querySelector('[role="tab"]');
const nameInput = () => document.querySelector<HTMLInputElement>("[data-pane-tab-name-input]");
const tabName = (tabId: string) =>
  usePaneStore.getState().layout.tabs.find((tab) => tab.id === tabId)?.name;

async function startRename(tabId: string) {
  await mouseClick(centerOf(tabLabel(tabId)!), 2);
  await vi.waitFor(() => expect(document.activeElement).toBe(nameInput()));
}

it("renames a tab on a double-click, keeps the name on Escape, and clears it when empty", async () => {
  using _environment = setup(twoTabLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp();
  const [first, second] = usePaneStore.getState().layout.tabs.map((tab) => tab.id) as [
    string,
    string,
  ];
  await vi.waitFor(() => expect(tabLabel(second)?.textContent).not.toBe("Thread"));
  const automatic = tabLabel(second)!.textContent!;

  // The double-click activates the tab, opens the field with the shown label, and moves nothing.
  await startRename(second);
  expect(usePaneStore.getState().layout.activeTabId).toBe(second);
  expect(usePaneStore.getState().layout.tabs.map((tab) => tab.id)).toEqual([first, second]);
  expect(nameInput()!.value).toBe(automatic);
  await userEvent.keyboard("Review notes");
  // An Enter that confirms an IME candidate does not end the edit.
  nameInput()!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }),
  );
  expect(tabName(second)).toBeUndefined();
  await userEvent.keyboard("{Enter}");
  expect(nameInput()).toBeNull();
  expect(tabName(second)).toBe("Review notes");
  await vi.waitFor(() => expect(tabLabel(second)?.textContent).toBe("Review notes"));
  expect(tabElement(second).querySelector('[aria-label="Close tab Review notes"]')).not.toBeNull();

  await startRename(second);
  expect(nameInput()!.value).toBe("Review notes");
  await userEvent.keyboard("Other{Escape}");
  expect(nameInput()).toBeNull();
  expect(tabName(second)).toBe("Review notes");
  expect(tabLabel(second)?.textContent).toBe("Review notes");

  await startRename(second);
  await userEvent.keyboard("{Backspace}{Enter}");
  expect(tabName(second)).toBeUndefined();
  await vi.waitFor(() => expect(tabLabel(second)?.textContent).toBe(automatic));

  // The automatic label saved unchanged stays automatic, and a press elsewhere saves.
  await startRename(second);
  await userEvent.keyboard("{Enter}");
  expect(tabName(second)).toBeUndefined();
  await startRename(first);
  await userEvent.keyboard("Main");
  await mouseClick(centerOf(document.querySelector("[data-splitpane-grid]")!));
  await vi.waitFor(() => expect(tabName(first)).toBe("Main"));
  expect(nameInput()).toBeNull();

  // The context menu of a tab has "Rename tab".
  await mouseClick(centerOf(tabLabel(second)!), 1, "right");
  await page.getByText("Rename tab").click();
  await vi.waitFor(() => expect(document.activeElement).toBe(nameInput()));
  await userEvent.keyboard("From menu{Enter}");
  expect(tabName(second)).toBe("From menu");

  // The thread title changes while the field shows the automatic label: saved unchanged, the
  // label stays automatic and follows the new title.
  usePaneStore.getState().renameTab(second, "");
  await mouseClick(centerOf(tabLabel(second)!), 1, "right");
  await page.getByText("Rename tab").click();
  await vi.waitFor(() => expect(document.activeElement).toBe(nameInput()));
  expect(nameInput()!.value).toBe(automatic);
  const { layout } = usePaneStore.getState();
  const secondTab = layout.tabs.find((tab) => tab.id === second)!;
  const leaf = secondTab.root;
  if (leaf.kind !== "leaf") throw new Error("The second tab has one pane");
  usePaneStore.setState({
    layout: replaceTab(layout, { ...secondTab, root: { ...leaf, target: targetOf(THIRD) } }),
  });
  await vi.waitFor(() =>
    expect(
      tabElement(second).querySelector(`[aria-label="Close tab ${THIRD.title}"]`),
    ).not.toBeNull(),
  );
  await userEvent.keyboard("{Enter}");
  expect(tabName(second)).toBeUndefined();
  await vi.waitFor(() => expect(tabLabel(second)?.textContent).toBe(THIRD.title));
});

it("returns the keyboard to an empty pane when a rename ends", async () => {
  const layout = addTab(createInitialLayout(targetOf(FIRST)), createTab(null));
  const empty = layout.tabs[1]!;
  using _environment = setup(activateTab(layout, layout.tabs[0]!.id), [empty.focusedPaneId]);
  await page.viewport(1280, 800);
  await using _app = await openApp();

  await startRename(empty.id);
  await userEvent.keyboard("Scratch{Enter}");
  expect(tabName(empty.id)).toBe("Scratch");
  const cell = document.querySelector(`[data-splitpane-cell="${empty.focusedPaneId}"]`)!;
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(cell.querySelector("[data-pane-empty]")),
  );
});

it("fades the pane without focus in a tab of two panes, and nothing else", async () => {
  using _environment = setup(twoPaneLayout());
  await page.viewport(1280, 800);
  await using _app = await openApp();
  const root = document.querySelector<HTMLElement>("[data-splitpane-root]")!;
  const cells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
  const veilOpacity = (cell: HTMLElement) => getComputedStyle(cell, "::before").opacity;
  const veiled = (cell: HTMLElement) => getComputedStyle(cell, "::before").content !== "none";
  await vi.waitFor(() => expect(cells()).toHaveLength(2));
  const [left, right] = cells() as [HTMLElement, HTMLElement];

  expect(root.dataset.fadePanes).toBe("");
  expect(left.dataset.paneFocused).toBe("true");
  expect(left.dataset.paneFaded).toBeUndefined();
  expect(right.dataset.paneFaded).toBe("true");
  expect(veilOpacity(right)).toBe("0.3");
  expect(veilOpacity(left)).toBe("0");
  // The focus ring of the focused pane (its own pseudo-element) still shows.
  expect(getComputedStyle(left, "::after").boxShadow).not.toBe("none");
  // The veil takes no pointer event: a press on the faded pane focuses it.
  expect(getComputedStyle(right, "::before").pointerEvents).toBe("none");
  await mouseClick(centerOf(right));
  await vi.waitFor(() => expect(right.dataset.paneFocused).toBe("true"));
  expect(right.dataset.paneFaded).toBeUndefined();
  expect(left.dataset.paneFaded).toBe("true");

  useReadoutSettingsStore.setState({ fadeUnfocusedPanes: false });
  await vi.waitFor(() => expect(root.dataset.fadePanes).toBeUndefined());
  expect(cells().filter((cell) => cell.dataset.paneFaded !== undefined)).toHaveLength(0);
  expect(cells().filter(veiled)).toHaveLength(0);

  useReadoutSettingsStore.setState({ fadeUnfocusedPanes: true });
  usePaneStore.setState({ layout: twoTabLayout() });
  await vi.waitFor(() => expect(cells()).toHaveLength(1));
  expect(root.dataset.fadePanes).toBeUndefined();
  expect(cells()[0]!.dataset.paneFaded).toBeUndefined();
  expect(cells().filter(veiled)).toHaveLength(0);
});

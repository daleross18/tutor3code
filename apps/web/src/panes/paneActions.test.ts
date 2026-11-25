import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildThreadRouteParams, type ThreadRouteTarget } from "../threadRoutes";
import { activateTab, closeTab, focusPane, runPaneCommand } from "./paneActions";
import { panePanelShortcuts, resolvePaneThreadRef } from "./paneContext";
import { literalKey, locationForTarget } from "./paneRouteSync";
import { usePaneStore } from "./paneStore";
import { createInitialLayout, getActiveTab, isMultiLayout, listLeaves } from "./paneTree";

const server = (threadId: string): ThreadRouteTarget => ({
  kind: "server",
  threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(threadId)),
});

const focusedPaneId = () => getActiveTab(usePaneStore.getState().layout).focusedPaneId;
const activeTargets = () =>
  listLeaves(getActiveTab(usePaneStore.getState().layout).root).map((leaf) => leaf.target);
const focusedTarget = () =>
  listLeaves(getActiveTab(usePaneStore.getState().layout).root).find(
    (leaf) => leaf.id === focusedPaneId(),
  )?.target;

/** One pane that shows `route`, and a router whose URL names `route`. */
function setup(route: ThreadRouteTarget) {
  usePaneStore.setState({
    layout: createInitialLayout(route),
    lastRouteKey: literalKey(route),
    fillingPaneIds: [],
  });
  const navigate = vi.fn(() => Promise.resolve());
  const router = {
    state: {
      matches: [{ params: route.kind === "server" ? buildThreadRouteParams(route.threadRef) : {} }],
    },
    navigate,
  } as unknown as AnyRouter;
  return { router, navigate, store: usePaneStore.getState() };
}

/** Adds a pane beside the focused one. The new pane takes focus and shows `target`. */
function addPane(target: ThreadRouteTarget | null) {
  const store = usePaneStore.getState();
  store.splitPane(focusedPaneId(), "right");
  if (target !== null) store.setPaneTarget(focusedPaneId(), target);
  return focusedPaneId();
}

describe("pane actions", () => {
  it("moves the URL to the pane that takes focus, with a replace navigation", () => {
    const { router, navigate } = setup(server("A"));
    const first = focusedPaneId();
    addPane(server("B"));

    runPaneCommand(router, "layout.focusLeft");
    expect(focusedPaneId()).toBe(first);
    // The URL already names thread A, so nothing moves.
    expect(navigate).not.toHaveBeenCalled();

    runPaneCommand(router, "layout.focusRight");
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      ...locationForTarget(server("B")),
      replace: true,
    });
  });

  it("does nothing on a focus move with no pane in that direction", () => {
    const { router, navigate } = setup(server("A"));
    const second = addPane(server("B"));
    runPaneCommand(router, "layout.focusRight");
    runPaneCommand(router, "layout.focusUp");
    expect(focusedPaneId()).toBe(second);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves the URL as it is when an empty pane takes focus", () => {
    const { router, navigate } = setup(server("A"));
    const first = focusedPaneId();
    const empty = addPane(null);
    focusPane(router, first);
    focusPane(router, empty);
    expect(focusedPaneId()).toBe(empty);
    expect(navigate).not.toHaveBeenCalled();
    expect(activeTargets()).toEqual([server("A"), null]);
  });

  it("closes the focused pane and opens the thread of the pane that takes focus", () => {
    const { router, navigate } = setup(server("A"));
    addPane(server("B"));
    addPane(server("C"));
    runPaneCommand(router, "layout.closePane");
    expect(activeTargets()).toEqual([server("A"), server("B")]);
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      ...locationForTarget(server("B")),
      replace: true,
    });
  });

  it("shows the URL's thread when a close leaves one empty pane", () => {
    const { router, navigate } = setup(server("A"));
    const first = focusedPaneId();
    addPane(null);
    focusPane(router, first);
    runPaneCommand(router, "layout.closePaneNow");
    expect(isMultiLayout(usePaneStore.getState().layout)).toBe(false);
    expect(activeTargets()).toEqual([server("A")]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("steps through the tabs in both directions and wraps", () => {
    const { router, navigate, store } = setup(server("A"));
    for (const threadId of ["B", "C"]) {
      store.newTab();
      store.setPaneTarget(focusedPaneId(), server(threadId));
    }
    // Tabs: A, B, C. Tab C is active.
    runPaneCommand(router, "layout.nextTab");
    expect(focusedTarget()).toEqual(server("A"));
    runPaneCommand(router, "layout.previousTab");
    expect(focusedTarget()).toEqual(server("C"));
    expect(navigate).toHaveBeenLastCalledWith({ ...locationForTarget(server("C")), replace: true });
  });

  it("jumps to a tab by position, to the last tab on 9, and ignores a missing position", () => {
    const { router, navigate, store } = setup(server("A"));
    for (const threadId of ["B", "C"]) {
      store.newTab();
      store.setPaneTarget(focusedPaneId(), server(threadId));
    }
    runPaneCommand(router, "layout.tab.jump.1");
    expect(focusedTarget()).toEqual(server("A"));
    runPaneCommand(router, "layout.tab.jump.9");
    expect(focusedTarget()).toEqual(server("C"));
    runPaneCommand(router, "layout.tab.jump.2");
    expect(focusedTarget()).toEqual(server("B"));
    navigate.mockClear();
    runPaneCommand(router, "layout.tab.jump.5");
    runPaneCommand(router, "layout.tab.jump.2");
    expect(focusedTarget()).toEqual(server("B"));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("activates and closes a tab by id, as the tab bar does", () => {
    const { router, navigate, store } = setup(server("A"));
    const firstTabId = store.layout.activeTabId;
    store.newTab();
    store.setPaneTarget(focusedPaneId(), server("B"));
    activateTab(router, firstTabId);
    expect(focusedTarget()).toEqual(server("A"));
    closeTab(router, firstTabId);
    expect(usePaneStore.getState().layout.tabs).toHaveLength(1);
    expect(focusedTarget()).toEqual(server("B"));
    expect(navigate).toHaveBeenLastCalledWith({ ...locationForTarget(server("B")), replace: true });
  });

  it("leaves a new tab empty when no project exists to start a draft in", async () => {
    const { router, navigate } = setup(server("A"));
    runPaneCommand(router, "layout.newTab");
    await vi.waitFor(() => expect(usePaneStore.getState().fillingPaneIds).toEqual([]));
    expect(focusedTarget()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("closes the active tab and opens the thread of the tab that becomes active", () => {
    const { router, navigate, store } = setup(server("A"));
    store.newTab();
    store.setPaneTarget(focusedPaneId(), server("B"));
    runPaneCommand(router, "layout.closeTab");
    expect(usePaneStore.getState().layout.tabs).toHaveLength(1);
    expect(activeTargets()).toEqual([server("A")]);
    // The fake URL still names thread A.
    expect(navigate).not.toHaveBeenCalled();
  });
  it("reads a pane's own thread for its route-bound panels, also in the focused pane", () => {
    const own = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("own"));
    const route = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("route"));
    // The store focuses a pane before the router commits: the route still names the old pane.
    expect(resolvePaneThreadRef({ multi: true, threadRef: own }, route)).toBe(own);
    expect(resolvePaneThreadRef({ multi: true, threadRef: null }, route)).toBeNull();
    // One tab with one pane, and a panel outside a pane, read the route as stock does.
    expect(resolvePaneThreadRef({ multi: false, threadRef: null }, route)).toBe(route);
    expect(resolvePaneThreadRef(null, route)).toBe(route);
  });

  it("turns the right-panel keys of a narrow pane off and lets their key events go on", () => {
    const run = vi.fn();
    const shortcuts = {
      "rightPanel.toggle": run,
      "rightPanel.toggleMaximized": run,
      "rightPanel.close": run,
      "diff.toggle": run,
      "threadPanel.toggle": run,
    };
    expect(panePanelShortcuts(shortcuts, false)).toBe(shortcuts);

    const narrow = panePanelShortcuts(shortcuts, true);
    const context = { event: {} as KeyboardEvent, terminalFocusOwner: null };
    for (const command of [
      "rightPanel.toggle",
      "rightPanel.toggleMaximized",
      "rightPanel.close",
      "diff.toggle",
    ] as const) {
      // False is "not handled": the close key then reaches the pane.
      expect(narrow[command](context)).toBe(false);
    }
    expect(run).not.toHaveBeenCalled();
    // The thread details are not part of the right panel.
    narrow["threadPanel.toggle"](context);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

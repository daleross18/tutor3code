import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "../composerDraftStore";
import { createMemoryStorage } from "../lib/storage";
import type { ThreadRouteTarget } from "../threadRoutes";
import { PANE_STORAGE_KEY, createPaneStore, usePaneStore } from "./paneStore";
import { getActiveTab, isMultiLayout, listLeaves, type PaneLayout } from "./paneTree";

const server = (threadId: string): ThreadRouteTarget => ({
  kind: "server",
  threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(threadId)),
});
const draft = (draftId: string): ThreadRouteTarget => ({
  kind: "draft",
  draftId: DraftId.make(draftId),
});

const focusedPaneId = (layout: PaneLayout) => getActiveTab(layout).focusedPaneId;
const activeTargets = (layout: PaneLayout) =>
  listLeaves(getActiveTab(layout).root).map((leaf) => leaf.target);

function expectInitialLayout(layout: PaneLayout) {
  expect(layout.tabs).toHaveLength(1);
  expect(isMultiLayout(layout)).toBe(false);
  expect(activeTargets(layout)).toEqual([null]);
}

describe("paneStore", () => {
  it("keeps the app layout under the fork's own storage key", () => {
    expect(usePaneStore.persist.getOptions()).toMatchObject({
      name: "t3code-fork:panes:v1",
      version: 1,
    });
    expect(PANE_STORAGE_KEY).toBe("t3code-fork:panes:v1");
    expectInitialLayout(usePaneStore.getState().layout);
  });

  it("restores tabs, their order, tree, sizes and targets in a new store", () => {
    const storage = createMemoryStorage();
    const written = createPaneStore(storage);
    const store = written.getState();
    expectInitialLayout(store.layout);

    const firstPaneId = focusedPaneId(store.layout);
    store.setPaneTarget(firstPaneId, server("A"));
    store.splitPane(firstPaneId, "right");
    store.setPaneTarget(focusedPaneId(written.getState().layout), draft("draft-1"));
    store.splitPane(focusedPaneId(written.getState().layout), "down");
    const firstRoot = getActiveTab(written.getState().layout).root;
    store.resizeSplit(firstRoot.id, 0, 0.6, { width: 2000, height: 1200 });
    store.newTab();
    store.setPaneTarget(focusedPaneId(written.getState().layout), server("A"));
    store.activateTab(written.getState().layout.tabs[0]!.id);
    store.focusPane(firstPaneId);
    const [firstTabId, secondTabId] = written.getState().layout.tabs.map((tab) => tab.id);
    store.moveTab(firstTabId!, 1);
    store.renameTab(secondTabId!, " Review ");

    const layout = written.getState().layout;
    expect(layout.tabs.map((tab) => tab.id)).toEqual([secondTabId, firstTabId]);
    expect(layout.tabs.map((tab) => tab.name)).toEqual(["Review", undefined]);
    expect(layout.activeTabId).toBe(firstTabId);
    expect(activeTargets(layout)).toEqual([server("A"), draft("draft-1"), null]);
    expect(getActiveTab(layout).root).toMatchObject({ axis: "row", sizes: [0.6, 0.4] });

    const restored = createPaneStore(storage).getState();
    expect(restored.layout).toEqual(layout);
  });

  it("does not persist the last route key and the panes that wait for a draft", () => {
    const storage = createMemoryStorage();
    const written = createPaneStore(storage);
    const paneId = focusedPaneId(written.getState().layout);
    written.getState().applyRouteState({
      layout: written.getState().layout,
      lastRouteKey: "server:env-1:A",
    });
    written.getState().setPaneFilling(paneId, true);
    expect(written.getState()).toMatchObject({
      lastRouteKey: "server:env-1:A",
      fillingPaneIds: [paneId],
    });

    const stored = JSON.parse(String(storage.getItem(PANE_STORAGE_KEY)));
    expect(Object.keys(stored.state)).toEqual(["layout"]);

    const restored = createPaneStore(storage).getState();
    expect(restored.layout).toEqual(written.getState().layout);
    expect(restored.lastRouteKey).toBeNull();
    expect(restored.fillingPaneIds).toEqual([]);
  });

  it("gives the initial layout for a corrupt stored value", () => {
    for (const value of [
      "not json",
      JSON.stringify({ state: "layout", version: 1 }),
      JSON.stringify({ state: { layout: { tabs: [{ id: "t", root: 4 }] } }, version: 1 }),
      JSON.stringify({ state: { layout: { tabs: "tabs", activeTabId: 3 } }, version: 1 }),
    ]) {
      const storage = createMemoryStorage();
      storage.setItem(PANE_STORAGE_KEY, value);
      const store = createPaneStore(storage);
      expectInitialLayout(store.getState().layout);
      expect(store.getState().layout.activeTabId).toBe(store.getState().layout.tabs[0]!.id);
    }
  });

  it("closes the tab when its last pane closes, and never closes the last tab", () => {
    const store = createPaneStore(createMemoryStorage());
    const firstTabId = store.getState().layout.tabs[0]!.id;
    const firstPaneId = focusedPaneId(store.getState().layout);

    store.getState().newTab();
    const secondPaneId = focusedPaneId(store.getState().layout);
    expect(store.getState().layout.tabs).toHaveLength(2);
    expect(store.getState().layout.activeTabId).not.toBe(firstTabId);

    store.getState().splitPane(secondPaneId, "right");
    const thirdPaneId = focusedPaneId(store.getState().layout);
    store.getState().closePane(thirdPaneId);
    expect(store.getState().layout.tabs).toHaveLength(2);
    expect(focusedPaneId(store.getState().layout)).toBe(secondPaneId);

    store.getState().closePane(secondPaneId);
    expect(store.getState().layout.tabs.map((tab) => tab.id)).toEqual([firstTabId]);
    expect(store.getState().layout.activeTabId).toBe(firstTabId);

    const last = store.getState().layout;
    store.getState().closePane(firstPaneId);
    store.getState().closeTab(firstTabId);
    expect(store.getState().layout).toBe(last);
  });

  it("activates the right neighbor of a closed tab, else the left", () => {
    const store = createPaneStore(createMemoryStorage());
    store.getState().newTab();
    store.getState().newTab();
    const [first, second, third] = store.getState().layout.tabs.map((tab) => tab.id);

    store.getState().activateTab(second!);
    store.getState().closeTab(second!);
    expect(store.getState().layout.activeTabId).toBe(third);
    store.getState().closeTab(third!);
    expect(store.getState().layout.activeTabId).toBe(first);
  });

  it("setting off: empties a pane that is set to a thread another pane of the tab shows", () => {
    const store = createPaneStore(createMemoryStorage(), () => false);
    const firstPaneId = focusedPaneId(store.getState().layout);
    store.getState().setPaneTarget(firstPaneId, server("A"));
    store.getState().splitPane(firstPaneId, "right");
    const secondPaneId = focusedPaneId(store.getState().layout);

    store.getState().setPaneTarget(secondPaneId, server("B"));
    store.getState().setPaneTarget(secondPaneId, server("A"));
    expect(activeTargets(store.getState().layout)).toEqual([server("A"), null]);

    store.getState().newTab();
    store.getState().setPaneTarget(focusedPaneId(store.getState().layout), server("A"));
    expect(activeTargets(store.getState().layout)).toEqual([server("A")]);
  });

  it("mirror: two panes of a tab show one server thread, and a draft still has one pane", () => {
    const store = createPaneStore(createMemoryStorage(), () => true);
    const firstPaneId = focusedPaneId(store.getState().layout);
    store.getState().setPaneTarget(firstPaneId, server("A"));
    store.getState().splitPane(firstPaneId, "right");
    const secondPaneId = focusedPaneId(store.getState().layout);

    store.getState().setPaneTarget(secondPaneId, server("A"));
    expect(activeTargets(store.getState().layout)).toEqual([server("A"), server("A")]);

    // Closing one mirror pane leaves the other pane and its target object as they are.
    const kept = listLeaves(getActiveTab(store.getState().layout).root)[0]!;
    store.getState().closePane(secondPaneId);
    expect(listLeaves(getActiveTab(store.getState().layout).root)).toEqual([kept]);
    expect(listLeaves(getActiveTab(store.getState().layout).root)[0]!.target).toBe(kept.target);

    store.getState().setPaneTarget(firstPaneId, draft("draft-1"));
    store.getState().splitPane(firstPaneId, "right");
    store.getState().setPaneTarget(focusedPaneId(store.getState().layout), draft("draft-1"));
    expect(activeTargets(store.getState().layout)).toEqual([draft("draft-1"), null]);
  });

  it.each([
    ["mirror", true, [server("A"), server("A"), null]],
    ["setting off", false, [server("A"), null, null]],
  ] as const)(
    "loads a stored layout with one thread in two panes: %s",
    (_name, mirror, targets) => {
      const storage = createMemoryStorage();
      const written = createPaneStore(storage, () => true);
      const firstPaneId = focusedPaneId(written.getState().layout);
      written.getState().setPaneTarget(firstPaneId, server("A"));
      written.getState().splitPane(firstPaneId, "right");
      const secondPaneId = focusedPaneId(written.getState().layout);
      written.getState().setPaneTarget(secondPaneId, server("A"));
      written.getState().splitPane(secondPaneId, "right");

      const restored = createPaneStore(storage, () => mirror).getState().layout;
      expect(activeTargets(restored)).toEqual(targets);
      if (mirror) expect(restored).toEqual(written.getState().layout);
    },
  );

  it("stops the wait for a draft when the pane leaves the layout", () => {
    const store = createPaneStore(createMemoryStorage());
    store.getState().splitPane(focusedPaneId(store.getState().layout), "down");
    const addedPaneId = focusedPaneId(store.getState().layout);

    store.getState().setPaneFilling("missing", true);
    expect(store.getState().fillingPaneIds).toEqual([]);
    store.getState().setPaneFilling(addedPaneId, true);
    expect(store.getState().fillingPaneIds).toEqual([addedPaneId]);
    store.getState().closePane(addedPaneId);
    expect(store.getState().fillingPaneIds).toEqual([]);
    expect(isMultiLayout(store.getState().layout)).toBe(false);
  });

  it("follows a sent draft in a tab that is not mounted, and leaves the active tab alone", () => {
    const store = createPaneStore(createMemoryStorage(), () => true);
    const firstTabId = store.getState().layout.activeTabId;
    const firstPaneId = focusedPaneId(store.getState().layout);
    store.getState().setPaneTarget(firstPaneId, draft("sent"));
    store.getState().splitPane(firstPaneId, "right");
    store.getState().setPaneTarget(focusedPaneId(store.getState().layout), server("T"));
    store.getState().newTab();
    store.getState().setPaneTarget(focusedPaneId(store.getState().layout), draft("sent"));
    const promotedTo = (draftId: string) =>
      draftId === "sent" ? scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("T")) : null;

    // Tab 2 is active and mounted: its thread view follows the draft itself.
    store.getState().retargetInactiveDrafts(promotedTo);
    expect(activeTargets(store.getState().layout)).toEqual([draft("sent")]);
    // Tab 1 already shows thread T in its second pane, so the sent draft is a mirror of it.
    expect(listLeaves(store.getState().layout.tabs[0]!.root).map((leaf) => leaf.target)).toEqual([
      server("T"),
      server("T"),
    ]);

    store.getState().activateTab(firstTabId);
    store.getState().retargetInactiveDrafts(promotedTo);
    expect(listLeaves(store.getState().layout.tabs[1]!.root).map((leaf) => leaf.target)).toEqual([
      server("T"),
    ]);
  });
});

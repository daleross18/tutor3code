import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import {
  addTab,
  appendLeaf,
  closeLeaf,
  closeTab,
  createTabOfLeaf,
  findLeaf,
  findTabOfLeaf,
  focusLeaf,
  insertLeaf,
  isBrowserLeaf,
  leafCount,
  leafRects,
  listLeaves,
  MAX_PANES_PER_TAB,
  MIN_PANE_WIDTH_PX,
  moveTab,
  replaceTab,
  showLeafAsChat,
  splitRefusal,
  type PaneContainerSize,
  type PaneDirection,
  type PaneLayout,
  type PaneLeaf,
  type PaneSplitRefusal,
  type PaneTab,
} from "./paneTree";

/**
 * Where a browser pane goes: a side of a pane, the right edge of a tab, or a tab of its own. A
 * new tab with `index` opens before the tab at that index of the current tab list (the list
 * length: after the last tab), else after the active tab.
 */
export type PaneDrop =
  | { readonly kind: "pane"; readonly paneId: string; readonly side: PaneDirection }
  | { readonly kind: "tab"; readonly tabId: string }
  | { readonly kind: "new-tab"; readonly index?: number };

function showsThread(leaf: PaneLeaf, threadRef: ScopedThreadRef): boolean {
  return (
    leaf.target?.kind === "server" &&
    scopedThreadKey(leaf.target.threadRef) === scopedThreadKey(threadRef)
  );
}

/** The pane of the tab that shows the browser of the thread. */
export function findBrowserLeaf(tab: PaneTab, threadRef: ScopedThreadRef): PaneLeaf | null {
  return (
    listLeaves(tab.root).find((leaf) => isBrowserLeaf(leaf) && showsThread(leaf, threadRef)) ?? null
  );
}

/** The first pane of the tab that shows the chat of the thread. */
export function findChatLeaf(tab: PaneTab, threadRef: ScopedThreadRef): PaneLeaf | null {
  return (
    listLeaves(tab.root).find((leaf) => !isBrowserLeaf(leaf) && showsThread(leaf, threadRef)) ??
    null
  );
}

/** The tab that a drop lands in. Null for a new tab. */
export function tabOfDrop(layout: PaneLayout, drop: PaneDrop): PaneTab | null {
  if (drop.kind === "new-tab") return null;
  return drop.kind === "pane"
    ? findTabOfLeaf(layout, drop.paneId)
    : (layout.tabs.find((tab) => tab.id === drop.tabId) ?? null);
}

/**
 * Why the drop cannot take one more pane, or null. A side of a pane follows the split rule. The
 * right edge of a tab needs room for one more column of the minimum width.
 */
export function dropRefusal(
  layout: PaneLayout,
  drop: PaneDrop,
  container: PaneContainerSize,
): PaneSplitRefusal | null {
  const tab = tabOfDrop(layout, drop);
  if (tab === null) return null;
  if (drop.kind === "pane") return splitRefusal(tab, drop.paneId, drop.side, container);
  if (leafCount(tab) >= MAX_PANES_PER_TAB) return { reason: "max-panes" };
  const columns = tab.root.kind === "split" && tab.root.axis === "row" ? tab.root.sizes.length : 1;
  const sharePx = container.width / (columns + 1);
  return sharePx < MIN_PANE_WIDTH_PX
    ? { reason: "too-small", halfPx: sharePx, minPx: MIN_PANE_WIDTH_PX }
    : null;
}

/**
 * Puts `leaf` at the drop. Its tab becomes the active tab and the leaf takes focus. Null when
 * the drop names a pane or a tab that is gone, or a tab at the pane limit.
 */
export function placeLeaf(layout: PaneLayout, leaf: PaneLeaf, drop: PaneDrop): PaneLayout | null {
  if (drop.kind === "new-tab") return addTab(layout, createTabOfLeaf(leaf), drop.index);
  const tab = tabOfDrop(layout, drop);
  if (tab === null) return null;
  const next =
    drop.kind === "pane" ? insertLeaf(tab, drop.paneId, drop.side, leaf) : appendLeaf(tab, leaf);
  return next === tab ? null : { ...replaceTab(layout, next), activeTabId: next.id };
}

/** The layout without the pane. A tab that loses its last pane closes. Null for the last pane. */
function withoutLeaf(layout: PaneLayout, leafId: string): PaneLayout | null {
  const tab = findTabOfLeaf(layout, leafId);
  if (tab === null) return null;
  if (leafCount(tab) > 1) return replaceTab(layout, closeLeaf(tab, leafId));
  return layout.tabs.length > 1 ? closeTab(layout, tab.id) : null;
}

/** The tab of a pane that is alone in it goes before the tab at `index`, and becomes active. */
function moveAloneTab(layout: PaneLayout, tabId: string, index: number): PaneLayout | null {
  const from = layout.tabs.findIndex((tab) => tab.id === tabId);
  const to = index > from ? index - 1 : index;
  const moved = moveTab(layout, tabId, to);
  return moved === layout ? null : { ...moved, activeTabId: tabId };
}

/** The layout that the drop is checked against: the layout after the pane left its place. */
export function layoutForMove(layout: PaneLayout, leafId: string): PaneLayout {
  return withoutLeaf(layout, leafId) ?? layout;
}

/**
 * Moves a pane to the drop and keeps its id, so its view stays mounted in its tab. A pane alone
 * in its tab dropped at a place in the tab list moves its tab there. Null when nothing would
 * change: a drop on the pane itself, on its own tab, a new tab with no place or next to its own
 * tab for a pane that is alone in its tab.
 */
export function moveLeaf(layout: PaneLayout, leafId: string, drop: PaneDrop): PaneLayout | null {
  const source = findTabOfLeaf(layout, leafId);
  const leaf = source === null ? null : findLeaf(source.root, leafId);
  if (source === null || leaf === null) return null;
  if (drop.kind === "pane" && drop.paneId === leafId) return null;
  if (drop.kind === "tab" && drop.tabId === source.id) return null;
  if (drop.kind === "new-tab" && leafCount(source) === 1) {
    return drop.index === undefined ? null : moveAloneTab(layout, source.id, drop.index);
  }
  const without = withoutLeaf(layout, leafId);
  return without === null ? null : placeLeaf(without, leaf, drop);
}

/**
 * The way back from a browser pane to the floating preview. The pane closes where its tab has a
 * chat pane of the thread, and that pane takes focus. Else the pane itself shows the chat.
 */
export function closeBrowserLeaf(layout: PaneLayout, leafId: string): PaneLayout {
  const tab = findTabOfLeaf(layout, leafId);
  const leaf = tab === null ? null : findLeaf(tab.root, leafId);
  if (tab === null || leaf === null || leaf.target?.kind !== "server") return layout;
  const chat = findChatLeaf(tab, leaf.target.threadRef);
  if (chat === null || leafCount(tab) === 1) {
    return replaceTab(layout, showLeafAsChat(tab, leafId));
  }
  return replaceTab(layout, focusLeaf(closeLeaf(tab, leafId), chat.id));
}

/** The side on which a pane of this size splits best: beside it when it is wide, else under it. */
export function preferredSplitSides(
  tab: PaneTab,
  leafId: string,
  container: PaneContainerSize,
): ReadonlyArray<PaneDirection> {
  const rect = leafRects(tab.root).find((candidate) => candidate.leafId === leafId);
  if (rect === undefined) return ["right", "down"];
  return rect.width * container.width >= rect.height * container.height
    ? ["right", "down"]
    : ["down", "right"];
}

import { layoutForMove, moveLeaf, type PaneDrop } from "./paneBrowserLayout";
import {
  findCollidingLeaf,
  findLeaf,
  findTabOfLeaf,
  focusLeaf,
  isBrowserLeaf,
  replaceTab,
  type PaneLayout,
  type PaneTab,
  type PaneTargetKey,
} from "./paneTree";

function tabOfDrop(layout: PaneLayout, drop: PaneDrop): PaneTab | null {
  if (drop.kind === "new-tab") return null;
  return drop.kind === "pane"
    ? findTabOfLeaf(layout, drop.paneId)
    : (layout.tabs.find((tab) => tab.id === drop.tabId) ?? null);
}

/**
 * The pane of another tab that owns the thread of the moved chat pane, or null. One tab never
 * has two panes that own one thread: a draft, and each thread while `mirror` is off.
 */
export function findOwnerAtDrop(
  layout: PaneLayout,
  leafId: string,
  drop: PaneDrop,
  keyOf: PaneTargetKey,
  mirror: boolean,
) {
  const source = findTabOfLeaf(layout, leafId);
  const leaf = source === null ? null : findLeaf(source.root, leafId);
  const destination = tabOfDrop(layout, drop);
  if (source === null || leaf === null || destination === null) return null;
  if (destination.id === source.id || leaf.target === null || isBrowserLeaf(leaf)) return null;
  return findCollidingLeaf(destination.root, leaf.target, keyOf, mirror);
}

/**
 * Moves a chat pane to the drop and keeps its id, its thread or its draft. Where the tab of the
 * drop has a pane that owns the same thread, the moved pane closes, and that tab shows with
 * focus on its own pane. Null when nothing would change (`moveLeaf`).
 */
export function moveChatLeaf(
  layout: PaneLayout,
  leafId: string,
  drop: PaneDrop,
  keyOf: PaneTargetKey,
  mirror: boolean,
): PaneLayout | null {
  const owner = findOwnerAtDrop(layout, leafId, drop, keyOf, mirror);
  if (owner === null) return moveLeaf(layout, leafId, drop);
  const without = layoutForMove(layout, leafId);
  const destination = findTabOfLeaf(without, owner.id);
  if (without === layout || destination === null) return null;
  return {
    ...replaceTab(without, focusLeaf(destination, owner.id)),
    activeTabId: destination.id,
  };
}

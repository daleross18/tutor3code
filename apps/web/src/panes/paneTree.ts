import type { ScopedThreadRef } from "@t3tools/contracts";

import type { DraftId } from "../composerDraftStore";
import type { ThreadRouteTarget } from "../threadRoutes";

/** Null is an empty pane. */
export type PaneTarget = ThreadRouteTarget | null;
export type PaneAxis = "row" | "column";
export type PaneSplitDirection = "right" | "down";
export type PaneDirection = "left" | "right" | "up" | "down";

export interface PaneLeaf {
  readonly kind: "leaf";
  readonly id: string;
  readonly target: PaneTarget;
  /**
   * `browser`: the pane shows the browser of its server thread in place of the chat. A leaf of
   * that kind owns no thread: a chat pane of the same tab can show the thread beside it.
   */
  readonly view?: "browser";
}

/** Sizes are fractions of the split that sum to 1. A child split never has its parent's axis. */
export interface PaneSplit {
  readonly kind: "split";
  readonly id: string;
  readonly axis: PaneAxis;
  readonly children: ReadonlyArray<PaneNode>;
  readonly sizes: ReadonlyArray<number>;
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface PaneTab {
  readonly id: string;
  readonly root: PaneNode;
  readonly focusedPaneId: string;
  /** A name that the user gave the tab. Absent: the tab shows the title of its focused pane. */
  readonly name?: string;
}

export interface PaneLayout {
  readonly tabs: ReadonlyArray<PaneTab>;
  readonly activeTabId: string;
}

/** Fractions of the tab's grid, from 0 to 1. */
export interface PaneRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PaneLeafRect extends PaneRect {
  readonly leafId: string;
}

/** A zero-thickness line between child `index` and child `index + 1` of a split. */
export interface PaneDividerRect extends PaneRect {
  readonly id: string;
  readonly splitId: string;
  readonly index: number;
  readonly axis: PaneAxis;
}

export interface PaneContainerSize {
  readonly width: number;
  readonly height: number;
}

/** `halfPx` is the size each half would have along the split, and `minPx` the size it needs. */
export type PaneSplitRefusal =
  | { readonly reason: "max-panes" }
  | { readonly reason: "too-small"; readonly halfPx: number; readonly minPx: number };
export type PaneTargetKey = (target: ThreadRouteTarget) => string;

// Each pane is a full live chat view. A pane focus move commits a render of the two chat views
// whose focus changed. The chat view function of each other pane still runs and finds no change,
// so the cost of a move grows with the panes. FORK.md ("Render cost") has the measured cost.
export const MAX_PANES_PER_TAB = 12;
export const MAX_TAB_NAME_LENGTH = 40;
// At 200 px the pane header still shows the project mark, the start of the title and its two
// controls, and the composer still shows the model, the microphone and the send button. Below
// 280 px the model button shows no effort word (panes.css).
export const MIN_PANE_WIDTH_PX = 200;
// The small header of a pane (40 px), its one-line composer (67 px), the strip under it (26 px)
// and the gap under the strip (4 px) take 137 px in Normal density, and less in the compact
// ones. All are the `data-pane-short` rules of panes.css.
export const MIN_PANE_HEIGHT_PX = 140;

const UNIT_RECT: PaneRect = { left: 0, top: 0, width: 1, height: 1 };
// Rectangle edges come from sums of fractions, so equal edges can differ by rounding.
const EDGE_EPSILON = 1e-6;

function createPaneId(prefix: "tab" | "pane" | "split"): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random()}${random()}`;
}

function sum(values: ReadonlyArray<number>): number {
  return values.reduce((total, value) => total + value, 0);
}

function createLeaf(target: PaneTarget = null): PaneLeaf {
  return { kind: "leaf", id: createPaneId("pane"), target };
}

/** A pane that shows the chat of a thread. */
export function createChatLeaf(target: ThreadRouteTarget): PaneLeaf {
  return createLeaf(target);
}

/** A pane that shows the browser of a server thread. */
export function createBrowserLeaf(threadRef: ScopedThreadRef): PaneLeaf {
  return { ...createLeaf({ kind: "server", threadRef }), view: "browser" };
}

/** True for a pane that shows the browser of its thread, not the chat. */
export function isBrowserLeaf(leaf: PaneLeaf): boolean {
  return leaf.view === "browser" && leaf.target?.kind === "server";
}

/** A tab whose one pane is `leaf`. */
export function createTabOfLeaf(leaf: PaneLeaf): PaneTab {
  return { id: createPaneId("tab"), root: leaf, focusedPaneId: leaf.id };
}

export function createTab(target: PaneTarget = null): PaneTab {
  return createTabOfLeaf(createLeaf(target));
}

export function createInitialLayout(target: PaneTarget = null): PaneLayout {
  const tab = createTab(target);
  return { tabs: [tab], activeTabId: tab.id };
}

/** Leaves in tree order: left to right in a row, top to bottom in a column. */
export function listLeaves(node: PaneNode): PaneLeaf[] {
  return node.kind === "leaf" ? [node] : node.children.flatMap(listLeaves);
}

export function leafCount(tab: PaneTab): number {
  return listLeaves(tab.root).length;
}

export function findLeaf(node: PaneNode, leafId: string): PaneLeaf | null {
  return listLeaves(node).find((leaf) => leaf.id === leafId) ?? null;
}

/**
 * True when two panes of one tab must not both show these targets. With `mirror`, two panes may
 * show one server thread. A draft is one composer text, so one pane owns it in each case.
 */
function targetsCollide(
  shown: ThreadRouteTarget,
  target: ThreadRouteTarget,
  keyOf: PaneTargetKey,
  mirror: boolean,
): boolean {
  if (keyOf(shown) !== keyOf(target)) return false;
  return !mirror || shown.kind === "draft" || target.kind === "draft";
}

/** The first leaf, in tree order, that must not show `target` beside its own target. */
export function findCollidingLeaf(
  node: PaneNode,
  target: ThreadRouteTarget,
  keyOf: PaneTargetKey,
  mirror: boolean,
  exceptLeafId: string | null = null,
): PaneLeaf | null {
  return (
    listLeaves(node).find(
      (leaf) =>
        leaf.id !== exceptLeafId &&
        leaf.target !== null &&
        !isBrowserLeaf(leaf) &&
        targetsCollide(leaf.target, target, keyOf, mirror),
    ) ?? null
  );
}

export function getActiveTab(layout: PaneLayout): PaneTab {
  return layout.tabs.find((tab) => tab.id === layout.activeTabId) ?? layout.tabs[0]!;
}

export function findTabOfLeaf(layout: PaneLayout, leafId: string): PaneTab | null {
  return layout.tabs.find((tab) => findLeaf(tab.root, leafId) !== null) ?? null;
}

/**
 * False only for the stock layout: one tab with one chat pane. A lone browser pane counts as
 * multi, so it has the tab bar, which holds the ways out of it.
 */
export function isMultiLayout(layout: PaneLayout): boolean {
  const { root } = getActiveTab(layout);
  return layout.tabs.length > 1 || root.kind === "split" || isBrowserLeaf(root);
}

function mapNode(node: PaneNode, update: (node: PaneNode) => PaneNode): PaneNode {
  const updated = update(node);
  if (updated !== node || node.kind === "leaf") return updated;
  const children = node.children.map((child) => mapNode(child, update));
  return children.every((child, index) => child === node.children[index])
    ? node
    : { ...node, children };
}

/** Collapses a split with one child and merges a child split that has the same axis. */
function normalizeSplit(split: PaneSplit): PaneNode | null {
  const children: PaneNode[] = [];
  const sizes: number[] = [];
  split.children.forEach((child, index) => {
    const size = split.sizes[index] ?? 0;
    if (child.kind === "split" && child.axis === split.axis) {
      children.push(...child.children);
      sizes.push(...child.sizes.map((childSize) => childSize * size));
    } else {
      children.push(child);
      sizes.push(size);
    }
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  const total = sum(sizes);
  return { ...split, children, sizes: sizes.map((size) => size / total) };
}

export function focusLeaf(tab: PaneTab, leafId: string): PaneTab {
  return tab.focusedPaneId === leafId || findLeaf(tab.root, leafId) === null
    ? tab
    : { ...tab, focusedPaneId: leafId };
}

/** A pane with a new target shows the chat of that target: a browser view does not stay. */
export function setLeafTarget(tab: PaneTab, leafId: string, target: PaneTarget): PaneTab {
  const root = mapNode(tab.root, (node) =>
    node.kind === "leaf" && node.id === leafId && node.target !== target
      ? { kind: "leaf", id: node.id, target }
      : node,
  );
  return root === tab.root ? tab : { ...tab, root };
}

/** The pane shows the chat of its thread again. */
export function showLeafAsChat(tab: PaneTab, leafId: string): PaneTab {
  const root = mapNode(tab.root, (node) =>
    node.kind === "leaf" && node.id === leafId && node.view !== undefined
      ? { kind: "leaf", id: node.id, target: node.target }
      : node,
  );
  return root === tab.root ? tab : { ...tab, root };
}

/**
 * Splits the pane `leafId` and puts `added` on that side of it. `added` takes focus and half of
 * the pane's size. The tab is returned unchanged at the pane limit.
 */
export function insertLeaf(
  tab: PaneTab,
  leafId: string,
  side: PaneDirection,
  added: PaneLeaf,
): PaneTab {
  if (leafCount(tab) >= MAX_PANES_PER_TAB || findLeaf(tab.root, leafId) === null) return tab;
  const axis: PaneAxis = side === "left" || side === "right" ? "row" : "column";
  const after = side === "right" || side === "down";
  const root = mapNode(tab.root, (node) => {
    if (node.kind === "leaf") {
      return node.id === leafId
        ? {
            kind: "split",
            id: createPaneId("split"),
            axis,
            children: after ? [node, added] : [added, node],
            sizes: [0.5, 0.5],
          }
        : node;
    }
    const index = node.children.findIndex((child) => child.kind === "leaf" && child.id === leafId);
    if (index === -1 || node.axis !== axis) return node;
    const half = node.sizes[index]! / 2;
    const at = after ? index + 1 : index;
    return {
      ...node,
      children: [...node.children.slice(0, at), added, ...node.children.slice(at)],
      sizes: [...node.sizes.slice(0, index), half, half, ...node.sizes.slice(index + 1)],
    };
  });
  return { ...tab, root, focusedPaneId: added.id };
}

/**
 * Puts `added` at the right edge of the tab, beside everything the tab shows. It takes focus and
 * an equal share of the width. The tab is returned unchanged at the pane limit.
 */
export function appendLeaf(tab: PaneTab, added: PaneLeaf): PaneTab {
  if (leafCount(tab) >= MAX_PANES_PER_TAB) return tab;
  const { root } = tab;
  const columns = root.kind === "split" && root.axis === "row" ? root.children.length : 1;
  const share = 1 / (columns + 1);
  const split = normalizeSplit({
    kind: "split",
    id: createPaneId("split"),
    axis: "row",
    children: [root, added],
    sizes: [1 - share, share],
  });
  return split === null ? tab : { ...tab, root: split, focusedPaneId: added.id };
}

/** The new leaf is empty and takes focus. The tab is returned unchanged at the pane limit. */
export function splitLeaf(tab: PaneTab, leafId: string, direction: PaneSplitDirection): PaneTab {
  return insertLeaf(tab, leafId, direction, createLeaf());
}

function removeLeaf(node: PaneNode, leafId: string): PaneNode | null {
  if (node.kind === "leaf") return node.id === leafId ? null : node;
  const children: PaneNode[] = [];
  const sizes: number[] = [];
  let changed = false;
  node.children.forEach((child, index) => {
    const next = removeLeaf(child, leafId);
    changed ||= next !== child;
    if (next === null) return;
    children.push(next);
    sizes.push(node.sizes[index]!);
  });
  return changed ? normalizeSplit({ ...node, children, sizes }) : node;
}

/** The last leaf of a tab is never removed. Focus moves to the previous leaf, else the next. */
export function closeLeaf(tab: PaneTab, leafId: string): PaneTab {
  const leaves = listLeaves(tab.root);
  const index = leaves.findIndex((leaf) => leaf.id === leafId);
  const root = index === -1 || leaves.length === 1 ? null : removeLeaf(tab.root, leafId);
  if (root === null) return tab;
  const nextFocus = leaves[index - 1] ?? leaves[index + 1];
  return {
    ...tab,
    root,
    focusedPaneId:
      tab.focusedPaneId === leafId && nextFocus !== undefined ? nextFocus.id : tab.focusedPaneId,
  };
}

function childRects(split: PaneSplit, rect: PaneRect): PaneRect[] {
  let offset = 0;
  return split.sizes.map((size) => {
    const child =
      split.axis === "row"
        ? { ...rect, left: rect.left + offset * rect.width, width: size * rect.width }
        : { ...rect, top: rect.top + offset * rect.height, height: size * rect.height };
    offset += size;
    return child;
  });
}

function visitSplits(
  node: PaneNode,
  rect: PaneRect,
  visit: (split: PaneSplit, rect: PaneRect, children: PaneRect[]) => void,
): void {
  if (node.kind === "leaf") return;
  const rects = childRects(node, rect);
  visit(node, rect, rects);
  node.children.forEach((child, index) => visitSplits(child, rects[index]!, visit));
}

export function leafRects(root: PaneNode): PaneLeafRect[] {
  if (root.kind === "leaf") return [{ leafId: root.id, ...UNIT_RECT }];
  const rectById = new Map<string, PaneRect>();
  visitSplits(root, UNIT_RECT, (split, _rect, children) => {
    split.children.forEach((child, index) => {
      if (child.kind === "leaf") rectById.set(child.id, children[index]!);
    });
  });
  return listLeaves(root).map((leaf) => ({ leafId: leaf.id, ...rectById.get(leaf.id)! }));
}

export function dividerRects(root: PaneNode): PaneDividerRect[] {
  const dividers: PaneDividerRect[] = [];
  visitSplits(root, UNIT_RECT, (split, rect, children) => {
    children.slice(1).forEach((next, index) => {
      dividers.push({
        id: `${split.id}:${index}`,
        splitId: split.id,
        index,
        axis: split.axis,
        ...(split.axis === "row"
          ? { left: next.left, top: rect.top, width: 0, height: rect.height }
          : { left: rect.left, top: next.top, width: rect.width, height: 0 }),
      });
    });
  });
  return dividers;
}

/**
 * The leaf that touches `leafId` on that edge. Among several, the one that had focus last wins,
 * so a move there and back returns to the same pane. Else the first leaf in tree order that
 * holds the center of the edge, else the widest overlap.
 */
export function neighborInDirection(
  root: PaneNode,
  leafId: string,
  direction: PaneDirection,
  lastFocusedAt: (leafId: string) => number = () => 0,
): string | null {
  const rects = leafRects(root);
  const from = rects.find((rect) => rect.leafId === leafId);
  if (from === undefined) return null;
  const horizontal = direction === "left" || direction === "right";
  const start = (rect: PaneRect) => (horizontal ? rect.left : rect.top);
  const end = (rect: PaneRect) => start(rect) + (horizontal ? rect.width : rect.height);
  const crossStart = (rect: PaneRect) => (horizontal ? rect.top : rect.left);
  const crossEnd = (rect: PaneRect) => crossStart(rect) + (horizontal ? rect.height : rect.width);
  const overlap = (rect: PaneRect) =>
    Math.min(crossEnd(rect), crossEnd(from)) - Math.max(crossStart(rect), crossStart(from));
  const forward = direction === "right" || direction === "down";

  const touching = rects.filter(
    (rect) =>
      rect.leafId !== leafId &&
      Math.abs(forward ? start(rect) - end(from) : end(rect) - start(from)) < EDGE_EPSILON &&
      overlap(rect) > EDGE_EPSILON,
  );
  const lastFocused = touching.reduce<PaneLeafRect | null>(
    (best, rect) =>
      lastFocusedAt(rect.leafId) > (best === null ? 0 : lastFocusedAt(best.leafId)) ? rect : best,
    null,
  );
  if (lastFocused !== null) return lastFocused.leafId;
  const center = (crossStart(from) + crossEnd(from)) / 2;
  const holdsCenter = touching.find(
    (rect) => crossStart(rect) <= center + EDGE_EPSILON && center <= crossEnd(rect) + EDGE_EPSILON,
  );
  if (holdsCenter !== undefined) return holdsCenter.leafId;
  return (
    touching.reduce<PaneLeafRect | null>(
      (best, rect) => (best === null || overlap(rect) > overlap(best) ? rect : best),
      null,
    )?.leafId ?? null
  );
}

/** The smallest extent, in pixels along `axis`, that keeps every leaf of the node at its minimum. */
function minExtentPx(node: PaneNode, axis: PaneAxis): number {
  if (node.kind === "leaf") return axis === "row" ? MIN_PANE_WIDTH_PX : MIN_PANE_HEIGHT_PX;
  return Math.max(
    ...node.children.map((child, index) =>
      node.axis === axis ? minExtentPx(child, axis) / node.sizes[index]! : minExtentPx(child, axis),
    ),
  );
}

function updateSplit(
  tab: PaneTab,
  splitId: string,
  update: (split: PaneSplit, rect: PaneRect) => ReadonlyArray<number> | null,
): PaneTab {
  const found: Array<{ split: PaneSplit; rect: PaneRect }> = [];
  visitSplits(tab.root, UNIT_RECT, (split, rect) => {
    if (split.id === splitId) found.push({ split, rect });
  });
  const target = found[0];
  const sizes = target === undefined ? null : update(target.split, target.rect);
  if (sizes === null) return tab;
  const root = mapNode(tab.root, (node) =>
    node.kind === "split" && node.id === splitId ? { ...node, sizes } : node,
  );
  return { ...tab, root };
}

function splitExtentPx(split: PaneSplit, rect: PaneRect, container: PaneContainerSize): number {
  return split.axis === "row" ? rect.width * container.width : rect.height * container.height;
}

/**
 * Moves the boundary after child `index` to `position`, a fraction of the tab's grid along the
 * split axis. The boundary stops where a pane on either side would go below its minimum size. A
 * pane that is already below its minimum, after the window became smaller, can only grow.
 */
export function resizeSplit(
  tab: PaneTab,
  splitId: string,
  index: number,
  position: number,
  container: PaneContainerSize,
): PaneTab {
  return updateSplit(tab, splitId, (split, rect) => {
    const before = split.children[index];
    const after = split.children[index + 1];
    if (before === undefined || after === undefined) return null;
    const row = split.axis === "row";
    const extent = row ? rect.width : rect.height;
    const extentPx = splitExtentPx(split, rect, container);
    if (extentPx <= 0) return null;
    const low = sum(split.sizes.slice(0, index));
    const high = low + split.sizes[index]! + split.sizes[index + 1]!;
    const min = low + Math.min(split.sizes[index]!, minExtentPx(before, split.axis) / extentPx);
    const max = high - Math.min(split.sizes[index + 1]!, minExtentPx(after, split.axis) / extentPx);
    const requested = (position - (row ? rect.left : rect.top)) / extent;
    const boundary = Math.min(max, Math.max(min, requested));
    if (Math.abs(boundary - low - split.sizes[index]!) < EDGE_EPSILON) return null;
    return [
      ...split.sizes.slice(0, index),
      boundary - low,
      high - boundary,
      ...split.sizes.slice(index + 2),
    ];
  });
}

/** Equal shares, except that a child keeps the share its panes need for their minimum size. */
function equalSharesAbove(minimums: ReadonlyArray<number>): ReadonlyArray<number> | null {
  if (sum(minimums) > 1 + EDGE_EPSILON) return null;
  const shares = minimums.map(() => 0);
  let free = minimums.map((_minimum, index) => index);
  let remaining = 1;
  while (free.length > 0) {
    const share = remaining / free.length;
    const above = free.filter((index) => minimums[index]! > share);
    if (above.length === 0) {
      for (const index of free) shares[index] = share;
      break;
    }
    for (const index of above) {
      shares[index] = minimums[index]!;
      remaining -= minimums[index]!;
    }
    free = free.filter((index) => !above.includes(index));
  }
  return shares;
}

/** Nothing changes when the children cannot all keep their minimum size. */
export function equalizeSplit(
  tab: PaneTab,
  splitId: string,
  container: PaneContainerSize,
): PaneTab {
  return updateSplit(tab, splitId, (split, rect) => {
    const extentPx = splitExtentPx(split, rect, container);
    if (extentPx <= 0) return null;
    return equalSharesAbove(
      split.children.map((child) => minExtentPx(child, split.axis) / extentPx),
    );
  });
}

/** Why a split of this leaf on that side must not run, or null when the split is allowed. */
export function splitRefusal(
  tab: PaneTab,
  leafId: string,
  direction: PaneDirection,
  container: PaneContainerSize,
): PaneSplitRefusal | null {
  if (leafCount(tab) >= MAX_PANES_PER_TAB) return { reason: "max-panes" };
  const rect = leafRects(tab.root).find((candidate) => candidate.leafId === leafId);
  if (rect === undefined) return null;
  const row = direction === "left" || direction === "right";
  const halfPx = row ? (rect.width * container.width) / 2 : (rect.height * container.height) / 2;
  const minPx = row ? MIN_PANE_WIDTH_PX : MIN_PANE_HEIGHT_PX;
  return halfPx < minPx ? { reason: "too-small", halfPx, minPx } : null;
}

export function replaceTab(layout: PaneLayout, next: PaneTab): PaneLayout {
  const tabs = layout.tabs.map((tab) => (tab.id === next.id ? next : tab));
  return tabs.every((tab, index) => tab === layout.tabs[index]) ? layout : { ...layout, tabs };
}

/**
 * The tab opens at `index` of the tab list (clamped), else after the active tab, and becomes
 * active.
 */
export function addTab(layout: PaneLayout, tab: PaneTab, index?: number): PaneLayout {
  const at =
    index === undefined
      ? layout.tabs.findIndex((candidate) => candidate.id === layout.activeTabId) + 1
      : Math.min(Math.max(Math.trunc(index), 0), layout.tabs.length);
  return {
    tabs: [...layout.tabs.slice(0, at), tab, ...layout.tabs.slice(at)],
    activeTabId: tab.id,
  };
}

/** The last tab is never removed. The right neighbor becomes active, else the left. */
export function closeTab(layout: PaneLayout, tabId: string): PaneLayout {
  const index = layout.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1 || layout.tabs.length === 1) return layout;
  const tabs = layout.tabs.filter((tab) => tab.id !== tabId);
  return {
    tabs,
    activeTabId:
      layout.activeTabId === tabId ? (tabs[index] ?? tabs[index - 1]!).id : layout.activeTabId,
  };
}

/**
 * The tab goes to `toIndex` of the new order, clamped to the list. The active tab stays active.
 * An unknown tab or a move to its own place returns the same layout.
 */
export function moveTab(layout: PaneLayout, tabId: string, toIndex: number): PaneLayout {
  const from = layout.tabs.findIndex((tab) => tab.id === tabId);
  if (from === -1) return layout;
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), layout.tabs.length - 1);
  if (to === from) return layout;
  const tabs = layout.tabs.filter((tab) => tab.id !== tabId);
  tabs.splice(to, 0, layout.tabs[from]!);
  return { ...layout, tabs };
}

/** Trimmed and cut to `MAX_TAB_NAME_LENGTH`. An empty result is no name. */
export function normalizeTabName(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim().slice(0, MAX_TAB_NAME_LENGTH).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** An empty name gives the tab its automatic label again. An unknown tab changes nothing. */
export function renameTab(layout: PaneLayout, tabId: string, name: string): PaneLayout {
  const tab = layout.tabs.find((candidate) => candidate.id === tabId);
  if (tab === undefined) return layout;
  const next = normalizeTabName(name);
  if (next === tab.name) return layout;
  const { name: _previous, ...rest } = tab;
  return replaceTab(layout, next === undefined ? rest : { ...rest, name: next });
}

export function activateTab(layout: PaneLayout, tabId: string): PaneLayout {
  return layout.activeTabId === tabId || !layout.tabs.some((tab) => tab.id === tabId)
    ? layout
    : { ...layout, activeTabId: tabId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** A node id that is already in use gets a new id, so ids stay unique in the layout. */
function claimId(id: string, prefix: "tab" | "pane" | "split", usedIds: Set<string>): string {
  const claimed = usedIds.has(id) ? createPaneId(prefix) : id;
  usedIds.add(claimed);
  return claimed;
}

function sanitizeTarget(value: unknown): PaneTarget {
  if (!isRecord(value)) return null;
  if (value.kind === "draft" && isNonEmptyString(value.draftId)) {
    return { kind: "draft", draftId: value.draftId as DraftId };
  }
  const ref = value.threadRef;
  if (
    value.kind === "server" &&
    isRecord(ref) &&
    isNonEmptyString(ref.environmentId) &&
    isNonEmptyString(ref.threadId)
  ) {
    return {
      kind: "server",
      threadRef: { environmentId: ref.environmentId, threadId: ref.threadId } as ScopedThreadRef,
    };
  }
  return null;
}

function sanitizeNode(value: unknown, usedIds: Set<string>): PaneNode | null {
  if (!isRecord(value) || !isNonEmptyString(value.id)) return null;
  if (value.kind === "leaf") {
    const target = sanitizeTarget(value.target);
    return {
      kind: "leaf",
      id: claimId(value.id, "pane", usedIds),
      target,
      // The browser of a thread: a leaf with no server thread shows a chat or is empty.
      ...(value.view === "browser" && target?.kind === "server" ? { view: "browser" } : {}),
    };
  }
  if (
    value.kind !== "split" ||
    (value.axis !== "row" && value.axis !== "column") ||
    !Array.isArray(value.children)
  ) {
    return null;
  }
  const storedSizes: ReadonlyArray<unknown> = Array.isArray(value.sizes) ? value.sizes : [];
  const sizesValid =
    storedSizes.length === value.children.length &&
    storedSizes.every((size) => typeof size === "number" && Number.isFinite(size) && size > 0);
  const id = claimId(value.id, "split", usedIds);
  const children: PaneNode[] = [];
  const sizes: number[] = [];
  value.children.forEach((child: unknown, index) => {
    const node = sanitizeNode(child, usedIds);
    if (node === null) return;
    children.push(node);
    sizes.push(sizesValid ? (storedSizes[index] as number) : 1);
  });
  return normalizeSplit({ kind: "split", id, axis: value.axis, children, sizes });
}

function sanitizeTab(
  value: unknown,
  usedIds: Set<string>,
  keyOf: PaneTargetKey,
  mirror: boolean,
): PaneTab | null {
  if (!isRecord(value) || !isNonEmptyString(value.id)) return null;
  const id = claimId(value.id, "tab", usedIds);
  const root = sanitizeNode(value.root, usedIds);
  if (root === null) return null;
  // A layout of an older build has no name.
  const name = normalizeTabName(value.name);
  let tab: PaneTab = {
    id,
    root,
    focusedPaneId: listLeaves(root)[0]!.id,
    ...(name === undefined ? {} : { name }),
  };
  for (const leaf of listLeaves(root).slice(MAX_PANES_PER_TAB)) {
    tab = closeLeaf(tab, leaf.id);
  }
  const shown: ThreadRouteTarget[] = [];
  for (const leaf of listLeaves(tab.root)) {
    const target = leaf.target;
    if (target === null || isBrowserLeaf(leaf)) continue;
    if (shown.some((other) => targetsCollide(other, target, keyOf, mirror))) {
      tab = setLeafTarget(tab, leaf.id, null);
    }
    shown.push(target);
  }
  return isNonEmptyString(value.focusedPaneId) ? focusLeaf(tab, value.focusedPaneId) : tab;
}

/**
 * A draft is one composer text, so one pane owns it. A leaf of a later tab that shows the same
 * draft becomes empty, and takes its own draft when its tab mounts.
 */
function withOneLeafPerDraft(tabs: ReadonlyArray<PaneTab>): PaneTab[] {
  const shownDraftIds = new Set<string>();
  return tabs.map((tab) => {
    let next = tab;
    for (const leaf of listLeaves(tab.root)) {
      if (leaf.target?.kind !== "draft") continue;
      if (shownDraftIds.has(leaf.target.draftId)) next = setLeafTarget(next, leaf.id, null);
      shownDraftIds.add(leaf.target.draftId);
    }
    return next;
  });
}

/**
 * Rebuilds a stored layout. Malformed tabs and nodes are dropped. The second leaf of a tab that
 * shows the same draft becomes empty, and without `mirror` also the second leaf that shows the
 * same server thread. A value with no valid tab gives the initial layout.
 */
export function sanitizeLayout(value: unknown, keyOf: PaneTargetKey, mirror: boolean): PaneLayout {
  if (!isRecord(value) || !Array.isArray(value.tabs)) return createInitialLayout();
  const usedIds = new Set<string>();
  const tabs = value.tabs.flatMap((tab: unknown) => {
    const sanitized = sanitizeTab(tab, usedIds, keyOf, mirror);
    return sanitized === null ? [] : [sanitized];
  });
  const first = tabs[0];
  if (first === undefined) return createInitialLayout();
  return {
    tabs: withOneLeafPerDraft(tabs),
    activeTabId: tabs.some((tab) => tab.id === value.activeTabId)
      ? (value.activeTabId as string)
      : first.id,
  };
}

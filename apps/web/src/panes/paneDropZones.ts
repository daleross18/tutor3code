import type { PaneDrop } from "./paneBrowserLayout";
import type { PaneDirection } from "./paneTree";

/** A box in window pixels. */
export interface PaneDropRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PaneDropPoint {
  readonly x: number;
  readonly y: number;
}

/** The boxes that a dragged browser can drop on, measured when the drag starts. */
export interface PaneDropTargets {
  readonly panes: ReadonlyArray<{ readonly paneId: string; readonly rect: PaneDropRect }>;
  readonly tabs: ReadonlyArray<{ readonly tabId: string; readonly rect: PaneDropRect }>;
  readonly newTab: PaneDropRect | null;
  /** The empty end of the tab strip, right of the last tab: a drop there opens a new tab. */
  readonly tabStripEnd: PaneDropRect | null;
}

/** A drop and the box that shows it. `marker`: the box is a line between two tabs. */
export interface PaneDropZone {
  readonly drop: PaneDrop;
  readonly rect: PaneDropRect;
  readonly marker?: true;
}

export function rectContains(rect: PaneDropRect, point: PaneDropPoint): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

/**
 * The side of the pane that the point is nearest to, as a fraction of the pane's size, so a wide
 * pane and a tall pane both have four parts that meet in the middle.
 */
export function dropSideOf(rect: PaneDropRect, point: PaneDropPoint): PaneDirection {
  const fromLeft = (point.x - rect.left) / rect.width;
  const fromTop = (point.y - rect.top) / rect.height;
  const distances: ReadonlyArray<readonly [PaneDirection, number]> = [
    ["left", fromLeft],
    ["right", 1 - fromLeft],
    ["up", fromTop],
    ["down", 1 - fromTop],
  ];
  return distances.reduce((nearest, candidate) =>
    candidate[1] < nearest[1] ? candidate : nearest,
  )[0];
}

/** The half of the pane that a new pane on that side takes. */
export function dropHalfOf(rect: PaneDropRect, side: PaneDirection): PaneDropRect {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  switch (side) {
    case "left":
      return { ...rect, width: halfWidth };
    case "right":
      return { ...rect, left: rect.left + halfWidth, width: halfWidth };
    case "up":
      return { ...rect, height: halfHeight };
    case "down":
      return { ...rect, top: rect.top + halfHeight, height: halfHeight };
  }
}

function rectsOverlap(a: PaneDropRect, b: PaneDropRect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/**
 * The new-tab zone of a drag that starts in a right panel. The zone sits at the top right of
 * the pane area, which can be part of the panel, where the drag is the stock reorder. It then
 * moves left of the panel, with the same inset. Null when no room is left there.
 */
export function newTabZoneBeside(
  newTab: PaneDropRect | null,
  panel: PaneDropRect,
  area: PaneDropRect,
): PaneDropRect | null {
  if (newTab === null || !rectsOverlap(newTab, panel)) return newTab;
  const inset = area.left + area.width - (newTab.left + newTab.width);
  const left = panel.left - inset - newTab.width;
  return left < area.left + inset ? null : { ...newTab, left };
}

// A narrower end is hard to aim at, and sits against the last tab, whose drop has its meaning.
const MIN_TAB_STRIP_END_PX = 24;

/**
 * The empty end of the tab strip: from the right edge of the last tab to the end of the list,
 * as tall as the bar. Null when the tabs fill the list, as when it scrolls.
 */
export function tabStripEndOf(
  list: PaneDropRect,
  bar: PaneDropRect,
  lastTabRight: number | null,
): PaneDropRect | null {
  const left = Math.max(list.left, lastTabRight ?? list.left);
  const width = list.left + list.width - left;
  if (width < MIN_TAB_STRIP_END_PX) return null;
  return { left, top: bar.top, width, height: bar.height };
}

// The part of a tab next to a gap that means "a new tab here". The middle means "into this tab".
const TAB_SLOT_BAND_PX = 24;
// Outside the first and the last tab, where no gap is.
const TAB_SLOT_EDGE_PX = 8;
const TAB_SLOT_MARKER_PX = 4;

/**
 * The place between two tabs (or before the first, or after the last) under the point: the gap
 * and the outer quarter of each tab next to it, at most 24 px of a tab. The zone is a new tab at
 * that index, shown as a vertical line in the gap. Null in the middle of a tab and off the tabs.
 */
export function tabSlotOf(
  tabs: PaneDropTargets["tabs"],
  point: PaneDropPoint,
): PaneDropZone | null {
  const band = (rect: PaneDropRect) => Math.min(rect.width / 4, TAB_SLOT_BAND_PX);
  const rightOf = (rect: PaneDropRect) => rect.left + rect.width;
  for (let index = 0; index <= tabs.length; index += 1) {
    const before = tabs[index - 1]?.rect;
    const after = tabs[index]?.rect;
    const row = after ?? before;
    if (row === undefined) return null;
    const left =
      before === undefined ? row.left - TAB_SLOT_EDGE_PX : rightOf(before) - band(before);
    const right = after === undefined ? rightOf(row) + TAB_SLOT_EDGE_PX : after.left + band(after);
    const hit = { left, top: row.top, width: right - left, height: row.height };
    if (!rectContains(hit, point)) continue;
    const x =
      before === undefined
        ? row.left
        : after === undefined
          ? rightOf(before)
          : (rightOf(before) + after.left) / 2;
    return {
      drop: { kind: "new-tab", index },
      rect: {
        left: x - TAB_SLOT_MARKER_PX / 2,
        top: row.top,
        width: TAB_SLOT_MARKER_PX,
        height: row.height,
      },
      marker: true,
    };
  }
  return null;
}

/**
 * The zone under the pointer: the new-tab zone, else a place between two tabs (a new tab
 * there), else a tab of the tab strip, else the empty end of the tab strip (a new tab after the
 * last tab), else a side of a pane. `exceptPaneId` is the pane that the drag started in, which
 * is no zone.
 */
export function resolveDropZone(
  targets: PaneDropTargets,
  point: PaneDropPoint,
  exceptPaneId: string | null,
): PaneDropZone | null {
  if (targets.newTab !== null && rectContains(targets.newTab, point)) {
    return { drop: { kind: "new-tab" }, rect: targets.newTab };
  }
  const slot = tabSlotOf(targets.tabs, point);
  if (slot !== null) return slot;
  const tab = targets.tabs.find((candidate) => rectContains(candidate.rect, point));
  if (tab !== undefined) return { drop: { kind: "tab", tabId: tab.tabId }, rect: tab.rect };
  if (targets.tabStripEnd !== null && rectContains(targets.tabStripEnd, point)) {
    return { drop: { kind: "new-tab", index: targets.tabs.length }, rect: targets.tabStripEnd };
  }
  const pane = targets.panes.find(
    (candidate) => candidate.paneId !== exceptPaneId && rectContains(candidate.rect, point),
  );
  if (pane === undefined) return null;
  const side = dropSideOf(pane.rect, point);
  return { drop: { kind: "pane", paneId: pane.paneId, side }, rect: dropHalfOf(pane.rect, side) };
}

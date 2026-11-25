import { create } from "zustand";

import type { PaneDrop } from "./paneBrowserLayout";
import {
  rectContains,
  newTabZoneBeside,
  resolveDropZone,
  tabStripEndOf,
  type PaneDropPoint,
  type PaneDropRect,
  type PaneDropTargets,
  type PaneDropZone,
} from "./paneDropZones";

/**
 * What the user drags. `preview` is the stock floating preview: inside its own pane the drag is
 * the stock move, and the zones show when the pointer leaves that pane. `pane` is the header of
 * a browser pane or of a chat pane. `panel-tab` is a tab of a right panel: inside the panel the
 * drag is the stock reorder, and its own pane is a zone too.
 */
type PaneDragSource =
  | { readonly kind: "preview"; readonly ownPaneId: string | null }
  | { readonly kind: "pane"; readonly paneId: string }
  | { readonly kind: "panel-tab"; readonly panelRect: PaneDropRect };

interface PaneDragState {
  /** True while the drop zones show. */
  readonly active: boolean;
  readonly zone: PaneDropZone | null;
  readonly newTab: PaneDropRect | null;
}

const IDLE: PaneDragState = { active: false, zone: null, newTab: null };

/** What the drop overlay renders. */
export const usePaneDragStore = create<PaneDragState>(() => IDLE);

// A header press that moves less than this is a click, as in the stock floating preview.
export const DRAG_SLOP_PX = 6;
const NEW_TAB_ZONE = { width: 132, height: 36, inset: 8 } as const;

interface PaneDragSession {
  readonly source: PaneDragSource;
  readonly targets: PaneDropTargets;
  /** The box that the pointer must leave before the zones show. Null: a small move is enough. */
  readonly ownRect: PaneDropRect | null;
  readonly start: PaneDropPoint;
}

let session: PaneDragSession | null = null;

export function rectOf(element: Element): PaneDropRect {
  const box = element.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

/** The pane area: the grid, or the inset in the stock layout, where the grid has no box. */
function measurePaneArea(): PaneDropRect | null {
  const candidates = ["[data-splitpane-grid]", "[data-splitpane-root]"];
  for (const selector of candidates) {
    const element = document.querySelector(selector);
    const rect = element === null ? null : rectOf(element);
    if (rect !== null && rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

function measureTargets(area: PaneDropRect | null): PaneDropTargets {
  const cells = [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
  // The one pane of the stock layout has no box of its own: it fills the pane area.
  const single = cells.length === 1 && area !== null;
  const panes = cells
    .map((cell) => ({
      paneId: cell.dataset.splitpaneCell ?? "",
      rect: single ? area : rectOf(cell),
    }))
    .filter((pane) => pane.paneId !== "" && pane.rect.width > 0 && pane.rect.height > 0);
  const tabs = [...document.querySelectorAll<HTMLElement>("[data-pane-tab]")]
    .map((tab) => ({ tabId: tab.dataset.paneTab ?? "", rect: rectOf(tab) }))
    .filter((tab) => tab.tabId !== "" && tab.rect.width > 0);
  const list = document.querySelector("[data-pane-tablist]");
  const bar = list?.closest("[data-pane-tabbar]") ?? null;
  const tabRights = tabs.map((tab) => tab.rect.left + tab.rect.width);
  const tabStripEnd =
    list === null || bar === null
      ? null
      : tabStripEndOf(
          rectOf(list),
          rectOf(bar),
          tabRights.length === 0 ? null : Math.max(...tabRights),
        );
  const newTab =
    area === null
      ? null
      : {
          left: area.left + area.width - NEW_TAB_ZONE.width - NEW_TAB_ZONE.inset,
          top: area.top + NEW_TAB_ZONE.inset,
          width: NEW_TAB_ZONE.width,
          height: NEW_TAB_ZONE.height,
        };
  return { panes, tabs, newTab, tabStripEnd };
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || session === null) return;
  // The key belongs to the drag while the zones show. A dialog or the composer must not see it.
  if (usePaneDragStore.getState().active) {
    event.preventDefault();
    event.stopPropagation();
  }
  cancelPaneDrag();
}

/** Measures the drop targets. The zones show after `movePaneDrag` sees the pointer leave. */
export function beginPaneDrag(source: PaneDragSource, start: PaneDropPoint): void {
  cancelPaneDrag();
  const area = measurePaneArea();
  const measured = measureTargets(area);
  const targets =
    source.kind === "panel-tab" && area !== null
      ? { ...measured, newTab: newTabZoneBeside(measured.newTab, source.panelRect, area) }
      : measured;
  const ownRect =
    source.kind === "preview"
      ? (targets.panes.find((pane) => pane.paneId === source.ownPaneId)?.rect ?? area)
      : source.kind === "panel-tab"
        ? source.panelRect
        : null;
  session = { source, targets, ownRect, start };
  window.addEventListener("keydown", onKeyDown, true);
}

export function movePaneDrag(point: PaneDropPoint): void {
  if (session === null) return;
  const { source, targets, ownRect, start } = session;
  const current = usePaneDragStore.getState();
  // A header drag stays armed once it moved. The floating preview arms outside its own pane.
  const armed =
    ownRect === null
      ? current.active || Math.hypot(point.x - start.x, point.y - start.y) >= DRAG_SLOP_PX
      : !rectContains(ownRect, point);
  if (!armed) {
    if (current.active) usePaneDragStore.setState(IDLE, true);
    return;
  }
  const exceptPaneId =
    source.kind === "preview" ? source.ownPaneId : source.kind === "pane" ? source.paneId : null;
  const zone = resolveDropZone(targets, point, exceptPaneId);
  const sameZone =
    current.zone?.rect === zone?.rect ||
    (current.zone !== null &&
      zone !== null &&
      JSON.stringify(current.zone) === JSON.stringify(zone));
  if (current.active && sameZone) return;
  usePaneDragStore.setState({ active: true, zone, newTab: targets.newTab }, true);
}

/** Ends the drag. The drop under the pointer, or null with no zone and after a cancel. */
export function endPaneDrag(): PaneDrop | null {
  const drop = session === null ? null : (usePaneDragStore.getState().zone?.drop ?? null);
  cancelPaneDrag();
  return drop;
}

/** Hides the zones. The release that follows drops nothing. */
export function cancelPaneDrag(): void {
  if (session === null) return;
  session = null;
  window.removeEventListener("keydown", onKeyDown, true);
  if (usePaneDragStore.getState() !== IDLE) usePaneDragStore.setState(IDLE, true);
}

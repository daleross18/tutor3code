import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import { use } from "react";

import {
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
} from "../rightPanelStore";
import { focusPane, readPaneAreaSize } from "./paneActions";
import { browserPaneHost, openBrowserPane, showDropRefusal } from "./paneBrowserActions";
import type { PaneDrop } from "./paneBrowserLayout";
import { PaneCellContext } from "./paneContext";
import {
  beginPaneDrag,
  cancelPaneDrag,
  endPaneDrag,
  movePaneDrag,
  rectOf,
  usePaneDragStore,
} from "./paneDrag";
import { requestPaneFocusRestore } from "./paneFocusMemory";
import { createDraftResolver, threadKey } from "./paneRouteSync";
import { usePaneStore } from "./paneStore";
import { getActiveTab } from "./paneTree";
import { panelTabPaneOf, placeChatPane, type PanelTabPane } from "./panelTabPane";
import { useReadoutSettingsStore } from "./readoutSettings";

const draftResolver = createDraftResolver();

/**
 * The value of `data-right-panel-surface` on a tab of the stock right panel (hunk set
 * `r12-panel-tab-drag`): the surface id of a tab that drags out of the panel, else undefined,
 * so with "Browser panes" off the tab is stock.
 */
export function usePanelTabDragId(surface: RightPanelSurface): string | undefined {
  const enabled = useReadoutSettingsStore((settings) => settings.browserPanes);
  const inPane = use(PaneCellContext)?.threadRef != null;
  const pane = panelTabPaneOf(surface);
  if (!enabled || !inPane || pane === null) return undefined;
  // A plain web browser has no browser pane. A side chat pane needs none.
  if (pane.kind === "browser" && !browserPaneHost.available()) return undefined;
  return surface.id;
}

// True from a release of a tab drag that ended outside its panel, or was cancelled there, to the
// end of that release. The stock reorder then does nothing: it would move the tab to the edge of
// the strip. dnd-kit ends its drag in the same pointerup dispatch, or cancelled it before.
let releasedOutsidePanel = false;

/** The stock reorder of the right panel asks this once at the end of its drag. */
export function panelTabLeftPanel(): boolean {
  const left = releasedOutsidePanel;
  releasedOutsidePanel = false;
  return left;
}

/** Opens a chat pane of the side chat at the drop. Its tab leaves the panel of the parent. */
function openSideChatPane(
  router: AnyRouter,
  parentRef: ScopedThreadRef,
  surfaceId: string,
  pane: Extract<PanelTabPane, { kind: "chat" }>,
  drop: PaneDrop,
): void {
  const { layout } = usePaneStore.getState();
  const target = {
    kind: "server",
    threadRef: scopeThreadRef(parentRef.environmentId, pane.threadId),
  } as const;
  const keyOf = (key: Parameters<typeof threadKey>[0]) => threadKey(key, draftResolver);
  const mirror = useReadoutSettingsStore.getState().mirrorPanes;
  const placed = placeChatPane(layout, target, drop, keyOf, mirror, readPaneAreaSize());
  if (placed === null) return;
  if ("refusal" in placed) {
    showDropRefusal(placed.refusal, drop, "Can't put the side chat there");
    return;
  }
  usePaneStore.getState().replaceLayout(placed.layout);
  useRightPanelStore.getState().closeSurface(parentRef, surfaceId);
  const focusedPaneId = getActiveTab(placed.layout).focusedPaneId;
  requestPaneFocusRestore(focusedPaneId);
  focusPane(router, focusedPaneId);
}

function dropPanelTab(
  router: AnyRouter,
  threadRef: ScopedThreadRef,
  surfaceId: string,
  pane: PanelTabPane,
  drop: PaneDrop,
): void {
  if (pane.kind === "browser") openBrowserPane(router, threadRef, pane.tabId, drop);
  else openSideChatPane(router, threadRef, surfaceId, pane, drop);
}

interface TabPress {
  readonly button: number;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly target: EventTarget | null;
}

let stopCurrentDrag: (() => void) | null = null;

/**
 * A press on a tab of the right panel of the pane's thread. The stock reorder keeps the drag
 * while the pointer is in the panel. Outside it the drop zones show, and a release on one
 * opens the tab there as a pane. A press that does not leave the panel stays stock.
 */
export function pressRightPanelTab(
  press: TabPress,
  threadRef: ScopedThreadRef,
  router: AnyRouter,
): void {
  if (press.button !== 0 || !(press.target instanceof Element)) return;
  if (press.target.closest("input") !== null) return;
  const tab = press.target.closest<HTMLElement>("[data-right-panel-surface]");
  const surfaceId = tab?.dataset.rightPanelSurface;
  const panel = tab?.closest("[data-preview-panel-mode]");
  if (tab == null || surfaceId === undefined || panel == null) return;
  const surface = selectThreadRightPanelState(
    useRightPanelStore.getState().byThreadKey,
    threadRef,
  ).surfaces.find((candidate) => candidate.id === surfaceId);
  const found = surface === undefined ? null : panelTabPaneOf(surface);
  if (found === null) return;
  const handle: HTMLElement = tab;
  const draggedId: string = surfaceId;
  const pane: PanelTabPane = found;
  stopCurrentDrag?.();
  releasedOutsidePanel = false;
  const { pointerId } = press;
  let cancelledOutside = false;
  let captured = false;
  // Before the drag's own key listener, which hides the zones on Escape.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && usePaneDragStore.getState().active) cancelledOutside = true;
  };
  window.addEventListener("keydown", onKeyDown, true);
  beginPaneDrag(
    { kind: "panel-tab", panelRect: rectOf(panel) },
    { x: press.clientX, y: press.clientY },
  );
  function stop() {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    if (captured && handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    stopCurrentDrag = null;
  }
  function onMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    if ((event.buttons & 1) === 0) {
      stopCurrentDrag?.();
      return;
    }
    movePaneDrag({ x: event.clientX, y: event.clientY });
    // Capture keeps the drag alive over the page of a browser pane.
    if (captured || !usePaneDragStore.getState().active || !handle.isConnected) return;
    captured = true;
    handle.setPointerCapture(pointerId);
  }
  function onUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    releasedOutsidePanel = cancelledOutside || usePaneDragStore.getState().active;
    if (releasedOutsidePanel) setTimeout(() => (releasedOutsidePanel = false));
    stop();
    const drop = endPaneDrag();
    if (drop !== null) dropPanelTab(router, threadRef, draggedId, pane, drop);
  }
  function onCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    stop();
    cancelPaneDrag();
  }
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  stopCurrentDrag = () => {
    stop();
    cancelPaneDrag();
  };
}

import type { ScopedThreadRef } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";

import { toastManager } from "../components/ui/toast";
import { browserMiniPlayerSource, usePreviewMiniPlayerStore } from "../previewMiniPlayerStore";
import {
  isPreviewSupportedInRuntime,
  readThreadPreviewState,
  setActivePreviewTab,
} from "../previewStateStore";
import { selectActiveRightPanelSurface, useRightPanelStore } from "../rightPanelStore";
import { focusPane, readPaneAreaSize } from "./paneActions";
import {
  closeBrowserLeaf,
  dropRefusal,
  findBrowserLeaf,
  layoutForMove,
  moveLeaf,
  placeLeaf,
  preferredSplitSides,
  type PaneDrop,
} from "./paneBrowserLayout";
import { requestPaneFocusRestore } from "./paneFocusMemory";
import { usePaneStore } from "./paneStore";
import {
  createBrowserLeaf,
  findLeaf,
  findTabOfLeaf,
  getActiveTab,
  MAX_PANES_PER_TAB,
  type PaneLayout,
  type PaneSplitRefusal,
} from "./paneTree";
import { useReadoutSettingsStore } from "./readoutSettings";

/**
 * A browser pane shows the desktop app's browser. A plain web browser has none, and a pane of
 * that kind shows the chat of its thread there. A test replaces `available`.
 */
export const browserPaneHost = {
  available: (): boolean => isPreviewSupportedInRuntime(),
};

/** True where a pane can show a browser: the setting is on, in the desktop app. */
export function browserPanesAvailable(): boolean {
  return useReadoutSettingsStore.getState().browserPanes && browserPaneHost.available();
}

export function useBrowserPanesAvailable(): boolean {
  return (
    useReadoutSettingsStore((settings) => settings.browserPanes) && browserPaneHost.available()
  );
}

/** The message for a drop that breaks a split rule. A chat pane gives its own title. */
export function showDropRefusal(
  refusal: PaneSplitRefusal,
  drop: PaneDrop,
  title = "Can't put the browser there",
): void {
  const along = drop.kind === "pane" && (drop.side === "up" || drop.side === "down");
  toastManager.add({
    type: "warning",
    title,
    description:
      refusal.reason === "max-panes"
        ? `A tab holds at most ${MAX_PANES_PER_TAB} panes.`
        : `The new pane would be ${Math.floor(refusal.halfPx)} px ${
            along ? "high" : "wide"
          }. The minimum is ${refusal.minPx} px.`,
  });
}

/** The store changes first, then the URL moves to the thread of the pane that has focus. */
function commitLayout(router: AnyRouter, layout: PaneLayout): void {
  usePaneStore.getState().replaceLayout(layout);
  const focusedPaneId = getActiveTab(layout).focusedPaneId;
  requestPaneFocusRestore(focusedPaneId);
  focusPane(router, focusedPaneId);
}

/** Only one webview exists for a tab, so the pane takes it from the two stock places. */
function releaseTabForPane(threadRef: ScopedThreadRef, tabId: string): void {
  setActivePreviewTab(threadRef, tabId);
  usePreviewMiniPlayerStore.getState().close(threadRef);
  const panel = useRightPanelStore.getState();
  const surface = selectActiveRightPanelSurface(panel.byThreadKey, threadRef);
  if (surface?.kind === "preview" && surface.resourceId === tabId) panel.close(threadRef);
}

/**
 * Shows a browser tab of the thread in a pane at the drop, in place of its floating preview. A
 * browser pane that the destination tab already has for the thread moves there, so one tab of
 * panes never has two views of one page. False when the drop was refused.
 */
export function openBrowserPane(
  router: AnyRouter,
  threadRef: ScopedThreadRef,
  tabId: string,
  drop: PaneDrop,
): boolean {
  if (!browserPanesAvailable()) return false;
  const { layout } = usePaneStore.getState();
  const destination =
    drop.kind === "new-tab"
      ? null
      : drop.kind === "pane"
        ? findTabOfLeaf(layout, drop.paneId)
        : (layout.tabs.find((tab) => tab.id === drop.tabId) ?? null);
  const existing = destination === null ? null : findBrowserLeaf(destination, threadRef);
  if (existing !== null && destination !== null) {
    const moved = drop.kind === "pane" ? moveLeaf(layout, existing.id, drop) : null;
    const shown = moved ?? {
      ...layout,
      activeTabId: destination.id,
      tabs: layout.tabs.map((tab) =>
        tab.id === destination.id ? { ...tab, focusedPaneId: existing.id } : tab,
      ),
    };
    releaseTabForPane(threadRef, tabId);
    commitLayout(router, shown);
    return true;
  }
  const refusal = dropRefusal(layout, drop, readPaneAreaSize());
  if (refusal !== null) {
    showDropRefusal(refusal, drop);
    return false;
  }
  const next = placeLeaf(layout, createBrowserLeaf(threadRef), drop);
  if (next === null) return false;
  releaseTabForPane(threadRef, tabId);
  commitLayout(router, next);
  return true;
}

/** The button "Open in a split pane": beside the pane when it is wide, else under it. */
export function openBrowserPaneBeside(
  router: AnyRouter,
  threadRef: ScopedThreadRef,
  tabId: string,
  paneId: string,
): boolean {
  const { layout } = usePaneStore.getState();
  const tab = findTabOfLeaf(layout, paneId);
  if (tab === null) return false;
  const container = readPaneAreaSize();
  const drops = preferredSplitSides(tab, paneId, container).map((side): PaneDrop => ({
    kind: "pane",
    paneId,
    side,
  }));
  const fits = drops.find((drop) => dropRefusal(layout, drop, container) === null);
  return openBrowserPane(router, threadRef, tabId, fits ?? drops[0]!);
}

/** Moves a browser pane to the drop. Its sizes follow the split rules of the new place. */
export function moveBrowserPane(router: AnyRouter, paneId: string, drop: PaneDrop): boolean {
  const { layout } = usePaneStore.getState();
  const next = moveLeaf(layout, paneId, drop);
  if (next === null) return false;
  const refusal = dropRefusal(layoutForMove(layout, paneId), drop, readPaneAreaSize());
  if (refusal !== null) {
    showDropRefusal(refusal, drop);
    return false;
  }
  commitLayout(router, next);
  return true;
}

/**
 * "Back to floating preview": the pane closes, or shows the chat where its tab has no chat pane
 * of the thread, and the page shows in the stock floating preview of that chat.
 */
export function returnBrowserPaneToPreview(router: AnyRouter, paneId: string): void {
  const { layout } = usePaneStore.getState();
  const tab = findTabOfLeaf(layout, paneId);
  const target = tab === null ? null : (findLeaf(tab.root, paneId)?.target ?? null);
  if (target?.kind !== "server") return;
  const tabId = readThreadPreviewState(target.threadRef).activeTabId;
  commitLayout(router, closeBrowserLeaf(layout, paneId));
  if (tabId !== null) {
    usePreviewMiniPlayerStore.getState().open(target.threadRef, browserMiniPlayerSource(tabId));
  }
}

/** Closes the pane and keeps the browser tab of the thread. The last pane shows the chat. */
export function closeBrowserPane(router: AnyRouter, paneId: string): void {
  const store = usePaneStore.getState();
  const tab = findTabOfLeaf(store.layout, paneId);
  if (tab === null) return;
  const last = store.layout.tabs.length === 1 && tab.root.kind === "leaf";
  if (last) {
    commitLayout(router, closeBrowserLeaf(store.layout, paneId));
    return;
  }
  store.closePane(paneId);
  const focusedPaneId = getActiveTab(usePaneStore.getState().layout).focusedPaneId;
  requestPaneFocusRestore(focusedPaneId);
  focusPane(router, focusedPaneId);
}

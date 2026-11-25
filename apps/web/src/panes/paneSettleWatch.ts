import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";

import { composerDraftHasUserContent, useComposerDraftStore } from "../composerDraftStore";
import { replacePaneThread } from "./paneActions";
import { usePaneStore } from "./paneStore";
import {
  findLeaf,
  getActiveTab,
  isBrowserLeaf,
  isMultiLayout,
  listLeaves,
  type PaneLayout,
} from "./paneTree";

/** What a pane sees of its thread. Null while the thread is not loaded. */
export type SettleObservation = { readonly settled: boolean; readonly merged: boolean } | null;

/**
 * A thread is armed after a pane showed it while it was not settled. An armed thread that is
 * settled, with a merged pull request, gives its panes back. A thread that the user opens when
 * it is already settled is never armed, so its pane keeps it.
 */
export function settleWatchStep(
  armed: boolean,
  observed: SettleObservation,
): { readonly armed: boolean; readonly release: boolean } {
  if (observed === null) return { armed, release: false };
  if (!observed.settled) return { armed: true, release: false };
  return armed && observed.merged ? { armed: false, release: true } : { armed, release: false };
}

/**
 * The threads to watch: each server thread that a pane of any tab shows, one time, in layout
 * order. None with the setting off, and none with one tab and one pane, which is stock.
 */
export function watchedThreads(
  enabled: boolean,
  layout: PaneLayout,
): ReadonlyArray<ScopedThreadRef> {
  if (!enabled || !isMultiLayout(layout)) return [];
  const byKey = new Map<string, ScopedThreadRef>();
  for (const tab of layout.tabs) {
    for (const leaf of listLeaves(tab.root)) {
      // A browser pane is no chat of its thread: a settle leaves it, and it arms no thread.
      if (leaf.target?.kind !== "server" || isBrowserLeaf(leaf)) continue;
      const key = scopedThreadKey(leaf.target.threadRef);
      if (!byKey.has(key)) byKey.set(key, leaf.target.threadRef);
    }
  }
  return [...byKey.values()];
}

/** The id of the focused pane of the active tab, when that pane shows the thread. */
export function focusedPaneShowing(layout: PaneLayout, threadKey: string): string | null {
  const tab = getActiveTab(layout);
  const focused = findLeaf(tab.root, tab.focusedPaneId);
  const target = focused === null || isBrowserLeaf(focused) ? null : focused.target;
  return target?.kind === "server" && scopedThreadKey(target.threadRef) === threadKey
    ? tab.focusedPaneId
    : null;
}

/**
 * Each pane that shows the thread, in every tab, takes its own new draft thread. A thread with
 * unsent text in its composer keeps its panes, so the text stays in view. `keepFocusPaneId` is
 * the pane that had focus when the thread settled: it has the focus again with its draft, also
 * after the stock settle action moved the route to the next thread, in another pane or in it.
 */
export function releasePanesOfThread(
  router: AnyRouter,
  threadRef: ScopedThreadRef,
  keepFocusPaneId: string | null = null,
): void {
  const draft = useComposerDraftStore.getState().getComposerDraft(threadRef);
  if (composerDraftHasUserContent(draft)) return;
  const key = scopedThreadKey(threadRef);
  let focusKept = false;
  for (const tab of usePaneStore.getState().layout.tabs) {
    for (const leaf of listLeaves(tab.root)) {
      if (isBrowserLeaf(leaf)) continue;
      if (leaf.target?.kind === "server" && scopedThreadKey(leaf.target.threadRef) === key) {
        focusKept ||= leaf.id === keepFocusPaneId;
        replacePaneThread(router, leaf.id, { keepFocus: leaf.id === keepFocusPaneId });
      }
    }
  }
  // The route of the stock settle action can open the next thread in that pane before this runs.
  if (keepFocusPaneId !== null && !focusKept) {
    replacePaneThread(router, keepFocusPaneId, { keepFocus: true });
  }
}

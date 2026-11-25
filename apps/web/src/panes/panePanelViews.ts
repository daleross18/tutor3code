import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

// No import of app code: paneContext.tsx loads this file, and upstream tests that mock single
// hook modules (DiffPanel.browser.test.tsx) load paneContext.tsx.

type PaneWidth = "narrow" | "wide";

/** The mounted chat views of each thread, by the width of their pane. */
const panelViews = new Map<string, Record<PaneWidth, number>>();

/** Records one mounted chat view of a thread. Returns the function that removes the record. */
export function trackPanePanelView(threadRef: ScopedThreadRef, narrow: boolean): () => void {
  const threadKey = scopedThreadKey(threadRef);
  const width: PaneWidth = narrow ? "narrow" : "wide";
  const views = panelViews.get(threadKey) ?? { narrow: 0, wide: 0 };
  panelViews.set(threadKey, { ...views, [width]: views[width] + 1 });
  return () => {
    const current = panelViews.get(threadKey);
    if (current === undefined) return;
    const next = { ...current, [width]: current[width] - 1 };
    if (next.narrow === 0 && next.wide === 0) panelViews.delete(threadKey);
    else panelViews.set(threadKey, next);
  };
}

/** True when every pane that shows the thread is too narrow for the right panel. */
export function paneRefusesPanel(threadRef: ScopedThreadRef): boolean {
  const views = panelViews.get(scopedThreadKey(threadRef));
  return views !== undefined && views.narrow > 0 && views.wide === 0;
}

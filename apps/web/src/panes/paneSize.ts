/**
 * Stock decides its narrow layouts from the window size. A pane has its own box, so the width
 * classes are the stock breakpoints applied to the pane.
 */

// The stock right panel and the chat column beside it each need 360 px: PREVIEW_PANEL_MIN_WIDTH
// and SIBLING_COLUMN_MIN_WIDTH in hooks/usePreviewPanelInlineSize.ts. 360 + 360 = 720.
export const PANE_PANEL_INLINE_MIN_WIDTH_PX = 720;
// Stock uses its phone gutters and its phone headline size below the 640 px window breakpoint.
const PANE_COMPACT_MAX_WIDTH_PX = 640;
// The stock header (52 px) and the stock two-line composer (140 px) take 192 px, and the stock
// new-thread screen takes 268 px in a wide pane and about 300 px in a narrow one. Below 320 px
// a pane uses its small header and its one-line composer (the `data-pane-short` rules of
// panes.css).
export const PANE_SHORT_MAX_HEIGHT_PX = 320;

export type PaneWidthClass = "wide" | "narrow" | "compact";
export type PaneHeightClass = "tall" | "short";

/** `narrow` is too narrow for the right panel beside the chat column. `compact` is also narrow. */
export function paneWidthClassOf(widthPx: number): PaneWidthClass {
  if (widthPx < PANE_COMPACT_MAX_WIDTH_PX) return "compact";
  return widthPx < PANE_PANEL_INLINE_MIN_WIDTH_PX ? "narrow" : "wide";
}

export function paneHeightClassOf(heightPx: number): PaneHeightClass {
  return heightPx < PANE_SHORT_MAX_HEIGHT_PX ? "short" : "tall";
}

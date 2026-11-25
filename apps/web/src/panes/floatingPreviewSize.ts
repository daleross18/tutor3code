import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import {
  useBrowserSurfaceStore,
  type BrowserSurfaceContentPresentation,
} from "../browser/browserSurfaceStore";
import { PREVIEW_MINI_PLAYER_EDGE_GAP } from "../components/preview/previewMiniPlayerLayout";

interface PreviewBox {
  readonly width: number;
  readonly height: number;
}

/** The part of the pane width that the floating preview of an artifact link starts with. */
const LARGE_PREVIEW_WIDTH_SHARE = 0.7;
// Taller than wide: an artifact is a document, and a page reads from the top down.
const LARGE_PREVIEW_HEIGHT_RATIO = 1.25;
// The stock minimum width of the floating preview (previewMiniPlayerLayout.ts).
const MIN_PREVIEW_WIDTH_PX = 240;
// A page narrower than a phone screen breaks most layouts, so a smaller frame scales the page.
const MIN_PAGE_WIDTH_PX = 390;

/**
 * The first box of the floating preview that an artifact link opens. Stock keeps the shape and
 * makes the box smaller where the pane is too short for it (see `trackPageSize`).
 */
export function largePreviewBox(container: PreviewBox): PreviewBox {
  const widest = container.width - PREVIEW_MINI_PLAYER_EDGE_GAP * 2;
  const width = Math.round(
    Math.max(MIN_PREVIEW_WIDTH_PX, Math.min(container.width * LARGE_PREVIEW_WIDTH_SHARE, widest)),
  );
  return { width, height: Math.round(width * LARGE_PREVIEW_HEIGHT_RATIO) };
}

/** The same shape at a width that the user set before. */
export function previewBoxOfWidth(width: number): PreviewBox {
  return { width, height: Math.round(width * LARGE_PREVIEW_HEIGHT_RATIO) };
}

/** The page size for a frame: the size of the frame, so the page shows at its real size. */
export function pageSizeForFrame(frame: PreviewBox): PreviewBox {
  const scale = Math.max(1, MIN_PAGE_WIDTH_PX / frame.width);
  return { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
}

/**
 * The page size that follows the frame, or null when the page already fits it. `wantedWidth` is
 * the width that the fork asked for and stock made smaller, because stock keeps the shape of the
 * page and the pane was too short: the page then takes that width at the height that fits.
 */
export function trackPageSize(
  frame: PreviewBox,
  page: PreviewBox,
  wantedWidth: number | null,
): PreviewBox | null {
  const next =
    wantedWidth !== null && frame.width < wantedWidth - 1
      ? pageSizeForFrame({ width: wantedWidth, height: frame.height })
      : pageSizeForFrame(frame);
  return Math.abs(next.width - page.width) <= 1 && Math.abs(next.height - page.height) <= 1
    ? null
    : next;
}

// The floating previews that an artifact link opened, for the life of the window.
const largeTabs = new Set<string>();
const largeTabKey = (threadRef: ScopedThreadRef, tabId: string) =>
  `${scopedThreadKey(threadRef)}\u0000${tabId}`;

/** Marks the browser tab: its floating preview starts large (setting largeFloatingPreview). */
export function requestLargeFloatingPreview(threadRef: ScopedThreadRef, tabId: string): void {
  largeTabs.add(largeTabKey(threadRef, tabId));
}

export function wantsLargeFloatingPreview(threadRef: ScopedThreadRef, tabId: string): boolean {
  return largeTabs.has(largeTabKey(threadRef, tabId));
}

// The page size that the fork gives to the floating preview of a tab, by runtime tab id.
const pages = new Map<string, PreviewBox>();
let stopFollowingSurfaces: (() => void) | null = null;

export function isFloatingPageApplied(
  content: BrowserSurfaceContentPresentation | null,
  page: PreviewBox,
): boolean {
  return (
    content !== null &&
    content.scale === 1 &&
    content.width === page.width &&
    content.height === page.height
  );
}

/**
 * Stock derives the shape of the floating preview and the size of its page from one value: the
 * size at which the page showed last (`fittedSourceContent`), or 1280 x 800 for a tab that never
 * showed. The fork writes its page size there for the tabs it sizes, each time stock claims the
 * tab for a floating preview.
 */
function applyFloatingPages(): void {
  const { byTabId } = useBrowserSurfaceStore.getState();
  for (const [tabId, page] of pages) {
    const current = byTabId[tabId];
    if (!current?.fitSourceContent || isFloatingPageApplied(current.fittedSourceContent, page)) {
      continue;
    }
    useBrowserSurfaceStore.setState({
      byTabId: {
        ...byTabId,
        [tabId]: {
          ...current,
          fittedSourceContent: { x: 0, y: 0, ...page, scale: 1, scrollLeft: 0, scrollTop: 0 },
        },
      },
    });
    // The write runs this function again, for the tabs that are left.
    return;
  }
}

export function floatingPageSizeOf(runtimeTabId: string): PreviewBox | null {
  return pages.get(runtimeTabId) ?? null;
}

/** Null gives the size of the tab's page back to stock, from the next claim of the tab. */
export function setFloatingPageSize(runtimeTabId: string, page: PreviewBox | null): void {
  if (page === null) pages.delete(runtimeTabId);
  else pages.set(runtimeTabId, page);
  if (pages.size === 0) {
    stopFollowingSurfaces?.();
    stopFollowingSurfaces = null;
    return;
  }
  stopFollowingSurfaces ??= useBrowserSurfaceStore.subscribe(applyFloatingPages);
  applyFloatingPages();
}

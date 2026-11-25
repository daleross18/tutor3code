import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, FILL_PREVIEW_VIEWPORT, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { acquireBrowserSurface, useBrowserSurfaceStore } from "../browser/browserSurfaceStore";
import {
  resolvePreviewMiniPlayerFrame,
  resolvePreviewMiniPlayerSourceSize,
} from "../components/preview/previewMiniPlayerLayout";
import {
  floatingPageSizeOf,
  largePreviewBox,
  pageSizeForFrame,
  previewBoxOfWidth,
  requestLargeFloatingPreview,
  setFloatingPageSize,
  trackPageSize,
  wantsLargeFloatingPreview,
} from "./floatingPreviewSize";

describe("the first size of the floating preview of an artifact link", () => {
  it("is 70% of the pane width and taller than wide, inside the stock limits", () => {
    expect(largePreviewBox({ width: 620, height: 800 })).toEqual({ width: 434, height: 543 });
    // The stock minimum width, and the stock gap of 12 px on each side.
    expect(largePreviewBox({ width: 300, height: 800 })).toEqual({ width: 240, height: 300 });
    expect(largePreviewBox({ width: 250, height: 800 }).width).toBe(240);
    expect(previewBoxOfWidth(400)).toEqual({ width: 400, height: 500 });
  });

  it("gives the page the size of the frame, and never less than a phone width", () => {
    expect(pageSizeForFrame({ width: 434, height: 543 })).toEqual({ width: 434, height: 543 });
    expect(pageSizeForFrame({ width: 260, height: 325 })).toEqual({ width: 390, height: 488 });
  });

  it("makes the stock layout give that frame, where stock gives 320 x 200 for a new tab", () => {
    const container = { width: 620, height: 800 };
    const stockSource = resolvePreviewMiniPlayerSourceSize(FILL_PREVIEW_VIEWPORT, null, 1);
    expect(stockSource).toEqual({ width: 1280, height: 800 });
    expect(
      resolvePreviewMiniPlayerFrame({
        width: null,
        position: null,
        source: stockSource,
        container,
      }),
    ).toMatchObject({ width: 320, height: 200 });

    const box = largePreviewBox(container);
    const page = pageSizeForFrame(box);
    const fitted = { x: 0, y: 0, ...page, scale: 1, scrollLeft: 0, scrollTop: 0 };
    const source = resolvePreviewMiniPlayerSourceSize(FILL_PREVIEW_VIEWPORT, fitted, 1);
    expect(
      resolvePreviewMiniPlayerFrame({ width: box.width, position: null, source, container }),
    ).toMatchObject(box);
  });
});

describe("trackPageSize", () => {
  it("keeps a page that fits its frame", () => {
    expect(
      trackPageSize({ width: 434, height: 543 }, { width: 434, height: 543 }, null),
    ).toBeNull();
    // A frame that stock rounded by one pixel is the same frame.
    expect(
      trackPageSize({ width: 434, height: 542 }, { width: 434, height: 543 }, null),
    ).toBeNull();
  });

  it("follows a frame that the user made larger or smaller", () => {
    expect(trackPageSize({ width: 600, height: 750 }, { width: 434, height: 543 }, null)).toEqual({
      width: 600,
      height: 750,
    });
    expect(trackPageSize({ width: 300, height: 375 }, { width: 434, height: 543 }, null)).toEqual({
      width: 390,
      height: 488,
    });
  });

  it("takes the asked width at the height that fits, where stock made the frame smaller", () => {
    // A short pane: stock kept the shape and gave 240 x 300 for an asked width of 434.
    const page = { width: 434, height: 543 };
    expect(trackPageSize({ width: 240, height: 300 }, page, 434)).toEqual({
      width: 434,
      height: 300,
    });
    // With that page, the stock layout gives the asked width in the short pane.
    const container = { width: 620, height: 324 };
    const source = { width: 434, height: 300 };
    expect(
      resolvePreviewMiniPlayerFrame({ width: 434, position: null, source, container }),
    ).toMatchObject({ width: 434, height: 300 });
  });
});

describe("the page size in the stock browser surface store", () => {
  const fittedOf = (tabId: string) =>
    useBrowserSurfaceStore.getState().byTabId[tabId]?.fittedSourceContent ?? null;

  it("is written each time the floating preview claims the tab, and not for the right panel", () => {
    const tabId = "runtime-tab-size";
    setFloatingPageSize(tabId, { width: 434, height: 543 });
    expect(floatingPageSizeOf(tabId)).toEqual({ width: 434, height: 543 });
    // No surface yet: the claim of the floating preview comes later.
    expect(fittedOf(tabId)).toBeNull();

    const floating = acquireBrowserSurface(tabId, true);
    expect(fittedOf(tabId)).toMatchObject({ width: 434, height: 543, scale: 1 });
    // Stock then reports where the page shows. The fork's size stays.
    useBrowserSurfaceStore.getState().presentContent(tabId, {
      x: 0,
      y: 40,
      width: 320,
      height: 200,
      scale: 0.25,
      scrollLeft: 0,
      scrollTop: 0,
    });
    expect(fittedOf(tabId)).toMatchObject({ width: 434, height: 543, scale: 1 });

    setFloatingPageSize(tabId, { width: 600, height: 750 });
    expect(fittedOf(tabId)).toMatchObject({ width: 600, height: 750 });

    // The right panel takes the tab with no fitted size, as in stock.
    floating.release();
    const panel = acquireBrowserSurface(tabId, false);
    expect(fittedOf(tabId)).toBeNull();
    panel.release();

    // A second floating preview of the tab gets the size again, until the fork gives it back.
    const again = acquireBrowserSurface(tabId, true);
    expect(fittedOf(tabId)).toMatchObject({ width: 600, height: 750 });
    again.release();
    setFloatingPageSize(tabId, null);
    const stock = acquireBrowserSurface(tabId, true);
    expect(fittedOf(tabId)).toMatchObject({ width: 320, height: 200, scale: 0.25 });
    stock.release();
  });

  it("marks the tab that an artifact link opened", () => {
    const threadRef = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-1"));
    expect(wantsLargeFloatingPreview(threadRef, "tab-1")).toBe(false);
    requestLargeFloatingPreview(threadRef, "tab-1");
    expect(wantsLargeFloatingPreview(threadRef, "tab-1")).toBe(true);
    expect(wantsLargeFloatingPreview(threadRef, "tab-2")).toBe(false);
  });
});

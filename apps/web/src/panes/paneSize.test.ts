import { describe, expect, it } from "vite-plus/test";

import {
  PANE_PANEL_INLINE_MIN_WIDTH_PX,
  PANE_SHORT_MAX_HEIGHT_PX,
  paneHeightClassOf,
  paneWidthClassOf,
} from "./paneSize";
import { MIN_PANE_HEIGHT_PX, MIN_PANE_WIDTH_PX } from "./paneTree";

describe("pane size classes", () => {
  it("has room for the right panel beside the chat column from 720 px", () => {
    // The stock minimum of the panel and the stock minimum of the chat column beside it.
    expect(PANE_PANEL_INLINE_MIN_WIDTH_PX).toBe(360 + 360);
    expect(paneWidthClassOf(720)).toBe("wide");
    expect(paneWidthClassOf(719.5)).toBe("narrow");
    expect(paneWidthClassOf(640)).toBe("narrow");
    expect(paneWidthClassOf(639)).toBe("compact");
    expect(paneWidthClassOf(MIN_PANE_WIDTH_PX)).toBe("compact");
  });

  it("keeps the stock header and composer in a pane of a 2x2 grid, not in its halves", () => {
    expect(paneHeightClassOf(PANE_SHORT_MAX_HEIGHT_PX)).toBe("tall");
    expect(paneHeightClassOf(PANE_SHORT_MAX_HEIGHT_PX - 1)).toBe("short");
    // A pane of a 2x2 grid in a 1470 x 834 window, its half, and the smallest pane.
    expect(paneHeightClassOf(399)).toBe("tall");
    expect(paneHeightClassOf(199)).toBe("short");
    expect(paneHeightClassOf(MIN_PANE_HEIGHT_PX)).toBe("short");
  });
});

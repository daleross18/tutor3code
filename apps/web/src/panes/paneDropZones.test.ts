import { describe, expect, it } from "vite-plus/test";

import {
  dropHalfOf,
  dropSideOf,
  newTabZoneBeside,
  resolveDropZone,
  tabSlotOf,
  tabStripEndOf,
  type PaneDropTargets,
} from "./paneDropZones";

const PANE = { left: 100, top: 50, width: 600, height: 300 };

describe("dropSideOf", () => {
  it.each([
    ["left", { x: 150, y: 200 }],
    ["right", { x: 650, y: 200 }],
    ["up", { x: 400, y: 70 }],
    ["down", { x: 400, y: 330 }],
    // A wide pane: 120 px from the left edge is nearer, as a part of the size, than 80 px from
    // the top edge.
    ["left", { x: 220, y: 130 }],
    ["up", { x: 300, y: 100 }],
  ] as const)("gives the %s side for a point near that edge", (side, point) => {
    expect(dropSideOf(PANE, point)).toBe(side);
  });
});

describe("dropHalfOf", () => {
  it("gives the half of the pane on each side", () => {
    expect(dropHalfOf(PANE, "left")).toEqual({ left: 100, top: 50, width: 300, height: 300 });
    expect(dropHalfOf(PANE, "right")).toEqual({ left: 400, top: 50, width: 300, height: 300 });
    expect(dropHalfOf(PANE, "up")).toEqual({ left: 100, top: 50, width: 600, height: 150 });
    expect(dropHalfOf(PANE, "down")).toEqual({ left: 100, top: 200, width: 600, height: 150 });
  });
});

describe("resolveDropZone", () => {
  const targets: PaneDropTargets = {
    panes: [
      { paneId: "own", rect: { left: 0, top: 40, width: 400, height: 600 } },
      { paneId: "other", rect: { left: 400, top: 40, width: 400, height: 600 } },
    ],
    tabs: [
      { tabId: "t1", rect: { left: 10, top: 6, width: 120, height: 24 } },
      { tabId: "t2", rect: { left: 134, top: 6, width: 120, height: 24 } },
    ],
    newTab: { left: 660, top: 48, width: 132, height: 36 },
    tabStripEnd: { left: 254, top: 0, width: 446, height: 36 },
  };

  it("gives a side of the pane under the pointer, with the half that the new pane takes", () => {
    expect(resolveDropZone(targets, { x: 420, y: 300 }, "own")).toEqual({
      drop: { kind: "pane", paneId: "other", side: "left" },
      rect: { left: 400, top: 40, width: 200, height: 600 },
    });
    expect(resolveDropZone(targets, { x: 600, y: 620 }, "own")?.drop).toEqual({
      kind: "pane",
      paneId: "other",
      side: "down",
    });
  });

  it("gives no zone in the pane that the drag started in, and none outside each box", () => {
    expect(resolveDropZone(targets, { x: 200, y: 300 }, "own")).toBeNull();
    expect(resolveDropZone(targets, { x: 900, y: 300 }, "own")).toBeNull();
    // A drag of a browser pane has no pane of its own to stay in.
    expect(resolveDropZone(targets, { x: 200, y: 300 }, null)?.drop).toMatchObject({
      paneId: "own",
    });
  });

  it("gives a tab of the tab strip, and the new-tab zone before the pane under it", () => {
    expect(resolveDropZone(targets, { x: 200, y: 18 }, "own")).toEqual({
      drop: { kind: "tab", tabId: "t2" },
      rect: targets.tabs[1]!.rect,
    });
    expect(resolveDropZone(targets, { x: 700, y: 60 }, "own")).toEqual({
      drop: { kind: "new-tab" },
      rect: targets.newTab,
    });
    expect(resolveDropZone({ ...targets, newTab: null }, { x: 700, y: 60 }, "own")?.drop).toEqual({
      kind: "pane",
      paneId: "other",
      side: "up",
    });
  });

  it("gives a new tab after the last tab on the empty end of the tab strip, and the tab on a tab", () => {
    expect(resolveDropZone(targets, { x: 400, y: 18 }, "own")).toEqual({
      drop: { kind: "new-tab", index: 2 },
      rect: targets.tabStripEnd,
    });
    expect(resolveDropZone(targets, { x: 220, y: 18 }, "own")?.drop).toEqual({
      kind: "tab",
      tabId: "t2",
    });
    expect(resolveDropZone({ ...targets, tabStripEnd: null }, { x: 400, y: 18 }, "own")).toBeNull();
  });
});

describe("tabSlotOf", () => {
  // Tabs of 120 px with gaps of 4 px: the band of a tab next to a gap is 24 px.
  const tabs = [
    { tabId: "t1", rect: { left: 10, top: 6, width: 120, height: 24 } },
    { tabId: "t2", rect: { left: 134, top: 6, width: 120, height: 24 } },
    { tabId: "t3", rect: { left: 258, top: 6, width: 40, height: 24 } },
  ];
  const indexAt = (x: number, y = 18) => {
    const zone = tabSlotOf(tabs, { x, y });
    return zone?.drop.kind === "new-tab" ? zone.drop.index : zone;
  };

  it("gives the place in the gap and in the outer band of each tab next to it", () => {
    expect(indexAt(132)).toBe(1);
    expect(indexAt(107)).toBe(1);
    expect(indexAt(157)).toBe(1);
    expect(indexAt(256)).toBe(2);
    // A tab of 40 px has a band of a quarter, 10 px.
    expect(indexAt(267)).toBe(2);
  });

  it("gives the places before the first tab and after the last tab", () => {
    expect(indexAt(3)).toBe(0);
    expect(indexAt(33)).toBe(0);
    expect(indexAt(290)).toBe(3);
    expect(indexAt(305)).toBe(3);
  });

  it("gives no place in the middle of a tab, off the row, or with no tab", () => {
    expect(indexAt(70)).toBeNull();
    expect(indexAt(105)).toBeNull();
    expect(indexAt(159)).toBeNull();
    expect(indexAt(278)).toBeNull();
    expect(indexAt(310)).toBeNull();
    expect(indexAt(132, 40)).toBeNull();
    expect(tabSlotOf([], { x: 10, y: 18 })).toBeNull();
  });

  it("shows the place as a line of 4 px in the middle of the gap, as tall as the tab", () => {
    expect(tabSlotOf(tabs, { x: 120, y: 10 })).toEqual({
      drop: { kind: "new-tab", index: 1 },
      rect: { left: 130, top: 6, width: 4, height: 24 },
      marker: true,
    });
    expect(tabSlotOf(tabs, { x: 5, y: 10 })?.rect.left).toBe(8);
    expect(tabSlotOf(tabs, { x: 300, y: 10 })?.rect.left).toBe(296);
  });

  it("comes before the tab and the strip end in the zone under the pointer", () => {
    const targets: PaneDropTargets = {
      panes: [],
      tabs,
      newTab: null,
      tabStripEnd: { left: 298, top: 0, width: 400, height: 36 },
    };
    expect(resolveDropZone(targets, { x: 128, y: 18 }, null)?.drop).toEqual({
      kind: "new-tab",
      index: 1,
    });
    expect(resolveDropZone(targets, { x: 70, y: 18 }, null)?.drop).toEqual({
      kind: "tab",
      tabId: "t1",
    });
    expect(resolveDropZone(targets, { x: 302, y: 18 }, null)?.marker).toBe(true);
    expect(resolveDropZone(targets, { x: 400, y: 18 }, null)?.marker).toBeUndefined();
  });
});

describe("tabStripEndOf", () => {
  const list = { left: 8, top: 6, width: 700, height: 24 };
  const bar = { left: 0, top: 0, width: 800, height: 36 };

  it("spans from the last tab to the end of the list, as tall as the bar", () => {
    expect(tabStripEndOf(list, bar, 254)).toEqual({ left: 254, top: 0, width: 454, height: 36 });
  });

  it("gives no end when the tabs fill the list or leave less than 24 px", () => {
    expect(tabStripEndOf(list, bar, 900)).toBeNull();
    expect(tabStripEndOf(list, bar, 690)).toBeNull();
    expect(tabStripEndOf(list, bar, null)).toEqual({ left: 8, top: 0, width: 700, height: 36 });
  });
});

describe("newTabZoneBeside", () => {
  const area = { left: 0, top: 0, width: 1000, height: 800 };
  const newTab = { left: 860, top: 8, width: 132, height: 36 };

  it("moves the zone left of a panel that it overlaps, with the same inset", () => {
    const panel = { left: 600, top: 0, width: 400, height: 800 };
    expect(newTabZoneBeside(newTab, panel, area)).toEqual({ ...newTab, left: 460 });
  });

  it("keeps a zone that the panel does not cover, and drops one with no room left", () => {
    expect(newTabZoneBeside(newTab, { left: 0, top: 100, width: 200, height: 700 }, area)).toBe(
      newTab,
    );
    expect(
      newTabZoneBeside(newTab, { left: 100, top: 0, width: 900, height: 800 }, area),
    ).toBeNull();
    expect(newTabZoneBeside(null, { left: 600, top: 0, width: 400, height: 800 }, area)).toBeNull();
  });
});

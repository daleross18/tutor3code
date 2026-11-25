import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  closeBrowserLeaf,
  dropRefusal,
  findBrowserLeaf,
  findChatLeaf,
  moveLeaf,
  placeLeaf,
  preferredSplitSides,
} from "./paneBrowserLayout";
import {
  MAX_PANES_PER_TAB,
  getActiveTab,
  listLeaves,
  type PaneLayout,
  type PaneLeaf,
  type PaneNode,
  type PaneTab,
} from "./paneTree";

const refOf = (threadId: string) =>
  scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(threadId));
const chat = (id: string, threadId: string): PaneLeaf => ({
  kind: "leaf",
  id,
  target: { kind: "server", threadRef: refOf(threadId) },
});
const browser = (id: string, threadId: string): PaneLeaf => ({
  ...chat(id, threadId),
  view: "browser",
});
const row = (children: ReadonlyArray<PaneNode>, id = "s"): PaneNode => ({
  kind: "split",
  id,
  axis: "row",
  children,
  sizes: children.map(() => 1 / children.length),
});
const tabOf = (id: string, root: PaneNode): PaneTab => ({
  id,
  root,
  focusedPaneId: listLeaves(root)[0]!.id,
});
const layoutOf = (...tabs: PaneTab[]): PaneLayout => ({ tabs, activeTabId: tabs[0]!.id });

/** Leaf ids and split axes as nested arrays, with `*` on a browser pane. */
function shape(node: PaneNode): unknown {
  if (node.kind === "leaf") return node.view === "browser" ? `${node.id}*` : node.id;
  return { [node.axis]: node.children.map(shape) };
}
const shapes = (layout: PaneLayout) => layout.tabs.map((tab) => shape(tab.root));

describe("placeLeaf", () => {
  const layout = layoutOf(tabOf("t1", row([chat("a", "A"), chat("b", "B")])));

  it.each([
    ["left", { row: ["a", "w*", "b"] }],
    ["right", { row: ["a", "b", "w*"] }],
    ["up", { row: ["a", { column: ["w*", "b"] }] }],
    ["down", { row: ["a", { column: ["b", "w*"] }] }],
  ] as const)("puts the pane on the %s side of a pane, with focus", (side, expected) => {
    const next = placeLeaf(layout, browser("w", "A"), { kind: "pane", paneId: "b", side })!;
    expect(shapes(next)).toEqual([expected]);
    expect(getActiveTab(next).focusedPaneId).toBe("w");
  });

  it("gives the new pane half of the pane it splits", () => {
    const next = placeLeaf(layout, browser("w", "A"), { kind: "pane", paneId: "b", side: "left" })!;
    expect(getActiveTab(next).root).toMatchObject({ sizes: [0.5, 0.25, 0.25] });
  });

  it("puts a drop on a tab at the right edge of that tab and shows the tab", () => {
    const two = layoutOf(
      tabOf("t1", chat("a", "A")),
      tabOf("t2", row([chat("b", "B"), chat("c", "C")])),
    );
    const next = placeLeaf(two, browser("w", "A"), { kind: "tab", tabId: "t2" })!;
    expect(shapes(next)).toEqual(["a", { row: ["b", "c", "w*"] }]);
    expect(next.activeTabId).toBe("t2");
    expect(next.tabs[1]!.focusedPaneId).toBe("w");
    // Each column of the tab keeps its part of the width, and the new column has an equal share.
    const { root } = next.tabs[1]!;
    expect(root.kind === "split" ? root.sizes.map((size) => size.toFixed(6)) : []).toEqual([
      "0.333333",
      "0.333333",
      "0.333333",
    ]);
  });

  it("opens a new tab after the active tab", () => {
    const next = placeLeaf(layout, browser("w", "A"), { kind: "new-tab" })!;
    expect(shapes(next)).toEqual([{ row: ["a", "b"] }, "w*"]);
    expect(next.activeTabId).toBe(next.tabs[1]!.id);
  });

  it("opens a new tab at the place of its index, clamped to the tab list", () => {
    const twoTabs = layoutOf(tabOf("t1", chat("a", "A")), tabOf("t2", chat("b", "B")));
    const at = (index: number) =>
      shapes(placeLeaf(twoTabs, browser("w", "A"), { kind: "new-tab", index })!);
    expect(at(0)).toEqual(["w*", "a", "b"]);
    expect(at(1)).toEqual(["a", "w*", "b"]);
    expect(at(2)).toEqual(["a", "b", "w*"]);
    expect(at(-3)).toEqual(["w*", "a", "b"]);
    expect(at(9)).toEqual(["a", "b", "w*"]);
    const next = placeLeaf(twoTabs, browser("w", "A"), { kind: "new-tab", index: 0 })!;
    expect(next.activeTabId).toBe(next.tabs[0]!.id);
    expect(getActiveTab(next).focusedPaneId).toBe("w");
  });

  it("refuses a pane or a tab that is gone, and a tab at the pane limit", () => {
    expect(placeLeaf(layout, browser("w", "A"), { kind: "tab", tabId: "none" })).toBeNull();
    expect(
      placeLeaf(layout, browser("w", "A"), { kind: "pane", paneId: "none", side: "left" }),
    ).toBeNull();
    const full = layoutOf(
      tabOf(
        "t1",
        row(Array.from({ length: MAX_PANES_PER_TAB }, (_unused, index) => chat(`p${index}`, "A"))),
      ),
    );
    expect(placeLeaf(full, browser("w", "A"), { kind: "tab", tabId: "t1" })).toBeNull();
    expect(dropRefusal(full, { kind: "tab", tabId: "t1" }, { width: 4000, height: 900 })).toEqual({
      reason: "max-panes",
    });
  });
});

describe("dropRefusal", () => {
  const layout = layoutOf(tabOf("t1", row([chat("a", "A"), chat("b", "B")])));

  it("applies the split rule to each side of a pane", () => {
    const container = { width: 700, height: 600 };
    expect(dropRefusal(layout, { kind: "pane", paneId: "a", side: "left" }, container)).toEqual({
      reason: "too-small",
      halfPx: 175,
      minPx: 200,
    });
    expect(dropRefusal(layout, { kind: "pane", paneId: "a", side: "up" }, container)).toBeNull();
    expect(dropRefusal(layout, { kind: "new-tab" }, container)).toBeNull();
  });

  it("needs room for one more column at the edge of a tab", () => {
    const drop = { kind: "tab", tabId: "t1" } as const;
    expect(dropRefusal(layout, drop, { width: 500, height: 600 })).toMatchObject({
      reason: "too-small",
      minPx: 200,
    });
    expect(dropRefusal(layout, drop, { width: 900, height: 600 })).toBeNull();
  });
});

describe("moveLeaf", () => {
  const layout = layoutOf(
    tabOf("t1", row([chat("a", "A"), browser("w", "A"), chat("b", "B")])),
    tabOf("t2", chat("c", "C")),
  );

  it("moves a pane to the other side of a pane of its tab and keeps its id", () => {
    const next = moveLeaf(layout, "w", { kind: "pane", paneId: "b", side: "right" })!;
    expect(shapes(next)).toEqual([{ row: ["a", "b", "w*"] }, "c"]);
    expect(getActiveTab(next).focusedPaneId).toBe("w");
  });

  it("moves a pane to another tab and to a tab of its own", () => {
    const toTab = moveLeaf(layout, "w", { kind: "tab", tabId: "t2" })!;
    expect(shapes(toTab)).toEqual([{ row: ["a", "b"] }, { row: ["c", "w*"] }]);
    expect(toTab.activeTabId).toBe("t2");

    const toNewTab = moveLeaf(layout, "w", { kind: "new-tab" })!;
    expect(shapes(toNewTab)).toEqual([{ row: ["a", "b"] }, "w*", "c"]);
    expect(getActiveTab(toNewTab).focusedPaneId).toBe("w");
  });

  it("moves a pane to a new tab at a place of the tab list", () => {
    const next = moveLeaf(layout, "w", { kind: "new-tab", index: 0 })!;
    expect(shapes(next)).toEqual(["w*", { row: ["a", "b"] }, "c"]);
    expect(next.activeTabId).toBe(next.tabs[0]!.id);
    expect(getActiveTab(next).focusedPaneId).toBe("w");
    expect(shapes(moveLeaf(layout, "w", { kind: "new-tab", index: 2 })!)).toEqual([
      { row: ["a", "b"] },
      "c",
      "w*",
    ]);
  });

  it("moves the tab of a pane that is alone in it to the place, and makes it active", () => {
    const three = layoutOf(
      tabOf("t1", chat("a", "A")),
      tabOf("t2", chat("b", "B")),
      tabOf("t3", browser("w", "A")),
    );
    const first = moveLeaf(three, "w", { kind: "new-tab", index: 0 })!;
    expect(first.tabs.map((tab) => tab.id)).toEqual(["t3", "t1", "t2"]);
    expect(first.activeTabId).toBe("t3");
    const back = moveLeaf(first, "w", { kind: "new-tab", index: 3 })!;
    expect(back.tabs.map((tab) => tab.id)).toEqual(["t1", "t2", "t3"]);
    // The places next to its own tab change nothing.
    expect(moveLeaf(three, "w", { kind: "new-tab", index: 2 })).toBeNull();
    expect(moveLeaf(three, "w", { kind: "new-tab", index: 3 })).toBeNull();
  });

  it("closes the tab that the pane leaves empty", () => {
    const alone = layoutOf(tabOf("t1", chat("a", "A")), tabOf("t2", browser("w", "A")));
    const next = moveLeaf(alone, "w", { kind: "pane", paneId: "a", side: "down" })!;
    expect(shapes(next)).toEqual([{ column: ["a", "w*"] }]);
    expect(next.activeTabId).toBe("t1");
  });

  it("changes nothing for a drop on the pane itself, on its own tab, or alone to a new tab", () => {
    expect(moveLeaf(layout, "w", { kind: "pane", paneId: "w", side: "left" })).toBeNull();
    expect(moveLeaf(layout, "w", { kind: "tab", tabId: "t1" })).toBeNull();
    const alone = layoutOf(tabOf("t1", chat("a", "A")), tabOf("t2", browser("w", "A")));
    expect(moveLeaf(alone, "w", { kind: "new-tab" })).toBeNull();
    expect(moveLeaf(layout, "none", { kind: "new-tab" })).toBeNull();
  });
});

describe("closeBrowserLeaf", () => {
  it("closes the pane and focuses the chat pane of its thread", () => {
    const layout = layoutOf(tabOf("t1", row([chat("b", "B"), chat("a", "A"), browser("w", "A")])));
    const next = closeBrowserLeaf(layout, "w");
    expect(shapes(next)).toEqual([{ row: ["b", "a"] }]);
    expect(getActiveTab(next).focusedPaneId).toBe("a");
  });

  it("shows the chat in the pane itself where the tab has no chat pane of the thread", () => {
    const beside = layoutOf(tabOf("t1", row([chat("b", "B"), browser("w", "A")])));
    expect(shapes(closeBrowserLeaf(beside, "w"))).toEqual([{ row: ["b", "w"] }]);
    const alone = layoutOf(tabOf("t1", browser("w", "A")));
    expect(shapes(closeBrowserLeaf(alone, "w"))).toEqual(["w"]);
  });
});

describe("the panes of a thread", () => {
  const tab = tabOf("t1", row([chat("a", "A"), browser("w", "A"), browser("x", "B")]));

  it("tells the browser pane of a thread from its chat pane", () => {
    expect(findBrowserLeaf(tab, refOf("A"))?.id).toBe("w");
    expect(findChatLeaf(tab, refOf("A"))?.id).toBe("a");
    expect(findChatLeaf(tab, refOf("B"))).toBeNull();
    expect(findBrowserLeaf(tab, refOf("C"))).toBeNull();
  });

  it("splits a wide pane to the right first and a tall pane down first", () => {
    const wide = tabOf("t1", chat("a", "A"));
    expect(preferredSplitSides(wide, "a", { width: 1200, height: 700 })).toEqual(["right", "down"]);
    expect(preferredSplitSides(wide, "a", { width: 500, height: 900 })).toEqual(["down", "right"]);
  });
});

import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import type { ThreadRouteTarget } from "../threadRoutes";
import {
  MAX_PANES_PER_TAB,
  MAX_TAB_NAME_LENGTH,
  MIN_PANE_HEIGHT_PX,
  MIN_PANE_WIDTH_PX,
  appendLeaf,
  closeLeaf,
  createBrowserLeaf,
  createInitialLayout,
  createTabOfLeaf,
  dividerRects,
  equalizeSplit,
  findCollidingLeaf,
  isMultiLayout,
  leafCount,
  leafRects,
  listLeaves,
  moveTab,
  neighborInDirection,
  renameTab,
  resizeSplit,
  sanitizeLayout,
  setLeafTarget,
  showLeafAsChat,
  splitLeaf,
  splitRefusal,
  type PaneAxis,
  type PaneLayout,
  type PaneLeaf,
  type PaneNode,
  type PaneSplit,
  type PaneTab,
  type PaneTarget,
} from "./paneTree";

const server = (threadId: string): ThreadRouteTarget => ({
  kind: "server",
  threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(threadId)),
});
const draft = (draftId: string): ThreadRouteTarget => ({
  kind: "draft",
  draftId: draftId as DraftId,
});
const keyOf = (target: ThreadRouteTarget) =>
  target.kind === "server" ? scopedThreadKey(target.threadRef) : `draft:${target.draftId}`;

const leaf = (id: string, target: PaneTarget = null): PaneLeaf => ({ kind: "leaf", id, target });
const split = (
  id: string,
  axis: PaneAxis,
  children: ReadonlyArray<PaneNode>,
  sizes: ReadonlyArray<number> = children.map(() => 1 / children.length),
): PaneSplit => ({ kind: "split", id, axis, children, sizes });
const tabOf = (root: PaneNode, focusedPaneId = listLeaves(root)[0]!.id): PaneTab => ({
  id: "tab-1",
  root,
  focusedPaneId,
});

/** Leaf ids and split shapes as nested arrays, so a tree reads at a glance. */
function shape(node: PaneNode): unknown {
  return node.kind === "leaf" ? node.id : { [node.axis]: node.children.map(shape) };
}

function asSplit(node: PaneNode): PaneSplit {
  if (node.kind !== "split") throw new Error(`Expected a split, got leaf ${node.id}`);
  return node;
}

function expectSizes(node: PaneNode, expected: ReadonlyArray<number>) {
  const sizes = asSplit(node).sizes;
  expect(sizes).toHaveLength(expected.length);
  expected.forEach((size, index) => expect(sizes[index]).toBeCloseTo(size, 9));
}

describe("splitLeaf", () => {
  it("splits a single leaf right, then the new leaf down", () => {
    const first = splitLeaf(tabOf(leaf("a", server("A"))), "a", "right");
    const added = listLeaves(first.root)[1]!;
    expect(shape(first.root)).toEqual({ row: ["a", added.id] });
    expectSizes(first.root, [0.5, 0.5]);
    expect(added.target).toBeNull();
    expect(first.focusedPaneId).toBe(added.id);

    const second = splitLeaf(first, added.id, "down");
    const below = listLeaves(second.root)[2]!;
    expect(shape(second.root)).toEqual({ row: ["a", { column: [added.id, below.id] }] });
    expectSizes(second.root, [0.5, 0.5]);
    expectSizes(asSplit(second.root).children[1]!, [0.5, 0.5]);
    expect(second.focusedPaneId).toBe(below.id);
  });

  it("inserts a sibling in a same-axis parent and nests under a cross-axis parent", () => {
    const tab = tabOf(split("s", "row", [leaf("a"), leaf("b")], [0.6, 0.4]));

    const sibling = splitLeaf(tab, "a", "right");
    const added = listLeaves(sibling.root)[1]!;
    expect(shape(sibling.root)).toEqual({ row: ["a", added.id, "b"] });
    expect(sibling.root.id).toBe("s");
    expectSizes(sibling.root, [0.3, 0.3, 0.4]);

    const nested = splitLeaf(tab, "a", "down");
    const below = listLeaves(nested.root)[1]!;
    expect(shape(nested.root)).toEqual({ row: [{ column: ["a", below.id] }, "b"] });
    expectSizes(nested.root, [0.6, 0.4]);
    expectSizes(asSplit(nested.root).children[0]!, [0.5, 0.5]);
  });

  it("stops at the pane limit", () => {
    let tab = tabOf(leaf("a"));
    for (let count = 1; count < MAX_PANES_PER_TAB; count += 1) {
      tab = splitLeaf(tab, tab.focusedPaneId, count % 2 === 0 ? "down" : "right");
    }
    expect(leafCount(tab)).toBe(MAX_PANES_PER_TAB);
    expect(splitLeaf(tab, tab.focusedPaneId, "right")).toBe(tab);
    expect(splitRefusal(tab, tab.focusedPaneId, "right", { width: 9000, height: 9000 })).toEqual({
      reason: "max-panes",
    });
  });

  it("refuses a split when a half would be below the minimum size", () => {
    const tab = tabOf(split("s", "row", [leaf("a"), leaf("b")]));
    const width = MIN_PANE_WIDTH_PX * 4;
    const height = MIN_PANE_HEIGHT_PX * 2;
    // The refusal carries both sizes, for the message that the user sees.
    expect(splitRefusal(tab, "a", "right", { width: width - 1, height })).toEqual({
      reason: "too-small",
      halfPx: (width - 1) / 4,
      minPx: MIN_PANE_WIDTH_PX,
    });
    expect(splitRefusal(tab, "a", "right", { width, height })).toBeNull();
    expect(splitRefusal(tab, "a", "down", { width, height: height - 1 })).toEqual({
      reason: "too-small",
      halfPx: (height - 1) / 2,
      minPx: MIN_PANE_HEIGHT_PX,
    });
    expect(splitRefusal(tab, "a", "down", { width, height })).toBeNull();
  });

  it("splits each pane of a 2x2 grid in a laptop window, and holds 12 panes", () => {
    // Measured in a 1470 x 834 window with the sidebar open: a grid of 1212 x 798 px, columns
    // of 555 and 657 px. Minimums of 280 x 240 px refused the halves of 277 px and of 199 px.
    const grid = { width: 1212, height: 798 };
    const tab = tabOf(
      split(
        "s",
        "row",
        [
          split("left", "column", [leaf("a"), leaf("b")]),
          split("right", "column", [leaf("c"), leaf("d")]),
        ],
        [555 / 1212, 657 / 1212],
      ),
    );
    let twelve = tab;
    for (const id of ["a", "b", "c", "d"]) {
      expect(splitRefusal(tab, id, "right", grid)).toBeNull();
      expect(splitRefusal(tab, id, "down", grid)).toBeNull();
      twelve = splitLeaf(twelve, id, "right");
    }
    // 4 columns and 2 rows. Each pane of the right half splits down one more time.
    for (const id of ["c", "d"]) {
      const added = listLeaves(twelve.root)[
        listLeaves(twelve.root).findIndex((l) => l.id === id) + 1
      ]!;
      for (const paneId of [id, added.id]) {
        expect(splitRefusal(twelve, paneId, "down", grid)).toBeNull();
        twelve = splitLeaf(twelve, paneId, "down");
      }
    }
    expect(leafCount(twelve)).toBe(12);
    expect(MAX_PANES_PER_TAB).toBe(12);
    // A half of 138 px is still too narrow.
    expect(splitRefusal(twelve, "a", "right", grid)).toMatchObject({ reason: "max-panes" });
    expect(splitRefusal(splitLeaf(tab, "a", "right"), "a", "right", grid)).toMatchObject({
      reason: "too-small",
      minPx: MIN_PANE_WIDTH_PX,
    });
  });
});

describe("closeLeaf", () => {
  it("collapses a split with one child into that child", () => {
    const tab = tabOf(
      split("s", "row", [leaf("a"), split("c", "column", [leaf("b"), leaf("c")])], [0.7, 0.3]),
      "c",
    );
    const closed = closeLeaf(tab, "c");
    expect(shape(closed.root)).toEqual({ row: ["a", "b"] });
    expectSizes(closed.root, [0.7, 0.3]);
    expect(closed.focusedPaneId).toBe("b");
  });

  it("merges a collapsed child that has its new parent's axis", () => {
    const tab = tabOf(
      split("s", "row", [
        leaf("a"),
        split("c", "column", [leaf("b"), split("r", "row", [leaf("c"), leaf("d")])]),
      ]),
    );
    const closed = closeLeaf(tab, "b");
    expect(shape(closed.root)).toEqual({ row: ["a", "c", "d"] });
    expectSizes(closed.root, [0.5, 0.25, 0.25]);
  });

  it("gives the free share to the other children in proportion", () => {
    const tab = tabOf(split("s", "row", [leaf("a"), leaf("b"), leaf("c")], [0.5, 0.25, 0.25]), "b");
    expectSizes(closeLeaf(tab, "b").root, [2 / 3, 1 / 3]);
    expectSizes(closeLeaf(tab, "a").root, [0.5, 0.5]);
  });

  it("moves focus to the previous leaf in tree order, else the next", () => {
    const root = split("s", "row", [leaf("a"), leaf("b"), leaf("c")]);
    expect(closeLeaf(tabOf(root, "b"), "b").focusedPaneId).toBe("a");
    expect(closeLeaf(tabOf(root, "a"), "a").focusedPaneId).toBe("b");
    expect(closeLeaf(tabOf(root, "c"), "a").focusedPaneId).toBe("c");
  });

  it("never removes the last leaf", () => {
    const tab = tabOf(leaf("a", server("A")));
    expect(closeLeaf(tab, "a")).toBe(tab);
    expect(closeLeaf(tab, "missing")).toBe(tab);
  });
});

describe("leafRects", () => {
  it("covers the unit square with no overlap", () => {
    const root = split(
      "s",
      "row",
      [
        leaf("a"),
        split(
          "c",
          "column",
          [leaf("b"), split("r", "row", [leaf("c"), leaf("d")], [0.35, 0.65]), leaf("e")],
          [0.2, 0.5, 0.3],
        ),
        leaf("f"),
      ],
      [0.3, 0.45, 0.25],
    );
    const rects = leafRects(root);
    expect(rects.map((rect) => rect.leafId)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(rects.reduce((area, rect) => area + rect.width * rect.height, 0)).toBeCloseTo(1, 9);
    for (const rect of rects) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.left + rect.width).toBeLessThanOrEqual(1 + 1e-9);
      expect(rect.top + rect.height).toBeLessThanOrEqual(1 + 1e-9);
      for (const other of rects) {
        if (other === rect) continue;
        const overlapWidth =
          Math.min(rect.left + rect.width, other.left + other.width) -
          Math.max(rect.left, other.left);
        const overlapHeight =
          Math.min(rect.top + rect.height, other.top + other.height) -
          Math.max(rect.top, other.top);
        expect(Math.min(overlapWidth, overlapHeight)).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it("gives a single leaf the whole square and no divider", () => {
    expect(leafRects(leaf("a"))).toEqual([{ leafId: "a", left: 0, top: 0, width: 1, height: 1 }]);
    expect(dividerRects(leaf("a"))).toEqual([]);
  });

  it("places one divider on each boundary of a split", () => {
    const root = split(
      "s",
      "row",
      [leaf("a"), split("c", "column", [leaf("b"), leaf("c")])],
      [0.4, 0.6],
    );
    expect(dividerRects(root)).toEqual([
      { id: "s:0", splitId: "s", index: 0, axis: "row", left: 0.4, top: 0, width: 0, height: 1 },
      {
        id: "c:0",
        splitId: "c",
        index: 0,
        axis: "column",
        left: 0.4,
        top: 0.5,
        width: 0.6,
        height: 0,
      },
    ]);
  });
});

describe("neighborInDirection", () => {
  it("moves between the cells of a 2x2 grid", () => {
    const root = split("s", "row", [
      split("l", "column", [leaf("a"), leaf("b")]),
      split("r", "column", [leaf("c"), leaf("d")]),
    ]);
    expect(neighborInDirection(root, "a", "right")).toBe("c");
    expect(neighborInDirection(root, "a", "down")).toBe("b");
    expect(neighborInDirection(root, "d", "left")).toBe("b");
    expect(neighborInDirection(root, "d", "up")).toBe("c");
    expect(neighborInDirection(root, "a", "left")).toBeNull();
    expect(neighborInDirection(root, "a", "up")).toBeNull();
    expect(neighborInDirection(root, "d", "right")).toBeNull();
    expect(neighborInDirection(root, "d", "down")).toBeNull();
    expect(neighborInDirection(root, "missing", "left")).toBeNull();
  });

  it("selects the leaf that holds the center of the focused edge in an uneven tree", () => {
    const tall = split("s", "row", [
      leaf("a"),
      split("c", "column", [leaf("b"), leaf("c"), leaf("d")], [0.2, 0.5, 0.3]),
    ]);
    expect(neighborInDirection(tall, "a", "right")).toBe("c");
    expect(neighborInDirection(tall, "b", "left")).toBe("a");
    expect(neighborInDirection(tall, "d", "left")).toBe("a");
    expect(neighborInDirection(tall, "c", "down")).toBe("d");

    const wide = split("s", "column", [
      split("r", "row", [leaf("a"), leaf("b")], [0.3, 0.7]),
      leaf("c"),
    ]);
    expect(neighborInDirection(wide, "c", "up")).toBe("b");
    expect(neighborInDirection(wide, "a", "down")).toBe("c");
    expect(neighborInDirection(wide, "a", "right")).toBe("b");
  });

  it("returns to the pane that had focus last, and takes the first pane on an even split", () => {
    const root = split("s", "row", [leaf("a"), split("c", "column", [leaf("b"), leaf("c")])]);
    // The center of pane a is on the boundary between b and c.
    expect(neighborInDirection(root, "a", "right")).toBe("b");
    const focusedAt = (order: Record<string, number>) => (leafId: string) => order[leafId] ?? 0;
    expect(neighborInDirection(root, "a", "right", focusedAt({ b: 1, c: 2 }))).toBe("c");
    expect(neighborInDirection(root, "a", "right", focusedAt({ b: 3, c: 2 }))).toBe("b");
    // A pane on another side does not count.
    expect(neighborInDirection(root, "b", "down", focusedAt({ a: 5 }))).toBe("c");
  });
});

describe("resizeSplit", () => {
  const container = { width: 1000, height: 600 };
  const minWidth = MIN_PANE_WIDTH_PX / container.width;
  const minHeight = MIN_PANE_HEIGHT_PX / container.height;

  it("moves a boundary and stops at the minimum pane size", () => {
    const tab = tabOf(split("s", "row", [leaf("a"), leaf("b")]));
    expectSizes(resizeSplit(tab, "s", 0, 0.55, container).root, [0.55, 0.45]);
    expectSizes(resizeSplit(tab, "s", 0, 0.9, container).root, [1 - minWidth, minWidth]);
    expectSizes(resizeSplit(tab, "s", 0, 0.1, container).root, [minWidth, 1 - minWidth]);
  });

  it("keeps the other children and the leaves of a nested split at their minimum", () => {
    const three = tabOf(split("s", "row", [leaf("a"), leaf("b"), leaf("c")]));
    const wide = { width: 1500, height: 600 };
    const minOfWide = MIN_PANE_WIDTH_PX / wide.width;
    expectSizes(resizeSplit(three, "s", 0, 0.9, wide).root, [2 / 3 - minOfWide, minOfWide, 1 / 3]);

    const nested = tabOf(
      split("s", "column", [leaf("a"), split("r", "row", [leaf("b"), leaf("c")])]),
    );
    const resized = resizeSplit(nested, "r", 0, 0.95, container);
    expectSizes(asSplit(resized.root).children[1]!, [1 - minWidth, minWidth]);
    expectSizes(resizeSplit(nested, "s", 0, 0.05, container).root, [minHeight, 1 - minHeight]);
  });

  it("lets a pane below its minimum grow, and never shrinks it", () => {
    // The window became smaller after the split: 650 px for two panes of 80 and 20 percent.
    const narrow = { width: 650, height: 800 };
    const tab = tabOf(split("s", "row", [leaf("a"), leaf("b")], [0.8, 0.2]));
    expect(resizeSplit(tab, "s", 0, 0.9, narrow)).toBe(tab);
    expectSizes(resizeSplit(tab, "s", 0, 0.6, narrow).root, [0.6, 0.4]);
    // Pane a stops at its own minimum, so pane b cannot take more than the rest.
    const minOfNarrow = MIN_PANE_WIDTH_PX / narrow.width;
    expectSizes(resizeSplit(tab, "s", 0, 0.1, narrow).root, [minOfNarrow, 1 - minOfNarrow]);
  });

  it("changes nothing for an unknown split or boundary", () => {
    const tab = tabOf(split("s", "row", [leaf("a"), leaf("b")]));
    expect(resizeSplit(tab, "missing", 0, 0.7, container)).toBe(tab);
    expect(resizeSplit(tab, "s", 1, 0.7, container)).toBe(tab);
  });
});

describe("equalizeSplit", () => {
  it("gives equal shares when every pane keeps its minimum", () => {
    const tab = tabOf(split("s", "row", [leaf("a"), leaf("b"), leaf("c")], [0.6, 0.2, 0.2]));
    expectSizes(equalizeSplit(tab, "s", { width: 1500, height: 600 }).root, [1 / 3, 1 / 3, 1 / 3]);
  });

  it("keeps the share that the panes of a nested split need", () => {
    // a | (b over (c | d)): the right side needs two minimum widths.
    const tab = tabOf(
      split(
        "s",
        "row",
        [leaf("a"), split("c", "column", [leaf("b"), split("r", "row", [leaf("c"), leaf("d")])])],
        [0.45, 0.55],
      ),
    );
    const container = { width: MIN_PANE_WIDTH_PX * 3.5, height: 900 };
    const rightShare = (MIN_PANE_WIDTH_PX * 2) / container.width;
    expectSizes(equalizeSplit(tab, "s", container).root, [1 - rightShare, rightShare]);
  });

  it("changes nothing when the panes cannot all keep their minimum", () => {
    const tab = tabOf(split("s", "row", [leaf("a"), leaf("b")], [0.7, 0.3]));
    expect(equalizeSplit(tab, "s", { width: MIN_PANE_WIDTH_PX * 2 - 1, height: 600 })).toBe(tab);
  });
});

describe("findCollidingLeaf", () => {
  const root = split("s", "row", [leaf("a", server("A")), leaf("b"), leaf("c", draft("D"))]);

  it("setting off: finds the leaf that shows the thread", () => {
    expect(findCollidingLeaf(root, server("A"), keyOf, false)?.id).toBe("a");
    expect(findCollidingLeaf(root, draft("D"), keyOf, false)?.id).toBe("c");
    expect(findCollidingLeaf(root, server("B"), keyOf, false)).toBeNull();
    expect(findCollidingLeaf(root, server("A"), keyOf, false, "a")).toBeNull();
  });

  it("mirror: a server thread has no owner, and a draft still has one", () => {
    expect(findCollidingLeaf(root, server("A"), keyOf, true)).toBeNull();
    expect(findCollidingLeaf(root, draft("D"), keyOf, true)?.id).toBe("c");
    expect(findCollidingLeaf(root, draft("D"), keyOf, true, "c")).toBeNull();
    // A draft and the thread it became have one key: the leaf that shows either owns it.
    const oneKey = () => "thread";
    expect(findCollidingLeaf(root, server("T"), oneKey, true, "a")?.id).toBe("c");
    expect(findCollidingLeaf(root, draft("E"), oneKey, true)?.id).toBe("a");
  });
});

describe("sanitizeLayout", () => {
  it("gives the initial layout for a value with no valid tab", () => {
    for (const value of [null, "layout", 7, {}, { tabs: "tabs" }, { tabs: [{ id: "t" }] }]) {
      const layout = sanitizeLayout(value, keyOf, true);
      expect(layout.tabs).toHaveLength(1);
      expect(layout.activeTabId).toBe(layout.tabs[0]!.id);
      expect(layout.tabs[0]!.root).toEqual({
        kind: "leaf",
        id: layout.tabs[0]!.focusedPaneId,
        target: null,
      });
      expect(isMultiLayout(layout)).toBe(false);
    }
    expect(isMultiLayout(createInitialLayout())).toBe(false);
  });

  it("keeps a valid layout as stored", () => {
    const stored = {
      tabs: [
        {
          id: "tab-1",
          focusedPaneId: "b",
          root: split("s", "row", [leaf("a", server("A")), leaf("b", draft("D"))], [0.3, 0.7]),
        },
        { id: "tab-2", focusedPaneId: "c", root: leaf("c", server("A")) },
      ],
      activeTabId: "tab-2",
    };
    expect(sanitizeLayout(JSON.parse(JSON.stringify(stored)), keyOf, false)).toEqual(stored);
  });

  it.each([
    ["setting off: the second leaf with the same thread is empty", false, null],
    ["mirror: the second leaf with the same thread stays", true, server("A")],
  ] as const)("drops malformed tabs and nodes. %s", (_name, mirror, secondLeaf) => {
    const layout = sanitizeLayout(
      {
        activeTabId: "gone",
        tabs: [
          { id: "broken", root: { kind: "split", id: "x", axis: "diagonal", children: [] } },
          {
            id: "tab-1",
            focusedPaneId: "gone",
            root: {
              kind: "split",
              id: "s",
              axis: "row",
              sizes: [0.5, 0.5],
              children: [
                leaf("a", server("A")),
                { kind: "leaf" },
                { kind: "split", id: "empty", axis: "column", children: [], sizes: [] },
                leaf("b", server("A")),
                { kind: "leaf", id: "c", target: { kind: "server", threadRef: {} } },
                leaf("a", draft("D")),
              ],
            },
          },
        ],
      },
      keyOf,
      mirror,
    );
    expect(layout.tabs).toHaveLength(1);
    const tab = layout.tabs[0]!;
    expect(layout.activeTabId).toBe("tab-1");
    const leaves = listLeaves(tab.root);
    expect(leaves.map((entry) => entry.target)).toEqual([
      server("A"),
      secondLeaf,
      null,
      draft("D"),
    ]);
    expect(leaves.slice(0, 3).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(new Set(leaves.map((entry) => entry.id)).size).toBe(4);
    expectSizes(tab.root, [0.25, 0.25, 0.25, 0.25]);
    expect(tab.focusedPaneId).toBe("a");
  });

  it.each([true, false])(
    "gives a draft one leaf, in a tab and across tabs (mirror %s)",
    (mirror) => {
      const layout = sanitizeLayout(
        {
          activeTabId: "tab-2",
          tabs: [
            {
              id: "tab-1",
              focusedPaneId: "a",
              root: split("s0", "row", [leaf("a", draft("D")), leaf("a2", draft("D"))]),
            },
            {
              id: "tab-2",
              focusedPaneId: "c",
              root: split("s", "row", [leaf("b", server("A")), leaf("c", draft("D"))]),
            },
            // The same server thread in two tabs is allowed: only one tab is mounted.
            { id: "tab-3", focusedPaneId: "d", root: leaf("d", server("A")) },
          ],
        },
        keyOf,
        mirror,
      );
      expect(layout.tabs.map((tab) => listLeaves(tab.root).map((entry) => entry.target))).toEqual([
        [draft("D"), null],
        [server("A"), null],
        [server("A")],
      ]);
      expect(layout.tabs[1]!.focusedPaneId).toBe("c");
    },
  );

  it("keeps a tab at the pane limit and a split with one valid child as that child", () => {
    const layout = sanitizeLayout(
      {
        activeTabId: "tab-2",
        tabs: [
          {
            id: "tab-1",
            focusedPaneId: `p${MAX_PANES_PER_TAB + 1}`,
            root: split(
              "s",
              "row",
              Array.from({ length: MAX_PANES_PER_TAB + 2 }, (_, index) => leaf(`p${index}`)),
            ),
          },
          {
            id: "tab-2",
            focusedPaneId: "only",
            root: { kind: "split", id: "s2", axis: "column", children: [leaf("only"), 4] },
          },
        ],
      },
      keyOf,
      true,
    );
    const kept = Array.from({ length: MAX_PANES_PER_TAB }, (_, index) => `p${index}`);
    expect(listLeaves(layout.tabs[0]!.root).map((entry) => entry.id)).toEqual(kept);
    expectSizes(
      layout.tabs[0]!.root,
      kept.map(() => 1 / MAX_PANES_PER_TAB),
    );
    expect(layout.tabs[0]!.focusedPaneId).toBe("p0");
    expect(layout.tabs[1]!.root).toEqual(leaf("only"));
    expect(layout.activeTabId).toBe("tab-2");
  });
});

describe("a browser pane", () => {
  const browser = (id: string, threadId: string): PaneLeaf => ({
    ...leaf(id, server(threadId)),
    view: "browser",
  });

  it("owns no thread: the chat of its thread opens beside it, with the mirror setting off", () => {
    const root = split("s", "row", [browser("w", "A"), leaf("b", server("B"))]);
    expect(findCollidingLeaf(root, server("A"), keyOf, false)).toBeNull();
    expect(findCollidingLeaf(root, server("B"), keyOf, false)?.id).toBe("b");
  });

  it("loads from a stored layout beside the chat pane of its thread, and an old layout loads", () => {
    const stored = {
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          focusedPaneId: "w",
          root: split("s", "row", [leaf("a", server("A")), browser("w", "A")]),
        },
      ],
    };
    const layout = sanitizeLayout(JSON.parse(JSON.stringify(stored)), keyOf, false);
    expect(layout).toEqual(stored);
    // A layout of a build without browser panes has no `view` field, and loads as it is.
    const old = { ...stored, tabs: [{ ...stored.tabs[0]!, root: leaf("a", server("A")) }] };
    const loaded = sanitizeLayout(JSON.parse(JSON.stringify(old)), keyOf, false);
    expect(loaded.tabs[0]!.root).toEqual(leaf("a", server("A")));
    expect(loaded.tabs[0]!.focusedPaneId).toBe("a");
  });

  it("is a chat pane or an empty pane when the stored leaf has no server thread", () => {
    const stored = {
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          focusedPaneId: "d",
          root: split("s", "row", [
            { ...leaf("d", draft("D")), view: "browser" },
            { ...leaf("e"), view: "browser" },
            // A value that no build writes.
            Object.assign({}, leaf("f", server("F")), { view: "other" }),
          ]),
        },
      ],
    };
    const layout = sanitizeLayout(stored, keyOf, true);
    expect(listLeaves(layout.tabs[0]!.root)).toEqual([
      leaf("d", draft("D")),
      leaf("e"),
      leaf("f", server("F")),
    ]);
  });

  it("shows the chat again after a new target, and on request", () => {
    const tab = tabOf(split("s", "row", [browser("w", "A"), leaf("b", server("B"))]));
    expect(listLeaves(setLeafTarget(tab, "w", server("C")).root)[0]).toEqual(
      leaf("w", server("C")),
    );
    expect(listLeaves(showLeafAsChat(tab, "w").root)[0]).toEqual(leaf("w", server("A")));
    // A chat pane is the same object after the call, so its view does not render again.
    expect(showLeafAsChat(tab, "b")).toBe(tab);
  });

  it("alone in its tab is not the stock layout, so the tab bar shows", () => {
    const threadRef = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("A"));
    const tab = createTabOfLeaf(createBrowserLeaf(threadRef));
    expect(isMultiLayout({ tabs: [tab], activeTabId: tab.id })).toBe(true);
    expect(isMultiLayout(createInitialLayout(server("A")))).toBe(false);
  });
});

describe("appendLeaf", () => {
  it("adds a column at the right edge with an equal share of the width", () => {
    const tab = tabOf(
      split("s", "row", [leaf("a"), split("c", "column", [leaf("b"), leaf("d")])], [0.6, 0.4]),
    );
    const next = appendLeaf(tab, leaf("n"));
    expect(shape(next.root)).toEqual({ row: ["a", { column: ["b", "d"] }, "n"] });
    expectSizes(next.root, [0.4, 0.4 * (2 / 3), 1 / 3]);
    expect(next.focusedPaneId).toBe("n");

    const single = appendLeaf(tabOf(leaf("a")), leaf("n"));
    expect(shape(single.root)).toEqual({ row: ["a", "n"] });
    expectSizes(single.root, [0.5, 0.5]);
  });
});

describe("moveTab", () => {
  const tab = (id: string): PaneTab => ({
    id,
    root: leaf(`${id}-pane`),
    focusedPaneId: `${id}-pane`,
  });
  const layout: PaneLayout = { tabs: [tab("a"), tab("b"), tab("c")], activeTabId: "b" };
  const order = (next: PaneLayout) => next.tabs.map((candidate) => candidate.id);

  it("moves a tab to its place in the new order and keeps the active tab", () => {
    expect(order(moveTab(layout, "c", 0))).toEqual(["c", "a", "b"]);
    expect(order(moveTab(layout, "a", 2))).toEqual(["b", "c", "a"]);
    expect(order(moveTab(layout, "a", 1))).toEqual(["b", "a", "c"]);
    expect(moveTab(layout, "b", 0)).toEqual({
      tabs: [tab("b"), tab("a"), tab("c")],
      activeTabId: "b",
    });
    expect(moveTab(layout, "c", 0).activeTabId).toBe("b");
  });

  it("clamps the index to the list, and returns the same layout for no move", () => {
    expect(order(moveTab(layout, "a", 99))).toEqual(["b", "c", "a"]);
    expect(order(moveTab(layout, "c", -5))).toEqual(["c", "a", "b"]);
    expect(moveTab(layout, "b", 1)).toBe(layout);
    expect(moveTab(layout, "c", 7)).toBe(layout);
    expect(moveTab(layout, "missing", 0)).toBe(layout);
  });
});

describe("renameTab", () => {
  const tab = (id: string): PaneTab => ({
    id,
    root: leaf(`${id}-pane`),
    focusedPaneId: `${id}-pane`,
  });
  const layout: PaneLayout = { tabs: [tab("a"), tab("b")], activeTabId: "b" };

  it("sets a trimmed name on one tab, cut to the maximum length", () => {
    const named = renameTab(layout, "a", "  Review  ");
    expect(named.tabs[0]).toEqual({ ...tab("a"), name: "Review" });
    expect(named.tabs[1]).toBe(layout.tabs[1]);
    expect(named.activeTabId).toBe("b");
    const long = renameTab(layout, "a", "x".repeat(MAX_TAB_NAME_LENGTH + 5)).tabs[0]!.name;
    expect(long).toBe("x".repeat(MAX_TAB_NAME_LENGTH));
  });

  it("clears the name for an empty or blank name, and changes nothing for the same name", () => {
    const named = renameTab(layout, "a", "Review");
    expect(renameTab(named, "a", "")).toEqual(layout);
    expect(renameTab(named, "a", "   ").tabs[0]).not.toHaveProperty("name");
    expect(renameTab(named, "a", " Review ")).toBe(named);
    expect(renameTab(layout, "a", "")).toBe(layout);
    expect(renameTab(layout, "missing", "Review")).toBe(layout);
  });

  it("keeps the name through a split, a focus move and a load", () => {
    const named = renameTab(layout, "a", "Review").tabs[0]!;
    const split = splitLeaf(named, "a-pane", "right");
    expect(split.name).toBe("Review");
    const stored = JSON.parse(JSON.stringify({ tabs: [split, tab("b")], activeTabId: "b" }));
    expect(sanitizeLayout(stored, keyOf, true).tabs[0]!.name).toBe("Review");
  });

  it("loads a stored layout with no name, and drops a name that is not text", () => {
    const stored = {
      tabs: [
        { id: "a", focusedPaneId: "a-pane", root: leaf("a-pane") },
        { id: "b", focusedPaneId: "b-pane", root: leaf("b-pane"), name: 7 },
        { id: "c", focusedPaneId: "c-pane", root: leaf("c-pane"), name: `  ${"y".repeat(50)}` },
      ],
      activeTabId: "a",
    };
    const loaded = sanitizeLayout(JSON.parse(JSON.stringify(stored)), keyOf, true);
    expect(loaded.tabs[0]).not.toHaveProperty("name");
    expect(loaded.tabs[1]).not.toHaveProperty("name");
    expect(loaded.tabs[2]!.name).toBe("y".repeat(MAX_TAB_NAME_LENGTH));
  });
});

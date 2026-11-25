import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "../composerDraftStore";
import type { ThreadRouteTarget } from "../threadRoutes";
import { moveChatLeaf } from "./paneChatMove";
import {
  getActiveTab,
  listLeaves,
  type PaneLayout,
  type PaneLeaf,
  type PaneNode,
  type PaneTab,
} from "./paneTree";

const chat = (id: string, threadId: string): PaneLeaf => ({
  kind: "leaf",
  id,
  target: {
    kind: "server",
    threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(threadId)),
  },
});
const draft = (id: string, draftId: string): PaneLeaf => ({
  kind: "leaf",
  id,
  target: { kind: "draft", draftId: DraftId.make(draftId) },
});
const browser = (id: string, threadId: string): PaneLeaf => ({
  ...chat(id, threadId),
  view: "browser",
});
const row = (children: ReadonlyArray<PaneNode>): PaneNode => ({
  kind: "split",
  id: "s",
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
const keyOf = (target: ThreadRouteTarget) =>
  target.kind === "server" ? scopedThreadKey(target.threadRef) : `draft:${target.draftId}`;

/** Leaf ids and split axes as nested arrays. */
function shape(node: PaneNode): unknown {
  return node.kind === "leaf" ? node.id : { [node.axis]: node.children.map(shape) };
}
const shapes = (layout: PaneLayout) => layout.tabs.map((tab) => shape(tab.root));

describe("moveChatLeaf", () => {
  const layout = layoutOf(
    tabOf("t1", row([chat("a", "A"), draft("d", "D"), chat("b", "B")])),
    tabOf("t2", chat("c", "C")),
  );

  it.each([
    ["left", [{ row: ["d", "a", "b"] }, "c"]],
    ["right", [{ row: ["d", "b", "a"] }, "c"]],
    ["up", [{ row: ["d", { column: ["a", "b"] }] }, "c"]],
    ["down", [{ row: ["d", { column: ["b", "a"] }] }, "c"]],
  ] as const)("moves a chat pane to the %s side of a pane of its tab", (side, expected) => {
    const next = moveChatLeaf(layout, "a", { kind: "pane", paneId: "b", side }, keyOf, true)!;
    expect(shapes(next)).toEqual(expected);
    expect(getActiveTab(next).focusedPaneId).toBe("a");
  });

  it("keeps the leaf of a thread and of a draft through a move to a tab and to a new tab", () => {
    const toTab = moveChatLeaf(layout, "d", { kind: "tab", tabId: "t2" }, keyOf, true)!;
    expect(shapes(toTab)).toEqual([{ row: ["a", "b"] }, { row: ["c", "d"] }]);
    expect(toTab.activeTabId).toBe("t2");
    expect(listLeaves(getActiveTab(toTab).root)[1]).toBe(listLeaves(layout.tabs[0]!.root)[1]);

    const toNewTab = moveChatLeaf(layout, "a", { kind: "new-tab" }, keyOf, true)!;
    expect(shapes(toNewTab)).toEqual([{ row: ["d", "b"] }, "a", "c"]);
    expect(getActiveTab(toNewTab).root).toBe(listLeaves(layout.tabs[0]!.root)[0]);
  });

  it("moves a chat pane to a new tab at a place, and a pane alone in its tab with its tab", () => {
    const toFirst = moveChatLeaf(layout, "d", { kind: "new-tab", index: 0 }, keyOf, false)!;
    expect(shapes(toFirst)).toEqual(["d", { row: ["a", "b"] }, "c"]);
    expect(toFirst.activeTabId).toBe(toFirst.tabs[0]!.id);
    const alone = moveChatLeaf(layout, "c", { kind: "new-tab", index: 0 }, keyOf, false)!;
    expect(shapes(alone)).toEqual(["c", { row: ["a", "d", "b"] }]);
    expect(alone.activeTabId).toBe("t2");
  });

  it("closes the tab that its only pane leaves", () => {
    const next = moveChatLeaf(layout, "c", { kind: "tab", tabId: "t1" }, keyOf, true)!;
    expect(shapes(next)).toEqual([{ row: ["a", "d", "b", "c"] }]);
    expect(getActiveTab(next).focusedPaneId).toBe("c");
  });

  it("changes nothing for a drop on the pane itself, on its own tab, or alone to a new tab", () => {
    const self = { kind: "pane", paneId: "a", side: "left" } as const;
    expect(moveChatLeaf(layout, "a", self, keyOf, true)).toBeNull();
    expect(moveChatLeaf(layout, "a", { kind: "tab", tabId: "t1" }, keyOf, true)).toBeNull();
    expect(moveChatLeaf(layout, "c", { kind: "new-tab" }, keyOf, true)).toBeNull();
  });

  describe("a tab that already shows the thread", () => {
    const twice = layoutOf(
      tabOf("t1", row([chat("a", "A"), chat("b", "B")])),
      tabOf("t2", row([chat("c", "C"), chat("a2", "A")])),
    );
    const toSecondTab = { kind: "tab", tabId: "t2" } as const;

    it("takes a second pane of the thread with mirror panes on", () => {
      const next = moveChatLeaf(twice, "a", toSecondTab, keyOf, true)!;
      expect(shapes(next)).toEqual(["b", { row: ["c", "a2", "a"] }]);
    });

    it("closes the moved pane and shows the pane that owns the thread with mirror panes off", () => {
      const next = moveChatLeaf(twice, "a", toSecondTab, keyOf, false)!;
      expect(shapes(next)).toEqual(["b", { row: ["c", "a2"] }]);
      expect(next.activeTabId).toBe("t2");
      expect(getActiveTab(next).focusedPaneId).toBe("a2");
    });

    it("never gives one tab two panes of one draft", () => {
      const drafts = layoutOf(
        tabOf("t1", row([draft("d", "D"), chat("b", "B")])),
        tabOf("t2", row([chat("c", "C"), draft("d2", "D")])),
      );
      const next = moveChatLeaf(drafts, "d", toSecondTab, keyOf, true)!;
      expect(shapes(next)).toEqual(["b", { row: ["c", "d2"] }]);
      expect(getActiveTab(next).focusedPaneId).toBe("d2");
    });

    it("closes the tab of a pane that was alone, and ignores a browser pane of the thread", () => {
      const alone = layoutOf(tabOf("t1", chat("a", "A")), tabOf("t2", chat("a2", "A")));
      expect(shapes(moveChatLeaf(alone, "a", toSecondTab, keyOf, false)!)).toEqual(["a2"]);
      const beside = layoutOf(tabOf("t1", chat("a", "A")), tabOf("t2", browser("w", "A")));
      expect(shapes(moveChatLeaf(beside, "a", toSecondTab, keyOf, false)!)).toEqual([
        { row: ["w", "a"] },
      ]);
    });
  });
});

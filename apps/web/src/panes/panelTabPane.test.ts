import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { RightPanelSurface } from "../rightPanelStore";
import type { ThreadRouteTarget } from "../threadRoutes";
import { panelTabPaneOf, placeChatPane } from "./panelTabPane";
import {
  listLeaves,
  MAX_PANES_PER_TAB,
  type PaneLayout,
  type PaneLeaf,
  type PaneNode,
  type PaneTab,
} from "./paneTree";

const targetOf = (threadId: string) =>
  ({
    kind: "server",
    threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(threadId)),
  }) as const;
const chat = (id: string, threadId: string): PaneLeaf => ({
  kind: "leaf",
  id,
  target: targetOf(threadId),
});
const tabOf = (id: string, root: PaneNode): PaneTab => ({
  id,
  root,
  focusedPaneId: listLeaves(root)[0]!.id,
});
const keyOf = (target: ThreadRouteTarget) =>
  target.kind === "server" ? scopedThreadKey(target.threadRef) : `draft:${target.draftId}`;
const threadsOf = (node: PaneNode): unknown =>
  node.kind === "leaf"
    ? node.target?.kind === "server"
      ? node.target.threadRef.threadId
      : null
    : { [node.axis]: node.children.map(threadsOf) };

describe("panelTabPaneOf", () => {
  it("drags a browser tab and a side chat out, and no other tab", () => {
    const surfaces: ReadonlyArray<readonly [RightPanelSurface, unknown]> = [
      [
        { id: "browser:tab-1", kind: "preview", resourceId: "tab-1" },
        { kind: "browser", tabId: "tab-1" },
      ],
      [{ id: "browser:new", kind: "preview", resourceId: null }, null],
      [
        { id: "side-chat:S", kind: "side-chat", threadId: ThreadId.make("S") },
        { kind: "chat", threadId: "S" },
      ],
      [{ id: "diff", kind: "diff" }, null],
      [{ id: "files", kind: "files" }, null],
      [{ id: "pull-requests", kind: "pull-requests" }, null],
      [{ id: "device", kind: "device" }, null],
    ];
    for (const [surface, pane] of surfaces) expect(panelTabPaneOf(surface)).toEqual(pane);
  });
});

describe("placeChatPane", () => {
  const WIDE = { width: 4000, height: 2000 };
  /** The placement of a drop that adds or shows a pane. */
  const shown = (placed: ReturnType<typeof placeChatPane>) => {
    if (placed === null || "refusal" in placed) throw new Error("No pane placed");
    return placed;
  };
  const layout: PaneLayout = {
    tabs: [
      tabOf("t1", chat("a", "A")),
      tabOf("t2", {
        kind: "split",
        id: "s",
        axis: "row",
        children: [chat("b", "B"), chat("s", "S")],
        sizes: [0.5, 0.5],
      }),
    ],
    activeTabId: "t1",
  };

  it("splits a pane on the side of the drop and gives the new pane focus", () => {
    const placed = shown(
      placeChatPane(
        layout,
        targetOf("S"),
        { kind: "pane", paneId: "a", side: "right" },
        keyOf,
        false,
        WIDE,
      ),
    );
    expect(placed.added).toBe(true);
    const tab = placed.layout.tabs[0]!;
    expect(threadsOf(tab.root)).toEqual({ row: ["A", "S"] });
    expect(listLeaves(tab.root).find((leaf) => leaf.id === tab.focusedPaneId)?.id).not.toBe("a");
    expect(placed.layout.activeTabId).toBe("t1");
  });

  it("opens a new tab after the active tab", () => {
    const placed = shown(
      placeChatPane(layout, targetOf("S"), { kind: "new-tab" }, keyOf, false, WIDE),
    );
    expect(placed.added).toBe(true);
    expect(placed.layout.tabs.map((tab) => threadsOf(tab.root))).toEqual([
      "A",
      "S",
      { row: ["B", "S"] },
    ]);
    expect(placed.layout.activeTabId).toBe(placed.layout.tabs[1]!.id);
  });

  it("opens a new tab at the place of the drop", () => {
    const placed = shown(
      placeChatPane(layout, targetOf("S"), { kind: "new-tab", index: 0 }, keyOf, false, WIDE),
    );
    expect(placed.layout.tabs.map((tab) => threadsOf(tab.root))).toEqual([
      "S",
      "A",
      { row: ["B", "S"] },
    ]);
    expect(placed.layout.activeTabId).toBe(placed.layout.tabs[0]!.id);
  });

  it("focuses the pane of the thread that the tab of the drop has, with mirror panes off", () => {
    const placed = shown(
      placeChatPane(layout, targetOf("S"), { kind: "tab", tabId: "t2" }, keyOf, false, WIDE),
    );
    expect(placed).toEqual({
      layout: {
        tabs: [layout.tabs[0], { ...layout.tabs[1], focusedPaneId: "s" }],
        activeTabId: "t2",
      },
      added: false,
    });
  });

  it("adds a second pane of the thread with mirror panes on", () => {
    const placed = shown(
      placeChatPane(layout, targetOf("S"), { kind: "tab", tabId: "t2" }, keyOf, true, WIDE),
    );
    expect(placed.added).toBe(true);
    expect(threadsOf(placed.layout.tabs[1]!.root)).toEqual({ row: ["B", "S", "S"] });
  });

  it("refuses a drop on a tab or a pane side with no room for one more pane", () => {
    const full: PaneLayout = {
      tabs: [
        tabOf("t1", {
          kind: "split",
          id: "s",
          axis: "row",
          children: Array.from({ length: MAX_PANES_PER_TAB }, (_, index) => chat(`p${index}`, "A")),
          sizes: Array.from({ length: MAX_PANES_PER_TAB }, () => 1 / MAX_PANES_PER_TAB),
        }),
      ],
      activeTabId: "t1",
    };
    const refusal = { refusal: { reason: "max-panes" } };
    expect(
      placeChatPane(full, targetOf("S"), { kind: "tab", tabId: "t1" }, keyOf, false, WIDE),
    ).toEqual(refusal);
    const side = { kind: "pane", paneId: "p0", side: "left" } as const;
    expect(placeChatPane(full, targetOf("S"), side, keyOf, false, WIDE)).toEqual(refusal);
  });

  it("gives null for a pane or a tab that is gone", () => {
    const gone = { kind: "pane", paneId: "x", side: "left" } as const;
    expect(placeChatPane(layout, targetOf("S"), gone, keyOf, false, WIDE)).toBeNull();
    expect(
      placeChatPane(layout, targetOf("S"), { kind: "tab", tabId: "x" }, keyOf, true, WIDE),
    ).toBeNull();
  });
});

import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "../composerDraftStore";
import type { ThreadRouteTarget } from "../threadRoutes";
import {
  followRoute,
  literalKey,
  locationForTarget,
  threadKey,
  type PaneDraftResolver,
  type PaneRouteState,
} from "./paneRouteSync";
import {
  getActiveTab,
  listLeaves,
  type PaneLayout,
  type PaneNode,
  type PaneTarget,
} from "./paneTree";

const ENVIRONMENT_ID = "env-1" as EnvironmentId;
const refOf = (threadId: string) => scopeThreadRef(ENVIRONMENT_ID, ThreadId.make(threadId));
const server = (threadId: string): ThreadRouteTarget => ({
  kind: "server",
  threadRef: refOf(threadId),
});
const draft = (draftId: string): ThreadRouteTarget => ({
  kind: "draft",
  draftId: DraftId.make(draftId),
});

interface FakeDrafts {
  /** Draft id to the thread id of its session. */
  readonly sessions?: Record<string, string>;
  /** Draft id to the thread it was promoted to, on a live session. */
  readonly promoted?: Record<string, string>;
  /** Draft id to the thread it was promoted to, after the session is gone. */
  readonly redirects?: Record<string, string>;
  readonly withContent?: ReadonlyArray<string>;
}

function resolverOf(drafts: FakeDrafts = {}): PaneDraftResolver {
  return {
    getDraftSession: (draftId) => {
      const promotedTo = drafts.promoted?.[draftId];
      const threadId = drafts.sessions?.[draftId] ?? promotedTo;
      return threadId === undefined
        ? null
        : {
            environmentId: ENVIRONMENT_ID,
            threadId: ThreadId.make(threadId),
            promotedTo: promotedTo === undefined ? null : refOf(promotedTo),
          };
    },
    getPromotedDraftRedirect: (draftId): ScopedThreadRef | null => {
      const threadId = drafts.redirects?.[draftId];
      return threadId === undefined ? null : refOf(threadId);
    },
    draftHasUserContent: (draftId) => drafts.withContent?.includes(draftId) ?? false,
  };
}

/** One tab. Panes are a row of leaves with ids `p0`, `p1`, ... in the order given. */
function layoutOf(targets: ReadonlyArray<PaneTarget>, focusedIndex = 0): PaneLayout {
  const leaves = targets.map((target, index) => ({
    kind: "leaf" as const,
    id: `p${index}`,
    target,
  }));
  const root: PaneNode =
    leaves.length === 1
      ? leaves[0]!
      : {
          kind: "split",
          id: "s",
          axis: "row",
          children: leaves,
          sizes: leaves.map(() => 1 / leaves.length),
        };
  return { tabs: [{ id: "tab-1", root, focusedPaneId: `p${focusedIndex}` }], activeTabId: "tab-1" };
}

function stateOf(
  targets: ReadonlyArray<PaneTarget>,
  focusedIndex: number,
  rest: Partial<Omit<PaneRouteState, "layout">> = {},
): PaneRouteState {
  return {
    layout: layoutOf(targets, focusedIndex),
    lastRouteKey: "server:stale",
    ...rest,
  };
}

function view(state: PaneRouteState) {
  const tab = getActiveTab(state.layout);
  return {
    targets: listLeaves(tab.root).map((leaf) => leaf.target),
    focused: tab.focusedPaneId,
    lastRouteKey: state.lastRouteKey,
  };
}

describe("literalKey and threadKey", () => {
  it("gives a draft and its promoted thread two literal keys and one thread key", () => {
    const promoted = resolverOf({ promoted: { "draft-1": "T" } });
    expect(literalKey(server("T"))).toBe(`server:${scopedThreadKey(refOf("T"))}`);
    expect(literalKey(draft("draft-1"))).toBe("draft:draft-1");
    expect(threadKey(draft("draft-1"), promoted)).toBe(threadKey(server("T"), promoted));
  });

  it("resolves a draft by its session, then its redirect, then its own id", () => {
    const resolver = resolverOf({
      sessions: { "draft-1": "S" },
      redirects: { "draft-1": "ignored", "draft-2": "R" },
    });
    expect(threadKey(draft("draft-1"), resolver)).toBe(scopedThreadKey(refOf("S")));
    expect(threadKey(draft("draft-2"), resolver)).toBe(scopedThreadKey(refOf("R")));
    expect(threadKey(draft("draft-3"), resolver)).toBe("draft:draft-3");
  });

  it("builds the router location of a target", () => {
    expect(locationForTarget(server("T"))).toEqual({
      to: "/$environmentId/$threadId",
      params: { environmentId: ENVIRONMENT_ID, threadId: "T" },
    });
    expect(locationForTarget(draft("draft-1"))).toEqual({
      to: "/draft/$draftId",
      params: { draftId: "draft-1" },
    });
  });
});

describe("followRoute", () => {
  it("rule 0: a restored layout wins over the empty launch draft", () => {
    const state = stateOf([server("A"), server("B")], 1, { lastRouteKey: null });
    const result = followRoute(state, draft("launch"), resolverOf(), true);
    expect(result.navigateTo).toEqual(server("B"));
    expect(result.state.layout).toBe(state.layout);
    expect(result.state.lastRouteKey).toBe("draft:launch");

    // The route is still the launch draft while the replace navigation runs.
    expect(followRoute(result.state, draft("launch"), resolverOf(), true)).toEqual({
      state: result.state,
      navigateTo: null,
    });
    const settled = followRoute(result.state, server("B"), resolverOf(), true);
    expect(settled.navigateTo).toBeNull();
    expect(settled.state.layout).toBe(state.layout);
    expect(settled.state.lastRouteKey).toBe(literalKey(server("B")));
  });

  it("rule 0 does not apply to a single pane, a draft with content, an empty focused pane or a thread route", () => {
    const launch = draft("launch");
    const single = followRoute(
      stateOf([server("A")], 0, { lastRouteKey: null }),
      launch,
      resolverOf(),
      true,
    );
    expect(single.navigateTo).toBeNull();
    expect(view(single.state).targets).toEqual([launch]);

    const withContent = followRoute(
      stateOf([server("A"), server("B")], 0, { lastRouteKey: null }),
      launch,
      resolverOf({ withContent: ["launch"] }),
      true,
    );
    expect(withContent.navigateTo).toBeNull();
    expect(view(withContent.state).targets).toEqual([launch, server("B")]);

    const emptyFocused = followRoute(
      stateOf([server("A"), null], 1, { lastRouteKey: null }),
      launch,
      resolverOf(),
      true,
    );
    expect(emptyFocused.navigateTo).toBeNull();
    expect(view(emptyFocused.state).targets).toEqual([server("A"), launch]);

    const threadRoute = followRoute(
      stateOf([server("A"), server("B")], 0, { lastRouteKey: null }),
      server("B"),
      resolverOf(),
      true,
    );
    expect(threadRoute.navigateTo).toBeNull();
    expect(view(threadRoute.state)).toMatchObject({
      targets: [server("A"), server("B")],
      focused: "p1",
    });
  });

  it("rule 0 keeps a later route change in the normal rules", () => {
    const state = stateOf([server("A"), server("B")], 0, { lastRouteKey: "draft:launch" });
    const result = followRoute(state, draft("next"), resolverOf(), true);
    expect(result.navigateTo).toBeNull();
    expect(view(result.state).targets).toEqual([draft("next"), server("B")]);
  });

  it("rule 2: a draft promotion keeps the pane and replaces its target", () => {
    const state = stateOf([server("A"), draft("draft-1")], 1);
    const before = getActiveTab(state.layout);
    const route = server("T");
    const result = followRoute(state, route, resolverOf({ promoted: { "draft-1": "T" } }), true);
    const after = getActiveTab(result.state.layout);
    expect(result.navigateTo).toBeNull();
    expect(listLeaves(after.root).map((leaf) => leaf.id)).toEqual(["p0", "p1"]);
    expect(listLeaves(after.root)[1]!.target).toBe(route);
    expect(listLeaves(after.root)[0]).toBe(listLeaves(before.root)[0]);
    expect(after.focusedPaneId).toBe("p1");
    expect(result.state.lastRouteKey).toBe(literalKey(route));
  });

  it("rule 2: the same URL keeps the layout object", () => {
    const state = stateOf([server("A"), server("B")], 0);
    const result = followRoute(state, server("A"), resolverOf(), true);
    expect(result.state.layout).toBe(state.layout);
    expect(result.state.lastRouteKey).toBe(literalKey(server("A")));
  });

  it("rule 3, setting off: another pane of the tab shows the thread, so that pane takes focus", () => {
    const state = stateOf([server("A"), server("B"), null], 0);
    const result = followRoute(state, server("B"), resolverOf(), false);
    expect(view(result.state)).toEqual({
      targets: [server("A"), server("B"), null],
      focused: "p1",
      lastRouteKey: literalKey(server("B")),
    });
  });

  it("mirror: a server thread that another pane shows opens in the focused pane too", () => {
    const state = stateOf([server("A"), server("B"), null], 0);
    const before = listLeaves(getActiveTab(state.layout).root);
    const result = followRoute(state, server("B"), resolverOf(), true);
    expect(view(result.state)).toEqual({
      targets: [server("B"), server("B"), null],
      focused: "p0",
      lastRouteKey: literalKey(server("B")),
    });
    // The pane that showed the thread first keeps its leaf object, so it does not render again.
    expect(listLeaves(getActiveTab(result.state.layout).root)[1]).toBe(before[1]);

    // An empty focused pane takes the thread as well.
    const fromEmpty = followRoute(stateOf([server("B"), null], 1), server("B"), resolverOf(), true);
    expect(view(fromEmpty.state)).toMatchObject({
      targets: [server("B"), server("B")],
      focused: "p1",
    });

    // The launch URL of a session names a thread of a restored layout: that pane takes focus.
    const launch = followRoute(
      stateOf([server("A"), server("B")], 0, { lastRouteKey: null }),
      server("B"),
      resolverOf(),
      true,
    );
    expect(view(launch.state)).toMatchObject({
      targets: [server("A"), server("B")],
      focused: "p1",
    });

    // A route away from a mirror changes the focused pane only.
    const away = followRoute(result.state, server("C"), resolverOf(), true);
    expect(view(away.state)).toMatchObject({
      targets: [server("C"), server("B"), null],
      focused: "p0",
    });
  });

  it.each([true, false])(
    "a draft has one pane (mirror %s): the pane that shows it takes focus",
    (mirror) => {
      const drafts = resolverOf({ sessions: { "draft-1": "S" }, promoted: { "draft-2": "T" } });
      const shown = followRoute(
        stateOf([server("A"), draft("draft-1")], 0),
        draft("draft-1"),
        drafts,
        mirror,
      );
      expect(view(shown.state)).toMatchObject({
        targets: [server("A"), draft("draft-1")],
        focused: "p1",
      });

      // The thread of a draft that another pane still shows as a draft: that pane takes it.
      const promoted = followRoute(
        stateOf([server("A"), draft("draft-2")], 0),
        server("T"),
        drafts,
        mirror,
      );
      expect(view(promoted.state)).toMatchObject({
        targets: [server("A"), server("T")],
        focused: "p1",
      });
    },
  );

  it.each([true, false])(
    "the focused pane keeps a thread that it and another pane show (mirror %s)",
    (mirror) => {
      const state = stateOf([server("A"), server("A"), server("B")], 1);
      const result = followRoute(state, server("A"), resolverOf(), mirror);
      expect(result.state.layout).toBe(state.layout);
      expect(view(result.state).focused).toBe("p1");
    },
  );

  it("rule 4: no pane of the tab shows the thread, so the focused pane takes it", () => {
    const state = stateOf([server("A"), null], 1);
    const result = followRoute(state, server("C"), resolverOf(), true);
    expect(view(result.state)).toMatchObject({
      targets: [server("A"), server("C")],
      focused: "p1",
    });

    const otherTab: PaneLayout = {
      tabs: [
        ...layoutOf([server("A")]).tabs,
        { id: "tab-2", root: { kind: "leaf", id: "q0", target: server("C") }, focusedPaneId: "q0" },
      ],
      activeTabId: "tab-1",
    };
    const acrossTabs = followRoute(
      { layout: otherTab, lastRouteKey: "server:stale" },
      server("C"),
      resolverOf(),
      true,
    );
    expect(view(acrossTabs.state)).toMatchObject({ targets: [server("C")], focused: "p0" });
    expect(acrossTabs.state.layout.tabs[1]).toBe(otherTab.tabs[1]);
  });

  it("ignores a stale route: focus changed and the route key equals the last route key", () => {
    const state = stateOf([server("A"), server("B")], 1, {
      lastRouteKey: literalKey(server("A")),
    });
    const result = followRoute(state, server("A"), resolverOf(), true);
    expect(result.state).toBe(state);
    expect(result.navigateTo).toBeNull();
  });

  describe("rule 5: a focused browser pane", () => {
    /** `p1` shows the browser of thread A. */
    const withBrowser = (targets: ReadonlyArray<PaneTarget>, focusedIndex: number) => {
      const state = stateOf(targets, focusedIndex);
      const tab = getActiveTab(state.layout);
      const root =
        tab.root.kind === "split"
          ? {
              ...tab.root,
              children: tab.root.children.map((child) =>
                child.kind === "leaf" && child.id === "p1"
                  ? { ...child, view: "browser" as const }
                  : child,
              ),
            }
          : tab.root;
      return { ...state, layout: { ...state.layout, tabs: [{ ...tab, root }] } };
    };
    const views = (state: PaneRouteState) =>
      listLeaves(getActiveTab(state.layout).root).map((leaf) => leaf.view ?? "chat");

    it("keeps its page for the route of its own thread", () => {
      const state = withBrowser([server("B"), server("A")], 1);
      const result = followRoute(state, server("A"), resolverOf(), true);
      expect(result.state.layout).toBe(state.layout);
      expect(result.state.lastRouteKey).toBe(literalKey(server("A")));
    });

    it("opens another thread in the chat pane that had focus last", () => {
      const state = withBrowser([server("B"), server("A"), server("C")], 1);
      const lastFocusedAt = (leafId: string) => (leafId === "p2" ? 2 : 1);
      const result = followRoute(state, server("D"), resolverOf(), true, lastFocusedAt);
      expect(view(result.state)).toMatchObject({
        targets: [server("B"), server("A"), server("D")],
        focused: "p2",
      });
      expect(views(result.state)).toEqual(["chat", "browser", "chat"]);
      // With no focus history, the first chat pane takes the thread.
      const first = followRoute(state, server("D"), resolverOf(), true);
      expect(view(first.state)).toMatchObject({ focused: "p0" });
    });

    it("gives focus to the chat pane that owns the thread, with the mirror setting off", () => {
      const state = withBrowser([server("B"), server("A"), server("C")], 1);
      const result = followRoute(state, server("C"), resolverOf(), false);
      expect(view(result.state)).toMatchObject({
        targets: [server("B"), server("A"), server("C")],
        focused: "p2",
      });
    });

    it("shows the thread as a chat itself where its tab has no chat pane", () => {
      const state = withBrowser([null, server("A")], 1);
      // The empty pane is a chat pane: it takes the route.
      expect(view(followRoute(state, server("D"), resolverOf(), true).state)).toMatchObject({
        targets: [server("D"), server("A")],
        focused: "p0",
      });
      const tab = getActiveTab(state.layout);
      const alone = {
        ...state,
        layout: {
          ...state.layout,
          tabs: [{ ...tab, root: listLeaves(tab.root)[1]!, focusedPaneId: "p1" }],
        },
      };
      const result = followRoute(alone, server("D"), resolverOf(), true);
      expect(view(result.state)).toMatchObject({ targets: [server("D")], focused: "p1" });
      expect(views(result.state)).toEqual(["chat"]);
    });
  });

  it("opens the chat of a thread beside its browser pane, with the mirror setting off", () => {
    const state = stateOf([server("B"), server("A")], 0);
    const tab = getActiveTab(state.layout);
    const root = tab.root.kind === "split" ? tab.root : null;
    const withBrowser = {
      ...state,
      layout: {
        ...state.layout,
        tabs: [
          {
            ...tab,
            root: {
              ...root!,
              children: root!.children.map((child) =>
                child.kind === "leaf" && child.id === "p1"
                  ? { ...child, view: "browser" as const }
                  : child,
              ),
            },
          },
        ],
      },
    };
    // The browser pane of thread A does not own it: the focused chat pane takes the route.
    const result = followRoute(withBrowser, server("A"), resolverOf(), false);
    expect(view(result.state)).toMatchObject({
      targets: [server("A"), server("A")],
      focused: "p0",
    });
  });
});

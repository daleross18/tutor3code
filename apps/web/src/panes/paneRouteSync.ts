import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import {
  composerDraftHasUserContent,
  useComposerDraftStore,
  type DraftId,
  type DraftSessionState,
} from "../composerDraftStore";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  type ThreadRouteTarget,
} from "../threadRoutes";
import {
  findCollidingLeaf,
  findLeaf,
  focusLeaf,
  getActiveTab,
  isBrowserLeaf,
  isMultiLayout,
  listLeaves,
  replaceTab,
  setLeafTarget,
  type PaneLayout,
  type PaneLeaf,
  type PaneTab,
} from "./paneTree";

/** What route sync reads from the draft store. It is a parameter so tests need no store. */
export interface PaneDraftResolver {
  getDraftSession: (
    draftId: DraftId,
  ) => Pick<DraftSessionState, "environmentId" | "threadId" | "promotedTo"> | null;
  getPromotedDraftRedirect: (draftId: DraftId) => ScopedThreadRef | null;
  draftHasUserContent: (draftId: DraftId) => boolean;
}

export interface PaneRouteState {
  readonly layout: PaneLayout;
  /** `literalKey` of the last route that `followRoute` placed. Null until the first route. */
  readonly lastRouteKey: string | null;
}

export interface PaneRouteSync {
  /** The input object itself when the route changes nothing. */
  readonly state: PaneRouteState;
  /** A target to open with a replace navigation, when the layout wins over the route. */
  readonly navigateTo: ThreadRouteTarget | null;
}

/** Identifies the URL of a target. A draft and its promoted thread have different literal keys. */
export function literalKey(target: ThreadRouteTarget): string {
  return target.kind === "server"
    ? `server:${scopedThreadKey(target.threadRef)}`
    : `draft:${target.draftId}`;
}

/** Identifies the thread of a target. A draft and its promoted thread have one thread key. */
export function threadKey(target: ThreadRouteTarget, resolver: PaneDraftResolver): string {
  if (target.kind === "server") return scopedThreadKey(target.threadRef);
  const session = resolver.getDraftSession(target.draftId);
  const threadRef =
    session?.promotedTo ??
    (session === null
      ? resolver.getPromotedDraftRedirect(target.draftId)
      : scopeThreadRef(session.environmentId, session.threadId));
  return threadRef === null ? `draft:${target.draftId}` : scopedThreadKey(threadRef);
}

export function createDraftResolver(): PaneDraftResolver {
  return {
    getDraftSession: (draftId) => useComposerDraftStore.getState().getDraftSession(draftId),
    getPromotedDraftRedirect: (draftId) =>
      useComposerDraftStore.getState().getPromotedDraftRedirect(draftId),
    draftHasUserContent: (draftId) =>
      composerDraftHasUserContent(useComposerDraftStore.getState().getComposerDraft(draftId)),
  };
}

export function locationForTarget(target: ThreadRouteTarget) {
  return target.kind === "server"
    ? ({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(target.threadRef),
      } as const)
    : ({ to: "/draft/$draftId", params: buildDraftThreadRouteParams(target.draftId) } as const);
}

function showRouteInLeaf(tab: PaneTab, leafId: string, route: ThreadRouteTarget): PaneTab {
  const shown = findLeaf(tab.root, leafId)?.target;
  const sameUrl = shown != null && literalKey(shown) === literalKey(route);
  return focusLeaf(sameUrl ? tab : setLeafTarget(tab, leafId, route), leafId);
}

/** The chat pane of the tab that had focus last, else the first one. Null with none. */
function chatLeafFocusedLast(
  tab: PaneTab,
  lastFocusedAt: (leafId: string) => number,
): PaneLeaf | null {
  return listLeaves(tab.root)
    .filter((leaf) => !isBrowserLeaf(leaf))
    .reduce<PaneLeaf | null>(
      (best, leaf) =>
        best === null || lastFocusedAt(leaf.id) > lastFocusedAt(best.id) ? leaf : best,
      null,
    );
}

/**
 * Places a changed route in the active tab. It runs only when the route's literal key differs
 * from `lastRouteKey`, so a stale route during a fork navigation never moves focus back. With
 * `mirror`, a server thread that another pane shows opens in the focused pane too. A focused
 * browser pane keeps its page: the route opens in the chat pane that had focus last.
 */
export function followRoute(
  state: PaneRouteState,
  route: ThreadRouteTarget,
  resolver: PaneDraftResolver,
  mirror: boolean,
  lastFocusedAt: (leafId: string) => number = () => 0,
): PaneRouteSync {
  const routeKey = literalKey(route);
  if (routeKey === state.lastRouteKey) return { state, navigateTo: null };

  const tab = getActiveTab(state.layout);
  const focused = findLeaf(tab.root, tab.focusedPaneId) ?? listLeaves(tab.root)[0]!;

  // Rule 0: a restored layout wins over the empty draft that the app opens at launch.
  if (
    state.lastRouteKey === null &&
    isMultiLayout(state.layout) &&
    focused.target !== null &&
    route.kind === "draft" &&
    !resolver.draftHasUserContent(route.draftId)
  ) {
    return {
      state: { ...state, lastRouteKey: routeKey },
      navigateTo: literalKey(focused.target) === routeKey ? null : focused.target,
    };
  }

  const keyOf = (target: ThreadRouteTarget) => threadKey(target, resolver);
  const focusedShowsRoute = focused.target !== null && keyOf(focused.target) === keyOf(route);
  // The first route of a session is the launch URL, which must not rewrite a restored layout.
  const mirrors = mirror && state.lastRouteKey !== null;
  // Rule 2: the focused leaf already shows the thread and takes the route's target object.
  // Rule 3: another leaf owns the thread (each thread without a mirror, else a draft only) and
  // takes focus. Rule 4: the focused leaf takes the route, beside a leaf that mirrors it.
  const owner = focusedShowsRoute ? focused : findCollidingLeaf(tab.root, route, keyOf, mirrors);
  const browserFocused = isBrowserLeaf(focused);
  // Rule 5: a focused browser pane shows the route of its own thread as it is. Another thread
  // opens in a chat pane, and in the browser pane itself only when the tab has no chat pane.
  const taker = owner ?? (browserFocused ? chatLeafFocusedLast(tab, lastFocusedAt) : null);
  const nextTab =
    browserFocused && focusedShowsRoute ? tab : showRouteInLeaf(tab, (taker ?? focused).id, route);

  return {
    state: {
      layout: replaceTab(state.layout, nextTab),
      lastRouteKey: routeKey,
    },
    navigateTo: null,
  };
}

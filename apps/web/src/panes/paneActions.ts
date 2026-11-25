import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";

import { toastManager } from "../components/ui/toast";
import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import {
  createNewThreadHandler,
  type NewThreadHandler,
  readLastUsedProjectKey,
  resolveDefaultProjectRef,
} from "../hooks/useHandleNewThread";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readProject, readProjects, readThreadShell } from "../state/entities";
import { defaultProjectFallbackReadyAtom } from "../state/projects";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  resolveThreadRouteTarget,
} from "../threadRoutes";
import { useUiStateStore } from "../uiStateStore";
import { syncPaneDrafts } from "./paneDrafts";
import { focusInputOfFocusedPane } from "./paneFocusInput";
import { jumpToMessageInFocusedPane } from "./paneMessageJump";
import { toggleMusicPopup } from "./musicStore";
import { paneLastFocusedAt, requestPaneFocusRestore } from "./paneFocusMemory";
import type { PaneCommand } from "./paneKeybindings";
import { literalKey, locationForTarget } from "./paneRouteSync";
import { scrollFocusedPaneToEnd } from "./paneScrollToEnd";
import { stopFocusedTurn } from "./paneStopTurn";
import { usePaneStore } from "./paneStore";
import {
  findLeaf,
  findTabOfLeaf,
  getActiveTab,
  isMultiLayout,
  listLeaves,
  MAX_PANES_PER_TAB,
  neighborInDirection,
  splitRefusal,
  type PaneContainerSize,
  type PaneDirection,
  type PaneLeaf,
  type PaneSplitDirection,
  type PaneTarget,
} from "./paneTree";

const TAB_JUMP_COMMAND_PREFIX = "layout.tab.jump.";
// The ninth tab key selects the last tab, as in a terminal or a browser.
const LAST_TAB_POSITION = 9;

function readRouteTarget(router: AnyRouter) {
  return resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
}

function readFocusedPane() {
  const tab = getActiveTab(usePaneStore.getState().layout);
  return { tab, pane: findLeaf(tab.root, tab.focusedPaneId) };
}

/**
 * Runs after the store changed the focused pane, so the route that follows finds its pane
 * already focused. An empty pane leaves the URL as it is.
 */
function openFocusedPaneRoute(router: AnyRouter): void {
  const { pane } = readFocusedPane();
  if (pane === null) return;
  const route = readRouteTarget(router);
  if (pane.target === null) {
    // One tab with one pane always shows the URL's thread, as stock does.
    const store = usePaneStore.getState();
    if (route !== null && !isMultiLayout(store.layout)) store.setPaneTarget(pane.id, route);
    return;
  }
  if (route !== null && literalKey(route) === literalKey(pane.target)) return;
  // Replace, so Back does not step through focus changes.
  void router.navigate({ ...locationForTarget(pane.target), replace: true });
}

export function focusPane(router: AnyRouter, paneId: string): void {
  usePaneStore.getState().focusPane(paneId);
  openFocusedPaneRoute(router);
}

function focusDirection(router: AnyRouter, direction: PaneDirection): void {
  const { tab } = readFocusedPane();
  const neighborId = neighborInDirection(tab.root, tab.focusedPaneId, direction, paneLastFocusedAt);
  if (neighborId !== null) focusPane(router, neighborId);
}

// The project of the thread that each pane showed last, for a pane whose thread went away.
const lastProjectByPaneId = new Map<string, ScopedProjectRef>();

export function rememberPaneProject(paneId: string, projectRef: ScopedProjectRef): void {
  lastProjectByPaneId.set(paneId, projectRef);
}

/** The project of `source`, else the pane's last project, else the stock default project. */
function resolvePaneProjectRef(paneId: string, source: PaneTarget): ScopedProjectRef | null {
  const drafts = useComposerDraftStore.getState();
  const thread =
    source === null
      ? null
      : source.kind === "server"
        ? (readThreadShell(source.threadRef) ?? drafts.getDraftThread(source.threadRef))
        : drafts.getDraftSession(source.draftId);
  const candidates = [
    thread === null ? null : scopeProjectRef(thread.environmentId, thread.projectId),
    lastProjectByPaneId.get(paneId) ?? null,
  ];
  const known = candidates.find((ref) => ref !== null && readProject(ref) !== null);
  if (known) return known;
  const lastUsedProjectKey = readLastUsedProjectKey();
  return resolveDefaultProjectRef(
    readProjects(),
    useUiStateStore.getState().projectOrder,
    lastUsedProjectKey,
    appAtomRegistry.get(defaultProjectFallbackReadyAtom(lastUsedProjectKey)),
  );
}

/**
 * Stands in for the router in the stock new-thread flow, which reads the route's thread for the
 * model to carry, reads the URL to see if the user moved on, and navigates to the draft. Here
 * the route is the pane's source thread, the URL never changes, and the draft goes to the pane.
 */
function paneRouter(source: PaneTarget, openDraft: (draftId: DraftId) => void): AnyRouter {
  const params =
    source === null
      ? {}
      : source.kind === "server"
        ? buildThreadRouteParams(source.threadRef)
        : buildDraftThreadRouteParams(source.draftId);
  return {
    state: { matches: [{ params }], location: { href: "pane" } },
    navigate: (options: { params: { draftId: DraftId } }) => {
      openDraft(options.params.draftId);
      return Promise.resolve();
    },
  } as unknown as AnyRouter;
}

function isDraftShown(draftId: DraftId): boolean {
  return usePaneStore
    .getState()
    .layout.tabs.some((tab) =>
      listLeaves(tab.root).some(
        (leaf) => leaf.target?.kind === "draft" && leaf.target.draftId === draftId,
      ),
    );
}

type NewThreadRequest = Parameters<NewThreadHandler>;

/**
 * Opens a new draft thread in a pane through the stock new-thread flow, which makes a fresh draft
 * (see paneDrafts.ts). The draft takes the place of the pane's thread with a `request` or with
 * `claim`. Else the pane must still be empty when the draft is ready.
 */
async function openNewThreadNow(
  router: AnyRouter,
  paneId: string,
  source: PaneTarget,
  request?: NewThreadRequest,
  claim = false,
): Promise<Awaited<ReturnType<NewThreadHandler>>> {
  const accepts = () => {
    const tab = findTabOfLeaf(usePaneStore.getState().layout, paneId);
    const pane = tab === null ? null : findLeaf(tab.root, paneId);
    return pane !== null && (request !== undefined || claim || pane.target === null);
  };
  if (!accepts()) return null;
  const projectRef = request?.[0] ?? resolvePaneProjectRef(paneId, source);
  if (projectRef === null) return null;
  // A pane that the user splits from this one before the draft is ready starts in this project.
  rememberPaneProject(paneId, projectRef);
  // The draft of the pane the user split from must have its own key before stock runs.
  syncPaneDrafts();
  let opened = false;
  const openDraft = (draftId: DraftId) => {
    if (opened) return;
    opened = true;
    if (!accepts() || isDraftShown(draftId)) return;
    usePaneStore.getState().setPaneTarget(paneId, { kind: "draft", draftId });
    if (readFocusedPane().pane?.id !== paneId) return;
    requestPaneFocusRestore(paneId);
    openFocusedPaneRoute(router);
  };
  const draft = await createNewThreadHandler(paneRouter(source, openDraft))(
    projectRef,
    request?.[1],
  );
  if (draft !== null) openDraft(draft.draftId);
  return draft;
}

// Stock picks the project's reusable empty draft before it waits for the project file. Two
// requests that overlap would pick the same draft, and the second pane would stay empty.
let newThreadQueue: Promise<unknown> = Promise.resolve();

/** New threads open one at a time, in the order asked. */
function queueNewThread<Result>(open: () => Promise<Result>): Promise<Result> {
  const opened = newThreadQueue.then(open);
  // A request that fails must not stop the requests after it. The caller still sees the failure.
  newThreadQueue = opened.catch(() => undefined);
  return opened;
}

/**
 * Gives an empty pane its own new draft thread. The pane is blank while it waits. With `claim`
 * the draft also takes the place of a thread that a route put in the pane during the wait.
 */
function fillWithNewThread(
  router: AnyRouter,
  paneId: string,
  source: PaneTarget,
  claim = false,
): Promise<void> {
  usePaneStore.getState().setPaneFilling(paneId, true);
  return queueNewThread(() => openNewThreadNow(router, paneId, source, undefined, claim))
    .then(() => undefined)
    .finally(() => usePaneStore.getState().setPaneFilling(paneId, false));
}

/**
 * The stock new-thread action of a pane that does not have focus: the follow-up draft of "send
 * and new thread", asked for after the user moved to another pane. The draft takes the place of
 * that pane's thread. Through the URL it would replace the thread of the pane that has focus.
 */
export function startNewThreadInPane(
  router: AnyRouter,
  paneId: string,
  ...request: NewThreadRequest
): ReturnType<NewThreadHandler> {
  return queueNewThread(() => {
    const tab = findTabOfLeaf(usePaneStore.getState().layout, paneId);
    const source = tab === null ? null : (findLeaf(tab.root, paneId)?.target ?? null);
    return openNewThreadNow(router, paneId, source, request);
  });
}

/**
 * For a pane that a stored layout left empty: a quit during a fill, or a draft that the layout
 * load took from a second tab. A pane that already waits for its draft is left alone.
 */
export function fillEmptyPane(router: AnyRouter, paneId: string): void {
  const store = usePaneStore.getState();
  const tab = findTabOfLeaf(store.layout, paneId);
  const pane = tab === null ? null : findLeaf(tab.root, paneId);
  if (pane === null || pane.target !== null || store.fillingPaneIds.includes(paneId)) return;
  void fillWithNewThread(router, paneId, null);
}

/**
 * For a pane whose thread can no longer be shown: the pane keeps its place and shows its own new
 * draft thread, in the project of the thread that went away. With `keepFocus` the draft also
 * wins over the thread that a stock route puts in the pane while the draft is made.
 */
export function replacePaneThread(
  router: AnyRouter,
  paneId: string,
  options: { readonly keepFocus?: boolean } = {},
): void {
  const store = usePaneStore.getState();
  const tab = findTabOfLeaf(store.layout, paneId);
  const source = tab === null ? null : (findLeaf(tab.root, paneId)?.target ?? null);
  if (source === null) return;
  store.setPaneTarget(paneId, null);
  const filled = fillWithNewThread(router, paneId, source, options.keepFocus === true);
  void (options.keepFocus ? filled.then(() => focusFilledPane(router, paneId)) : filled);
}

/**
 * For a pane that had focus when its thread went away: a stock handler can move the route to
 * another pane while the draft is made, and the focus then returns to the pane with its draft.
 */
function focusFilledPane(router: AnyRouter, paneId: string): void {
  const { layout } = usePaneStore.getState();
  const tab = getActiveTab(layout);
  if (tab.focusedPaneId === paneId || findLeaf(tab.root, paneId)?.target?.kind !== "draft") return;
  requestPaneFocusRestore(paneId);
  focusPane(router, paneId);
}

/** In single mode the grid has no box of its own, so the inset stands in for it. */
export function readPaneAreaSize(): PaneContainerSize {
  const area =
    typeof document === "undefined"
      ? null
      : (document.querySelector('[data-splitpane-root][data-multi="true"] [data-splitpane-grid]') ??
        document.querySelector("[data-splitpane-root]"));
  const box = area?.getBoundingClientRect();
  return { width: box?.width ?? Infinity, height: box?.height ?? Infinity };
}

function splitFocused(router: AnyRouter, direction: PaneSplitDirection): void {
  const { tab, pane } = readFocusedPane();
  if (pane === null) return;
  const refusal = splitRefusal(tab, pane.id, direction, readPaneAreaSize());
  if (refusal !== null) {
    toastManager.add({
      type: "warning",
      title: "Can't split this pane",
      description:
        refusal.reason === "max-panes"
          ? `A tab holds at most ${MAX_PANES_PER_TAB} panes.`
          : `Each half would be ${Math.floor(refusal.halfPx)} px ${
              direction === "right" ? "wide" : "high"
            }. The minimum is ${refusal.minPx} px.`,
    });
    return;
  }
  usePaneStore.getState().splitPane(pane.id, direction);
  fillNewPane(router, pane);
}

function newTab(router: AnyRouter): void {
  const { pane } = readFocusedPane();
  usePaneStore.getState().newTab();
  fillNewPane(router, pane);
}

/** The new pane has focus. Its draft starts in the project of the pane the user came from. */
function fillNewPane(router: AnyRouter, from: PaneLeaf | null): void {
  const paneId = readFocusedPane().tab.focusedPaneId;
  const project = from === null ? undefined : lastProjectByPaneId.get(from.id);
  if (project !== undefined) rememberPaneProject(paneId, project);
  void fillWithNewThread(router, paneId, from?.target ?? null);
}

/** Closes a pane of the active tab. The route then follows the pane that has focus. */
export function closePane(router: AnyRouter, paneId: string): void {
  usePaneStore.getState().closePane(paneId);
  openFocusedPaneRoute(router);
}

function closeFocusedPane(router: AnyRouter): void {
  closePane(router, getActiveTab(usePaneStore.getState().layout).focusedPaneId);
}

/**
 * A pointer press puts DOM focus where it lands. Every other focus change leaves DOM focus in
 * the pane that lost focus, or on a control outside the panes, so the pane host moves it.
 */
function withFocusRestore(action: () => void): void {
  const before = readFocusedPane().tab.focusedPaneId;
  action();
  const after = readFocusedPane().tab.focusedPaneId;
  if (after !== before) requestPaneFocusRestore(after);
}

export function closeTab(router: AnyRouter, tabId: string): void {
  withFocusRestore(() => {
    usePaneStore.getState().closeTab(tabId);
    openFocusedPaneRoute(router);
  });
}

export function activateTab(router: AnyRouter, tabId: string): void {
  if (tabId === usePaneStore.getState().layout.activeTabId) return;
  withFocusRestore(() => {
    usePaneStore.getState().activateTab(tabId);
    openFocusedPaneRoute(router);
  });
}

function activateTabAt(router: AnyRouter, index: number): void {
  const tab = usePaneStore.getState().layout.tabs.at(index);
  if (tab !== undefined) activateTab(router, tab.id);
}

function stepTab(router: AnyRouter, step: 1 | -1): void {
  const { tabs, activeTabId } = usePaneStore.getState().layout;
  const index = tabs.findIndex((tab) => tab.id === activeTabId);
  activateTabAt(router, (index + step + tabs.length) % tabs.length);
}

function jumpToTab(router: AnyRouter, position: number): void {
  const { tabs } = usePaneStore.getState().layout;
  if (position === LAST_TAB_POSITION) activateTabAt(router, tabs.length - 1);
  else if (position <= tabs.length) activateTabAt(router, position - 1);
}

function dispatchPaneCommand(router: AnyRouter, command: PaneCommand): void {
  switch (command) {
    case "layout.splitRight":
      return splitFocused(router, "right");
    case "layout.splitDown":
      return splitFocused(router, "down");
    case "layout.focusLeft":
      return focusDirection(router, "left");
    case "layout.focusRight":
      return focusDirection(router, "right");
    case "layout.focusUp":
      return focusDirection(router, "up");
    case "layout.focusDown":
      return focusDirection(router, "down");
    case "layout.closePane":
    case "layout.closePaneNow":
      return closeFocusedPane(router);
    case "layout.newTab":
      return newTab(router);
    case "layout.closeTab":
      return closeTab(router, usePaneStore.getState().layout.activeTabId);
    case "layout.nextTab":
      return stepTab(router, 1);
    case "layout.previousTab":
      return stepTab(router, -1);
    case "layout.scrollToEnd":
      return scrollFocusedPaneToEnd();
    case "layout.stopTurn":
      return stopFocusedTurn();
    case "layout.focusInput":
      return focusInputOfFocusedPane();
    case "layout.previousMessage":
      return jumpToMessageInFocusedPane("previous");
    case "layout.nextMessage":
      return jumpToMessageInFocusedPane("next");
    case "layout.toggleMusic":
      return toggleMusicPopup();
    default:
      return jumpToTab(router, Number(command.slice(TAB_JUMP_COMMAND_PREFIX.length)));
  }
}

/** The store changes first, then the URL moves to the focused pane's thread. */
export function runPaneCommand(router: AnyRouter, command: PaneCommand): void {
  withFocusRestore(() => dispatchPaneCommand(router, command));
}

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ScopedThreadRef } from "@t3tools/contracts";

import type { DraftId } from "../composerDraftStore";
import { resolveStorage, type StateStorage } from "../lib/storage";
import type { ThreadRouteTarget } from "../threadRoutes";
import { createDraftResolver, threadKey, type PaneRouteState } from "./paneRouteSync";
import { useReadoutSettingsStore } from "./readoutSettings";
import {
  activateTab,
  addTab,
  closeLeaf,
  closeTab,
  createInitialLayout,
  createTab,
  equalizeSplit,
  findCollidingLeaf,
  findTabOfLeaf,
  focusLeaf,
  getActiveTab,
  leafCount,
  listLeaves,
  moveTab,
  renameTab,
  replaceTab,
  resizeSplit,
  sanitizeLayout,
  setLeafTarget,
  splitLeaf,
  type PaneContainerSize,
  type PaneLayout,
  type PaneSplitDirection,
  type PaneTab,
  type PaneTarget,
} from "./paneTree";

// Not `t3code:layout-state:v2` or `t3code:pane-layout:v1`: upstream pull requests use those keys.
export const PANE_STORAGE_KEY = "t3code-fork:panes:v1";
const PANE_STORAGE_VERSION = 1;

export interface PaneStoreState extends PaneRouteState {
  /** Empty panes that wait for their new draft thread. Not persisted. */
  fillingPaneIds: ReadonlyArray<string>;
  /** Commits the result of `followRoute`. */
  applyRouteState: (next: PaneRouteState) => void;
  /** Commits a layout that a pure function made from the current one (paneBrowserLayout.ts). */
  replaceLayout: (layout: PaneLayout) => void;
  setPaneFilling: (paneId: string, filling: boolean) => void;
  focusPane: (paneId: string) => void;
  /**
   * The pane becomes empty when another pane of its tab owns that thread: a draft, and each
   * thread while the setting `mirrorPanes` is off.
   */
  setPaneTarget: (paneId: string, target: PaneTarget) => void;
  /** The new pane is empty and takes focus. Nothing changes at the pane limit. */
  splitPane: (paneId: string, direction: PaneSplitDirection) => void;
  /** The last pane of a tab closes the tab. The last pane of the last tab stays. */
  closePane: (paneId: string) => void;
  /** The tab has one empty pane, opens after the active tab and becomes active. */
  newTab: () => void;
  /** The last tab stays. */
  closeTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  /** `toIndex` is the place of the tab in the new order. The active tab stays active. */
  moveTab: (tabId: string, toIndex: number) => void;
  /** Trimmed, at most 40 characters. An empty name gives the tab its automatic label again. */
  renameTab: (tabId: string, name: string) => void;
  /** Acts on the active tab. `position` is a fraction of the grid along the split axis. */
  resizeSplit: (
    splitId: string,
    index: number,
    position: number,
    container: PaneContainerSize,
  ) => void;
  /** Acts on the active tab. */
  equalizeSplit: (splitId: string, container: PaneContainerSize) => void;
  /**
   * Follows drafts that became server threads, in the tabs that are not mounted. A mounted
   * thread view follows its own draft, and keeps its chat view through the change.
   */
  retargetInactiveDrafts: (promotedTo: (draftId: DraftId) => ScopedThreadRef | null) => void;
}

const draftResolver = createDraftResolver();
const keyOf = (target: ThreadRouteTarget) => threadKey(target, draftResolver);

type LayoutChange = PaneStoreState | Pick<PaneStoreState, "layout" | "fillingPaneIds">;

/** A pane that left the layout no longer waits for a draft. */
function withLayout(state: PaneStoreState, layout: PaneLayout): LayoutChange {
  if (layout === state.layout) return state;
  const filling = state.fillingPaneIds.filter((paneId) => findTabOfLeaf(layout, paneId) !== null);
  return {
    layout,
    fillingPaneIds: filling.length === state.fillingPaneIds.length ? state.fillingPaneIds : filling,
  };
}

function withTabOfLeaf(
  state: PaneStoreState,
  paneId: string,
  update: (tab: PaneTab) => PaneTab,
): LayoutChange {
  const tab = findTabOfLeaf(state.layout, paneId);
  return tab === null ? state : withLayout(state, replaceTab(state.layout, update(tab)));
}

const readMirrorSetting = () => useReadoutSettingsStore.getState().mirrorPanes;

/**
 * The storage is a parameter so a test can open a second store on the same stored value, and
 * `readMirror` so a test can run both states of the setting `mirrorPanes`.
 */
export function createPaneStore(
  storage: StateStorage,
  readMirror: () => boolean = readMirrorSetting,
) {
  const ownedByAnotherLeaf = (tab: PaneTab, paneId: string, target: ThreadRouteTarget) =>
    findCollidingLeaf(tab.root, target, keyOf, readMirror(), paneId) !== null;
  return create<PaneStoreState>()(
    persist(
      (set) => ({
        layout: createInitialLayout(),
        lastRouteKey: null,
        fillingPaneIds: [],
        applyRouteState: (next) => {
          set((state) =>
            next.layout === state.layout && next.lastRouteKey === state.lastRouteKey
              ? state
              : { ...withLayout(state, next.layout), lastRouteKey: next.lastRouteKey },
          );
        },
        replaceLayout: (layout) => {
          set((state) => withLayout(state, layout));
        },
        setPaneFilling: (paneId, filling) => {
          set((state) => {
            const listed = state.fillingPaneIds.includes(paneId);
            const wanted = filling && findTabOfLeaf(state.layout, paneId) !== null;
            if (listed === wanted) return state;
            return {
              fillingPaneIds: wanted
                ? [...state.fillingPaneIds, paneId]
                : state.fillingPaneIds.filter((id) => id !== paneId),
            };
          });
        },
        focusPane: (paneId) => {
          set((state) => withTabOfLeaf(state, paneId, (tab) => focusLeaf(tab, paneId)));
        },
        setPaneTarget: (paneId, target) => {
          set((state) =>
            withTabOfLeaf(state, paneId, (tab) => {
              const owned = target !== null && ownedByAnotherLeaf(tab, paneId, target);
              return setLeafTarget(tab, paneId, owned ? null : target);
            }),
          );
        },
        splitPane: (paneId, direction) => {
          set((state) => withTabOfLeaf(state, paneId, (tab) => splitLeaf(tab, paneId, direction)));
        },
        closePane: (paneId) => {
          set((state) => {
            const tab = findTabOfLeaf(state.layout, paneId);
            if (tab === null) return state;
            return withLayout(
              state,
              leafCount(tab) > 1
                ? replaceTab(state.layout, closeLeaf(tab, paneId))
                : closeTab(state.layout, tab.id),
            );
          });
        },
        newTab: () => {
          set((state) => withLayout(state, addTab(state.layout, createTab())));
        },
        closeTab: (tabId) => {
          set((state) => withLayout(state, closeTab(state.layout, tabId)));
        },
        activateTab: (tabId) => {
          set((state) => withLayout(state, activateTab(state.layout, tabId)));
        },
        moveTab: (tabId, toIndex) => {
          set((state) => withLayout(state, moveTab(state.layout, tabId, toIndex)));
        },
        renameTab: (tabId, name) => {
          set((state) => withLayout(state, renameTab(state.layout, tabId, name)));
        },
        resizeSplit: (splitId, index, position, container) => {
          set((state) =>
            withLayout(
              state,
              replaceTab(
                state.layout,
                resizeSplit(getActiveTab(state.layout), splitId, index, position, container),
              ),
            ),
          );
        },
        equalizeSplit: (splitId, container) => {
          set((state) =>
            withLayout(
              state,
              replaceTab(
                state.layout,
                equalizeSplit(getActiveTab(state.layout), splitId, container),
              ),
            ),
          );
        },
        retargetInactiveDrafts: (promotedTo) => {
          set((state) => {
            let layout = state.layout;
            for (const tab of state.layout.tabs) {
              if (tab.id === state.layout.activeTabId) continue;
              let next = tab;
              for (const leaf of listLeaves(tab.root)) {
                const threadRef =
                  leaf.target?.kind === "draft" ? promotedTo(leaf.target.draftId) : null;
                if (threadRef === null) continue;
                const target: ThreadRouteTarget = { kind: "server", threadRef };
                next = setLeafTarget(
                  next,
                  leaf.id,
                  ownedByAnotherLeaf(next, leaf.id, target) ? null : target,
                );
              }
              layout = replaceTab(layout, next);
            }
            return withLayout(state, layout);
          });
        },
      }),
      {
        name: PANE_STORAGE_KEY,
        version: PANE_STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ layout: state.layout }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          layout:
            persistedState === undefined || persistedState === null
              ? currentState.layout
              : sanitizeLayout(
                  typeof persistedState === "object" && "layout" in persistedState
                    ? persistedState.layout
                    : undefined,
                  keyOf,
                  readMirror(),
                ),
        }),
      },
    ),
  );
}

export const usePaneStore = createPaneStore(
  resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
);

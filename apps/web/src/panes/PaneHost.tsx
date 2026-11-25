import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { SidebarInset } from "../components/ui/sidebar";
import { useComposerHandleContext } from "../composerHandleContext";
import { useProjects } from "../state/entities";
import type { ThreadRouteTarget } from "../threadRoutes";
import { fillEmptyPane, focusPane } from "./paneActions";
import { PaneCell } from "./PaneCell";
import { PaneDivider } from "./PaneDivider";
import { PaneDropOverlay } from "./PaneDropOverlay";
import { installPaneDraftSync } from "./paneDrafts";
import { installPaneFocusGuard } from "./paneFocusGuard";
import { registerFocusedComposer } from "./paneFocusInput";
import {
  notePaneFocused,
  paneLastFocusedAt,
  requestPaneFocusRestore,
  restoreRequestedPaneFocus,
} from "./paneFocusMemory";
import { registerPaneKeyScopes } from "./paneKeyScopes";
import { installPaneNarrowPanelGuard } from "./paneNarrowPanel";
import { createDraftResolver, followRoute, literalKey, locationForTarget } from "./paneRouteSync";
import { PaneSettleRelease } from "./PaneSettleRelease";
import { usePaneStore } from "./paneStore";
import { PaneTabBar } from "./PaneTabBar";
import { useReadoutSettingsStore } from "./readoutSettings";
import { installPaneTerminalReveal } from "./paneTerminalReveal";
import { usePaneChatDensity } from "./usePaneChatDensity";
import {
  dividerRects,
  findLeaf,
  getActiveTab,
  isMultiLayout,
  leafRects,
  listLeaves,
} from "./paneTree";
import "./floatingPreview.css";
import "./panes.css";

const draftResolver = createDraftResolver();

/**
 * Takes the place of the one stock thread view. It renders the stock inset once and one thread
 * view for each pane of the active tab. Cells are flat siblings keyed by pane id, so a split or
 * a close never changes the parent of a cell.
 */
export function PaneHost({
  target,
  background,
}: {
  target: ThreadRouteTarget;
  background: boolean;
}) {
  const navigate = useNavigate();
  const stored = usePaneStore(
    useShallow((state) => ({ layout: state.layout, lastRouteKey: state.lastRouteKey })),
  );
  // Derived in render, so the route's thread shows in its pane on the first frame.
  const mirror = useReadoutSettingsStore((settings) => settings.mirrorPanes);
  const previewGrip = useReadoutSettingsStore((settings) => settings.largeFloatingPreview);
  const sync = followRoute(stored, target, draftResolver, mirror, paneLastFocusedAt);
  const { layout } = sync.state;
  const tab = getActiveTab(layout);
  const focusedPaneId = tab.focusedPaneId;
  // A route that names a thread that another pane owns focuses that pane (paneRouteSync.ts). No
  // pointer press or pane key moved DOM focus there, so the keyboard would stay where it was.
  const routeMovedFocus =
    stored.layout.activeTabId === layout.activeTabId &&
    getActiveTab(stored.layout).focusedPaneId !== focusedPaneId;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- commits the route's placement to the pane store and moves the router to the restored pane when the layout wins over the route
  useLayoutEffect(() => {
    if (routeMovedFocus) requestPaneFocusRestore(focusedPaneId);
    usePaneStore.getState().applyRouteState(sync.state);
    if (sync.navigateTo !== null) {
      void navigate({ ...locationForTarget(sync.navigateTo), replace: true });
    }
  }, [focusedPaneId, navigate, routeMovedFocus, sync]);

  const router = useRouter();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the pane keys on the window key dispatcher while no modal page covers the thread view
  useEffect(() => (background ? undefined : registerPaneKeyScopes(router)), [background, router]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the pane store and the draft store, to keep each shown draft owned by its pane while the panes are mounted
  useEffect(() => installPaneDraftSync(), []);

  const multi = isMultiLayout(layout);
  const rects = leafRects(tab.root);
  const leaves = listLeaves(tab.root);
  const chatDensity = usePaneChatDensity(leaves.length);
  const fadeSetting = useReadoutSettingsStore((settings) => settings.fadeUnfocusedPanes);
  const fade = fadeSetting && leaves.length > 1;

  const emptyPaneIds = leaves.flatMap((leaf) => (leaf.target === null ? [leaf.id] : [])).join(" ");
  const projects = useProjects();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts a draft thread, through the stock new-thread flow, for each pane that a stored layout left empty, once a project is loaded
  useEffect(() => {
    if (emptyPaneIds === "" || projects.length === 0) return;
    for (const paneId of emptyPaneIds.split(" ")) fillEmptyPane(router, paneId);
  }, [emptyPaneIds, projects, router]);

  const composerHandle = useComposerHandleContext();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the app-wide composer handle outside React, for the key that puts the caret in the composer of the focused pane
  useEffect(() => registerFocusedComposer(composerHandle), [composerHandle]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window and document focus listeners that keep DOM focus out of passive panes while more than one pane or tab exists
  useEffect(() => {
    if (!multi) return undefined;
    return installPaneFocusGuard({
      getFocusedPaneId: () => getActiveTab(usePaneStore.getState().layout).focusedPaneId,
      focusPane: (paneId) => focusPane(router, paneId),
      getComposer: () => composerHandle?.current ?? null,
    });
  }, [composerHandle, multi, router]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the terminal store while more than one pane or tab exists, to restore a maximized right panel that would hide a drawer that opens
  useEffect(() => (multi ? installPaneTerminalReveal() : undefined), [multi]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- puts a guard in front of the opening actions of the right panel store while more than one pane or tab exists, so a pane too narrow for the panel refuses a request for a panel surface
  useEffect(() => (multi ? installPaneNarrowPanelGuard() : undefined), [multi]);

  const focusedTarget = findLeaf(tab.root, focusedPaneId)?.target ?? null;
  const focusedTargetKey = focusedTarget === null ? null : literalKey(focusedTarget);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves DOM focus into the pane that a key, a tab action or a route focused, after the commit that mounts that pane's thread
  useEffect(() => {
    notePaneFocused(focusedPaneId);
    restoreRequestedPaneFocus(focusedPaneId, focusedTargetKey !== null, composerHandle);
  }, [composerHandle, focusedPaneId, focusedTargetKey]);

  return (
    <SidebarInset
      className="h-svh min-h-0 overflow-hidden overscroll-y-none md:h-dvh"
      inert={background}
      data-splitpane-root
      data-multi={multi}
      data-pane-count={multi ? leaves.length : undefined}
      data-chat-density={chatDensity}
      data-preview-grip={previewGrip ? "" : undefined}
      data-fade-panes={fade ? "" : undefined}
    >
      <PaneSettleRelease layout={layout} />
      <PaneDropOverlay />
      {multi ? <PaneTabBar layout={layout} /> : null}
      <div data-splitpane-grid className={multi ? "relative min-h-0 flex-1" : "contents"}>
        {leaves.map((leaf, index) => (
          <PaneCell
            key={leaf.id}
            leaf={leaf}
            rect={rects[index]!}
            focused={leaf.id === focusedPaneId}
            faded={fade && leaf.id !== focusedPaneId}
            multi={multi}
            background={background}
          />
        ))}
        {multi
          ? dividerRects(tab.root).map((divider) => (
              <PaneDivider key={divider.id} divider={divider} />
            ))
          : null}
      </div>
    </SidebarInset>
  );
}

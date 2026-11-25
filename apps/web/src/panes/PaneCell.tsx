import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ChatComposerHandle } from "../components/chat/ChatComposer";
import { ThreadRouteView } from "../components/ThreadRouteView";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  ComposerHandleContext,
  type ComposerHandleRef,
  useComposerHandleContext,
} from "../composerHandleContext";
import { observeResize } from "../lib/observeResize";
import {
  PanelAnimationSuppressionProvider,
  usePanelAnimationSettings,
  usePanelNavigationSuppression,
} from "../panelAnimations";
import { useQuietThreadShell } from "../state/entities";
import { BrowserPane } from "./BrowserPane";
import { focusPane, rememberPaneProject } from "./paneActions";
import { useBrowserPanesAvailable } from "./paneBrowserActions";
import { keepFocusOnChatHeaderPress, pressChatPaneHeader } from "./paneChatDrag";
import { PaneCellContext } from "./paneContext";
import { PaneCloseButton } from "./PaneCloseButton";
import { pressRightPanelTab } from "./panelTabDrag";
import { PaneEmptyState } from "./PaneEmptyState";
import { claimPaneFocusAfterPress, rememberPaneFocus } from "./paneFocusMemory";
import {
  paneHeightClassOf,
  type PaneHeightClass,
  paneWidthClassOf,
  type PaneWidthClass,
} from "./paneSize";
import { literalKey } from "./paneRouteSync";
import { usePaneStore } from "./paneStore";
import { getActiveTab, isBrowserLeaf, leafCount, type PaneLeaf, type PaneRect } from "./paneTree";
import { useReadoutSettingsStore } from "./readoutSettings";

const percent = (fraction: number) => `${fraction * 100}%`;

/**
 * The size of a pane before its first layout: its part of the grid, or of the window where the
 * grid has no box yet. The window gives an upper limit, so a pane that is narrow there is narrow.
 */
function estimatePaneSize(rect: PaneRect) {
  const grid = document.querySelector("[data-splitpane-grid]")?.getBoundingClientRect();
  const width = grid !== undefined && grid.width > 0 ? grid.width : window.innerWidth;
  const height = grid !== undefined && grid.height > 0 ? grid.height : window.innerHeight;
  return { width: width * rect.width, height: height * rect.height };
}

/**
 * The composer handle of one pane, the same object for the life of the pane. A chat view keeps
 * the handle it started with in its async work, so that work can never reach the composer of
 * the pane that has focus later. The focused pane also writes its composer to the app handle.
 */
function createPaneComposerHandle() {
  let composer: ChatComposerHandle | null = null;
  let appHandle: ComposerHandleRef | null = null;
  const handle: ComposerHandleRef = {
    get current() {
      return composer;
    },
    set current(next) {
      if (appHandle !== null && (next !== null || appHandle.current === composer)) {
        appHandle.current = next;
      }
      composer = next;
    },
  };
  return {
    handle,
    /** `next` is the app handle while this pane has focus, else null. */
    setAppHandle(next: ComposerHandleRef | null) {
      // A pane that lost focus clears the app handle only if no other pane took it first.
      if (next === null && appHandle !== null && appHandle.current === composer) {
        appHandle.current = null;
      }
      appHandle = next;
      if (next !== null) next.current = composer;
    },
  };
}

/**
 * One pane. In single mode the wrapper has no box, so the thread view lays out as in stock. The
 * element type is the same in both modes, so the first split does not remount the thread view.
 */
export function PaneCell({
  leaf,
  rect,
  focused,
  faded,
  multi,
  background,
}: {
  leaf: PaneLeaf;
  rect: PaneRect;
  focused: boolean;
  /** The pane shows behind the veil of `panes.css` (setting `fadeUnfocusedPanes`). */
  faded: boolean;
  multi: boolean;
  background: boolean;
}) {
  const router = useRouter();
  const appComposerHandle = useComposerHandleContext();
  const [paneComposer] = useState(createPaneComposerHandle);
  const paneId = leaf.id;
  const cellRef = useRef<HTMLDivElement>(null);
  const [measuredWidthClass, setMeasuredWidthClass] = useState<PaneWidthClass>(() =>
    paneWidthClassOf(estimatePaneSize(rect).width),
  );
  const [measuredHeightClass, setMeasuredHeightClass] = useState<PaneHeightClass>(() =>
    paneHeightClassOf(estimatePaneSize(rect).height),
  );
  // One tab with one pane is the stock layout, whatever its size.
  const widthClass = multi ? measuredWidthClass : "wide";
  const heightClass = multi ? measuredHeightClass : "tall";
  const filling = usePaneStore((state) => state.fillingPaneIds.includes(paneId));
  // A tab with one pane closes by the close button of its tab.
  const closable = usePaneStore((state) => multi && leafCount(getActiveTab(state.layout)) > 1);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- points the app-wide composer handle at this pane's composer while the pane has focus, before the pane host moves DOM focus
  useLayoutEffect(() => {
    paneComposer.setAppHandle(focused ? appComposerHandle : null);
    return () => paneComposer.setAppHandle(null);
  }, [appComposerHandle, focused, paneComposer]);

  // No dependency list: a split, a close or a divider drag changes the box with no change of a
  // value this effect reads. An equal class is no state change, so the effect settles at once.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the pane's box after each render of the pane and before the paint, so a pane never paints one frame with the size class of its old box (a narrow pane would show its right panel for that frame)
  useLayoutEffect(() => {
    const cell = cellRef.current;
    if (!multi || cell === null) return;
    const box = cell.getBoundingClientRect();
    setMeasuredWidthClass(paneWidthClassOf(box.width));
    setMeasuredHeightClass(paneHeightClassOf(box.height));
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the pane's box with a resize observer, because stock decides its narrow and short layouts from the window size
  useEffect(() => {
    const cell = cellRef.current;
    if (!multi || cell === null) return undefined;
    return observeResize(cell, ([entry]) => {
      if (entry === undefined) return;
      setMeasuredWidthClass(paneWidthClassOf(entry.contentRect.width));
      setMeasuredHeightClass(paneHeightClassOf(entry.contentRect.height));
    });
  }, [multi]);

  // Stock turns panel animations off for two frames after each URL change, through a context
  // that every chat view reads. A pane focus move changes the URL and no pane's thread, so it
  // would render every chat view of the tab two times. A pane follows its own thread instead.
  const windowAnimationsActive = usePanelAnimationSettings().active;
  const paneAnimationsSuppressed = usePanelNavigationSuppression(
    multi && leaf.target !== null ? literalKey(leaf.target) : "",
  );

  const threadRef = leaf.target?.kind === "server" ? leaf.target.threadRef : null;
  // Where the client has no desktop browser, a browser pane shows the chat of its thread.
  const browserPanesAvailable = useBrowserPanesAvailable();
  const showsBrowser = browserPanesAvailable && isBrowserLeaf(leaf);
  // The chat header of a pane moves it. One tab with one pane has nowhere to go, as in stock.
  const dragPanes = useReadoutSettingsStore((settings) => settings.dragPanes);
  const draggable = multi && dragPanes && !showsBrowser && leaf.target !== null;
  // A tab of the pane's right panel drags out to a pane (setting "Browser panes").
  const panelTabThreadRef = useReadoutSettingsStore((settings) => settings.browserPanes)
    ? threadRef
    : null;
  const draftId = leaf.target?.kind === "draft" ? leaf.target.draftId : null;
  const thread = useQuietThreadShell(threadRef);
  const draftSession = useComposerDraftStore((store) =>
    draftId === null ? null : store.getDraftSession(draftId),
  );
  const projectEnvironmentId = thread?.environmentId ?? draftSession?.environmentId ?? null;
  const projectId = thread?.projectId ?? draftSession?.projectId ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the pane's project outside React, for the new draft that the pane takes when its thread goes away
  useEffect(() => {
    if (projectEnvironmentId === null || projectId === null) return;
    rememberPaneProject(paneId, scopeProjectRef(projectEnvironmentId, projectId));
  }, [paneId, projectEnvironmentId, projectId]);

  return (
    <div
      ref={cellRef}
      data-splitpane-cell={paneId}
      data-pane-focused={focused}
      data-pane-faded={faded ? "true" : undefined}
      data-pane-narrow={widthClass === "wide" ? undefined : "true"}
      data-pane-compact={widthClass === "compact" ? "true" : undefined}
      data-pane-short={heightClass === "short" ? "true" : undefined}
      data-pane-closable={closable && !showsBrowser ? "true" : undefined}
      data-pane-draggable={draggable ? "true" : undefined}
      className={multi ? "absolute flex min-h-0 min-w-0 flex-col overflow-hidden" : "contents"}
      style={
        multi
          ? {
              left: percent(rect.left),
              top: percent(rect.top),
              width: percent(rect.width),
              height: percent(rect.height),
            }
          : undefined
      }
      // The stock workspace focus code skips a passive pane, so focus recovery, the F6 cycle and
      // focus into an opened panel act on the focused pane.
      data-workspace-unavailable={multi && !focused ? "true" : undefined}
      // Capture, so the pane owns the keyboard and the URL before the click lands in it. The
      // focused pane needs the handler only where a terminal can cover its composer.
      onPointerDownCapture={
        focused && heightClass !== "short" && !draggable && panelTabThreadRef === null
          ? undefined
          : (event) => {
              if (!focused) focusPane(router, paneId);
              if (!focused || heightClass === "short") {
                claimPaneFocusAfterPress(paneId, leaf.target !== null, paneComposer.handle);
              }
              if (draggable) pressChatPaneHeader(event, paneId, router);
              if (panelTabThreadRef !== null) pressRightPanelTab(event, panelTabThreadRef, router);
            }
      }
      onMouseDownCapture={draggable ? keepFocusOnChatHeaderPress : undefined}
      onFocusCapture={(event) => rememberPaneFocus(paneId, event.target)}
    >
      {/* A browser pane has the close button of its own header. */}
      {closable && !showsBrowser ? <PaneCloseButton paneId={paneId} /> : null}
      <PaneCellContext value={{ paneId, focused, multi, threadRef, narrow: widthClass !== "wide" }}>
        <ComposerHandleContext value={paneComposer.handle}>
          {/* In single mode the value gives the chat view the window's own setting, as stock. */}
          <PanelAnimationSuppressionProvider
            value={multi ? paneAnimationsSuppressed : !windowAnimationsActive}
          >
            {leaf.target === null ? (
              <PaneEmptyState filling={filling} />
            ) : showsBrowser && threadRef !== null ? (
              <BrowserPane paneId={paneId} threadRef={threadRef} background={background} />
            ) : (
              <ThreadRouteView target={leaf.target} background={background} />
            )}
          </PanelAnimationSuppressionProvider>
        </ComposerHandleContext>
      </PaneCellContext>
    </div>
  );
}

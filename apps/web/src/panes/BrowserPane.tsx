import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { Globe, PictureInPicture2, XIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import {
  selectThreadPreviewMiniPlayerTabId,
  usePreviewMiniPlayerStore,
} from "../previewMiniPlayerStore";
import { useThreadPreviewState } from "../previewStateStore";
import {
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "../rightPanelStore";
import { useQuietThreadShell } from "../state/entities";
import {
  closeBrowserPane,
  moveBrowserPane,
  returnBrowserPaneToPreview,
} from "./paneBrowserActions";
import { findChatLeaf } from "./paneBrowserLayout";
import { beginPaneDrag, cancelPaneDrag, endPaneDrag, movePaneDrag } from "./paneDrag";
import { usePaneStore } from "./paneStore";
import { findLeaf, findTabOfLeaf, getActiveTab, isBrowserLeaf } from "./paneTree";
import { useReadoutSettingsStore } from "./readoutSettings";

// The stock browser view is a large module that the right panel also loads on first use.
const PreviewPanel = lazy(() =>
  import("../components/preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * A pane that shows the browser of a thread in place of its chat: a header that is the drag
 * handle of the pane, and the stock browser view (address row, profile badge, page) of the
 * thread's active browser tab. Closing the pane leaves the browser tab of the thread open.
 */
export function BrowserPane({
  paneId,
  threadRef,
  background,
}: {
  paneId: string;
  threadRef: ScopedThreadRef;
  background: boolean;
}) {
  const router = useRouter();
  const title = useQuietThreadShell(threadRef)?.title ?? "Thread";
  const { activeTabId } = useThreadPreviewState(threadRef);
  const floatingTabId = usePreviewMiniPlayerStore((state) =>
    selectThreadPreviewMiniPlayerTabId(state.byThreadKey, threadRef),
  );
  const floatsHere = activeTabId !== null && floatingTabId === activeTabId;
  // The thread ref is a new object for each layout, so the effect reads its two ids.
  const { environmentId, threadId } = threadRef;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- closes the stock floating preview of the page that this pane shows, in the stock store: one webview exists for a browser tab, and the pane keeps it
  useEffect(() => {
    if (!floatsHere) return;
    // "Back to floating preview" opens the floating preview while this pane is on its way out.
    const tab = findTabOfLeaf(usePaneStore.getState().layout, paneId);
    const leaf = tab === null ? null : findLeaf(tab.root, paneId);
    if (leaf === null || !isBrowserLeaf(leaf)) return;
    usePreviewMiniPlayerStore.getState().close(scopeThreadRef(environmentId, threadId));
  }, [environmentId, floatsHere, paneId, threadId]);

  // The right panel of a chat pane of the same thread can show the same page. It keeps the page
  // while it does, and this pane offers to take it.
  const panelShowsPage = useRightPanelStore((state) => {
    const surface = selectActiveRightPanelSurface(state.byThreadKey, threadRef);
    return (
      selectThreadRightPanelState(state.byThreadKey, threadRef).isOpen &&
      surface?.kind === "preview" &&
      activeTabId !== null &&
      surface.resourceId === activeTabId
    );
  });
  const chatPaneShown = usePaneStore(
    (state) => findChatLeaf(getActiveTab(state.layout), threadRef) !== null,
  );
  const yieldsToPanel = panelShowsPage && chatPaneShown;

  const dragPanes = useReadoutSettingsStore((settings) => settings.dragPanes);
  const pointOf = (event: ReactPointerEvent) => ({ x: event.clientX, y: event.clientY });
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const onButton = event.target instanceof Element && event.target.closest("button") !== null;
    if (event.button !== 0 || onButton || !dragPanes) return;
    // Capture keeps the drag alive over the page of this pane and of other panes.
    event.currentTarget.setPointerCapture(event.pointerId);
    beginPaneDrag({ kind: "pane", paneId }, pointOf(event));
  };
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) movePaneDrag(pointOf(event));
  };
  const drop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const target = endPaneDrag();
    if (target !== null) moveBrowserPane(router, paneId, target);
  };

  return (
    <div
      data-pane-browser
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background outline-none"
    >
      <div
        data-pane-browser-header
        className={cn(
          "flex h-9 shrink-0 touch-none items-center gap-1.5 border-b border-border px-2 text-xs select-none [-webkit-app-region:no-drag]",
          dragPanes && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={drop}
        onPointerCancel={cancelPaneDrag}
        onLostPointerCapture={cancelPaneDrag}
      >
        <Globe className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">Browser</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{title}</span>
        <HeaderButton
          label="Back to floating preview"
          onClick={() => returnBrowserPaneToPreview(router, paneId)}
        >
          <PictureInPicture2 />
        </HeaderButton>
        <HeaderButton label="Close browser pane" onClick={() => closeBrowserPane(router, paneId)}>
          <XIcon />
        </HeaderButton>
      </div>
      <div className="min-h-0 flex-1">
        {yieldsToPanel ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              This page shows in the right panel of the thread.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => useRightPanelStore.getState().close(threadRef)}
            >
              Show it here
            </Button>
          </div>
        ) : (
          <Suspense fallback={null}>
            <PreviewPanel mode="embedded" threadRef={threadRef} visible={!background} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

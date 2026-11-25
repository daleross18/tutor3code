import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { Columns2, GripVertical, SquarePlus } from "lucide-react";
import { use, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

import { useBrowserSurfaceStore } from "../browser/browserSurfaceStore";
import { previewRuntimeTabId } from "../browser/previewRuntimeTabId";
import { useChatCanvas } from "../components/chat/ChatCanvasContext";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import {
  browserMiniPlayerSource,
  previewMiniPlayerSourceKey,
  usePreviewMiniPlayerStore,
  type PreviewMiniPlayerState,
} from "../previewMiniPlayerStore";
import { useThreadPreviewState } from "../previewStateStore";
import {
  floatingPageSizeOf,
  isFloatingPageApplied,
  largePreviewBox,
  pageSizeForFrame,
  previewBoxOfWidth,
  setFloatingPageSize,
  trackPageSize,
  wantsLargeFloatingPreview,
} from "./floatingPreviewSize";
import {
  openBrowserPane,
  openBrowserPaneBeside,
  useBrowserPanesAvailable,
} from "./paneBrowserActions";
import { PaneCellContext } from "./paneContext";
import { beginPaneDrag, cancelPaneDrag, endPaneDrag, movePaneDrag } from "./paneDrag";
import { usePaneStore } from "./paneStore";
import { getActiveTab } from "./paneTree";
import { useReadoutSettingsStore } from "./readoutSettings";

interface Props {
  readonly threadRef: ScopedThreadRef;
  readonly miniPlayer: PreviewMiniPlayerState;
}

/**
 * The fork's part of the stock floating preview, mounted in its button row (hunk set
 * `r8-browser-pane`). A device preview gets nothing. With both settings off it renders nothing.
 */
export function FloatingPreviewExtras({ threadRef, miniPlayer }: Props) {
  return miniPlayer.source.kind === "browser" ? (
    <BrowserPreviewExtras
      threadRef={threadRef}
      miniPlayer={miniPlayer}
      tabId={miniPlayer.source.tabId}
    />
  ) : null;
}

function BrowserPreviewExtras({ threadRef, miniPlayer, tabId }: Props & { tabId: string }) {
  const sourceKey = previewMiniPlayerSourceKey(browserMiniPlayerSource(tabId));
  const { serverEpoch } = useThreadPreviewState(threadRef);
  const runtimeTabId = previewRuntimeTabId(threadRef, serverEpoch, tabId);
  useLargeFloatingPreview({ threadRef, tabId, sourceKey, runtimeTabId, width: miniPlayer.width });

  const router = useRouter();
  const paneId = use(PaneCellContext)?.paneId ?? null;
  const panesAvailable = useBrowserPanesAvailable();
  const buttonsRef = useRef<HTMLSpanElement | null>(null);
  // The thread ref is a new object for each layout, so the effect reads its two ids.
  const { environmentId, threadId } = threadRef;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- native pointer listeners on the stock drag handle of the floating preview, which show the drop zones of the panes while the stock drag runs
  useEffect(() => {
    // The stock handle is the child of the preview frame that holds this button row.
    const handle = buttonsRef.current?.closest<HTMLElement>("[data-preview-mini-player] > div");
    if (!panesAvailable || handle == null) return undefined;
    const onDown = (event: PointerEvent) => {
      const onButton = event.target instanceof Element && event.target.closest("button") !== null;
      if (event.button !== 0 || onButton) return;
      beginPaneDrag({ kind: "preview", ownPaneId: paneId }, { x: event.clientX, y: event.clientY });
    };
    const onMove = (event: PointerEvent) => {
      if ((event.buttons & 1) === 0) cancelPaneDrag();
      else movePaneDrag({ x: event.clientX, y: event.clientY });
    };
    const onUp = () => {
      const drop = endPaneDrag();
      if (drop !== null) {
        openBrowserPane(router, scopeThreadRef(environmentId, threadId), tabId, drop);
      }
    };
    handle.addEventListener("pointerdown", onDown);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", cancelPaneDrag);
    handle.addEventListener("lostpointercapture", cancelPaneDrag);
    return () => {
      handle.removeEventListener("pointerdown", onDown);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", cancelPaneDrag);
      handle.removeEventListener("lostpointercapture", cancelPaneDrag);
      cancelPaneDrag();
    };
  }, [environmentId, paneId, panesAvailable, router, tabId, threadId]);

  if (!panesAvailable) return null;
  const ownPaneId = () => paneId ?? getActiveTab(usePaneStore.getState().layout).focusedPaneId;
  return (
    <span ref={buttonsRef} className="contents">
      {/* The stock buttons fill the row, so this is the place to take hold of the preview. */}
      <span
        aria-hidden
        data-preview-drag-grip
        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </span>
      <PreviewPillButton
        label="Open in a split pane"
        onClick={() => openBrowserPaneBeside(router, threadRef, tabId, ownPaneId())}
      >
        <Columns2 />
      </PreviewPillButton>
      <PreviewPillButton
        label="Move to a new tab"
        onClick={() => openBrowserPane(router, threadRef, tabId, { kind: "new-tab" })}
      >
        <SquarePlus />
      </PreviewPillButton>
    </span>
  );
}

/** A button of the stock button row: a press on it must not start the stock drag. */
function PreviewPillButton({
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
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Setting `largeFloatingPreview`: the floating preview that an artifact link opened starts at
 * about 70% of the pane width, and its page has the size of the frame, also after a resize.
 */
function useLargeFloatingPreview(input: {
  readonly threadRef: ScopedThreadRef;
  readonly tabId: string;
  readonly sourceKey: string;
  readonly runtimeTabId: string;
  readonly width: number | null;
}): void {
  const { tabId, sourceKey, runtimeTabId, width } = input;
  // The thread ref is a new object for each layout, so the effect reads its two ids.
  const { environmentId, threadId } = input.threadRef;
  const enabled = useReadoutSettingsStore((settings) => settings.largeFloatingPreview);
  const canvas = useChatCanvas();
  const frame = canvas?.previewKey === sourceKey ? canvas.layout.frame : null;
  const frameWidth = frame?.width ?? null;
  const frameHeight = frame?.height ?? null;
  const containerWidth = canvas?.container.width ?? 0;
  const containerHeight = canvas?.container.height ?? 0;
  const fitted = useBrowserSurfaceStore(
    (state) => state.byTabId[runtimeTabId]?.fittedSourceContent ?? null,
  );
  // The width that the fork asked for, until stock laid the frame out from the fork's page.
  const wantedWidth = useRef<number | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the first size of the floating preview to the stock store, and the page size that follows its frame to the browser surface store, before the paint
  useLayoutEffect(() => {
    if (!enabled) {
      setFloatingPageSize(runtimeTabId, null);
      return;
    }
    const page = floatingPageSizeOf(runtimeTabId);
    if (page === null) {
      const threadRef = scopeThreadRef(environmentId, threadId);
      if (containerWidth <= 0 || !wantsLargeFloatingPreview(threadRef, tabId)) return;
      const box =
        width === null
          ? largePreviewBox({ width: containerWidth, height: containerHeight })
          : previewBoxOfWidth(width);
      wantedWidth.current = box.width;
      setFloatingPageSize(runtimeTabId, pageSizeForFrame(box));
      // A size that the user set stays. Stock keeps it for the life of the floating preview.
      if (width === null) {
        usePreviewMiniPlayerStore.getState().resize(threadRef, sourceKey, box.width);
      }
      return;
    }
    if (frameWidth === null || frameHeight === null || !isFloatingPageApplied(fitted, page)) return;
    const next = trackPageSize(
      { width: frameWidth, height: frameHeight },
      page,
      wantedWidth.current,
    );
    wantedWidth.current = null;
    if (next !== null) setFloatingPageSize(runtimeTabId, next);
  }, [
    containerHeight,
    containerWidth,
    enabled,
    environmentId,
    fitted,
    frameHeight,
    frameWidth,
    runtimeTabId,
    sourceKey,
    tabId,
    threadId,
    width,
  ]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- gives the page size of the tab back to stock when the floating preview closes
  useEffect(() => () => setFloatingPageSize(runtimeTabId, null), [runtimeTabId]);
}

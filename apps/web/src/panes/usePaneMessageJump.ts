import type { LegendListRef } from "@legendapp/list/react";
import { useEffect, useRef } from "react";

import type { MessagesTimelineHistoryControls } from "../components/chat/MessagesTimeline";
import type { MessagesTimelineRow } from "../components/chat/MessagesTimeline.logic";
import type { TimelineViewport } from "../components/chat/timelineViewport";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  ALIGN_MAX_CORRECTIONS,
  ALIGN_WATCH_FRAMES,
  alignmentCorrection,
  type JumpRow,
  MESSAGE_JUMP_OFFSET,
  type MessageJumpDirection,
  registerFocusedMessageJump,
  resolveLoadedJump,
  resolveMessageJump,
} from "./paneMessageJump";

/** Stock locals of the chat view, under their stock names. */
export interface PaneMessageJumpInput {
  readonly legendListRef: { readonly current: LegendListRef | null };
  readonly threadHistoryControls: MessagesTimelineHistoryControls | undefined;
  readonly routeThreadKey: string;
  readonly scrollToEnd: (animated?: boolean) => void;
  readonly attachTimelineViewport: (viewport: TimelineViewport) => () => void;
}

interface PendingJump {
  readonly threadKey: string;
  readonly knownRowIds: ReadonlySet<string>;
  /** The first row of the list at each request, so one page is asked for once. */
  readonly requestedBefore: Set<string>;
}

function jumpRowsOf(list: LegendListRef): ReadonlyArray<JumpRow> {
  const rows: ReadonlyArray<MessagesTimelineRow> = list.getState().data;
  return rows.map((row) => ({
    id: row.id,
    isUserMessage: row.kind === "message" && row.message.role === "user",
  }));
}

/** The list position at the top of the viewport, measured as the stock minimap measures it. */
function readListScroll(list: LegendListRef): number {
  const state = list.getState();
  const viewport = list.getScrollableNode();
  const firstIndex = state.startBuffered;
  const firstRow: unknown = firstIndex == null ? null : state.elementAtIndex(firstIndex);
  // The cached row positions do not hold the list header or a scroll adjustment that waits.
  return firstRow instanceof HTMLElement && viewport !== null
    ? state.positionAtIndex(firstIndex) +
        viewport.getBoundingClientRect().top -
        firstRow.getBoundingClientRect().top
    : state.scroll;
}

/**
 * Gives the timeline of a chat view to the two message-jump keys, for the chat view of the
 * focused pane only (`active`). With no earlier user message loaded, the stock "Load earlier
 * turns" runs and a later render jumps. Returns the callback for the stock `onViewportAttach`.
 */
export function usePaneMessageJump(
  input: PaneMessageJumpInput,
  active: boolean,
): (viewport: TimelineViewport) => () => void {
  const viewportRef = useRef<TimelineViewport | null>(null);
  const pendingRef = useRef<PendingJump | null>(null);

  const alignFrameRef = useRef<number | null>(null);

  const stopAligning = () => {
    if (alignFrameRef.current !== null) cancelAnimationFrame(alignFrameRef.current);
    alignFrameRef.current = null;
  };

  /** Watches the row for some frames and scrolls again while it is off the target line. */
  const keepAligned = (list: LegendListRef, rowId: string) => {
    let frames = 0;
    let corrections = 0;
    const look = () => {
      alignFrameRef.current = null;
      const viewport = list.getScrollableNode();
      if (viewport === null || input.legendListRef.current !== list) return;
      const row = viewport.querySelector(`[data-timeline-row-id="${CSS.escape(rowId)}"]`);
      const change =
        row === null
          ? 0
          : alignmentCorrection({
              rowTop: row.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
              scrollTop: viewport.scrollTop,
              maxScrollTop: viewport.scrollHeight - viewport.clientHeight,
            });
      if (change !== 0 && corrections < ALIGN_MAX_CORRECTIONS) {
        corrections += 1;
        viewport.scrollTop += change;
      }
      frames += 1;
      if (frames < ALIGN_WATCH_FRAMES) alignFrameRef.current = requestAnimationFrame(look);
    };
    alignFrameRef.current = requestAnimationFrame(look);
  };

  const jumpToRow = (list: LegendListRef, rows: ReadonlyArray<JumpRow>, index: number) => {
    stopAligning();
    // As the minimap does: the chat stops following its end, and a position restore stops.
    viewportRef.current?.navigate({ releasesFollow: true });
    // No animation: the next key press reads the scroll position.
    void list.scrollToIndex({ index, animated: false, viewOffset: MESSAGE_JUMP_OFFSET });
    const row = rows[index];
    if (row !== undefined) keepAligned(list, row.id);
  };

  const requestEarlier = (pending: PendingJump, rows: ReadonlyArray<JumpRow>) => {
    const history = input.threadHistoryControls;
    const firstRowId = rows[0]?.id ?? "";
    if (history === undefined || history.loading || pending.requestedBefore.has(firstRowId)) {
      return;
    }
    pending.requestedBefore.add(firstRowId);
    history.onLoadEarlier();
  };

  const continuePendingJump = useStableCallback((): "done" | "waiting" => {
    const pending = pendingRef.current;
    const list = input.legendListRef.current;
    if (pending === null) return "done";
    if (list === null || pending.threadKey !== input.routeThreadKey) {
      pendingRef.current = null;
      return "done";
    }
    const history = input.threadHistoryControls;
    const rows = jumpRowsOf(list);
    const step = resolveLoadedJump({
      rows,
      knownRowIds: pending.knownRowIds,
      hasMoreHistory: history?.hasMoreHistory ?? false,
      loading: history?.loading ?? false,
      error: (history?.error ?? null) !== null,
    });
    if (step.kind === "row") {
      pendingRef.current = null;
      jumpToRow(list, rows, step.index);
      return "done";
    }
    if (step.kind === "drop") {
      pendingRef.current = null;
      return "done";
    }
    if (step.kind === "loadEarlier") requestEarlier(pending, rows);
    return "waiting";
  });

  const jump = useStableCallback((direction: MessageJumpDirection) => {
    const list = input.legendListRef.current;
    if (list === null) return;
    pendingRef.current = null;
    stopAligning();
    const state = list.getState();
    const viewport = list.getScrollableNode();
    const rows = jumpRowsOf(list);
    const target = resolveMessageJump({
      direction,
      userRows: rows.flatMap((row, index) =>
        row.isUserMessage ? [{ index, top: state.positionAtIndex(index) }] : [],
      ),
      scroll: readListScroll(list),
      atEnd:
        viewport !== null &&
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1,
      hasMoreHistory: input.threadHistoryControls?.hasMoreHistory ?? false,
    });
    if (target.kind === "row") return jumpToRow(list, rows, target.index);
    if (target.kind === "end") return input.scrollToEnd(true);
    if (target.kind === "none") return;
    const pending: PendingJump = {
      threadKey: input.routeThreadKey,
      knownRowIds: new Set(rows.map((row) => row.id)),
      requestedBefore: new Set(),
    };
    pendingRef.current = pending;
    viewportRef.current?.navigate({ releasesFollow: true });
    // The start of the list shows the stock "Loading earlier turns" line.
    void list.scrollToOffset({ offset: 0, animated: false });
    requestEarlier(pending, rows);
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers this chat view's jump outside React, for the fork's key handler (paneMessageJump.ts)
  useEffect(() => (active ? registerFocusedMessageJump(jump) : undefined), [active, jump]);

  // No dependency list: the page of older turns shows as a render of the chat view, and the
  // check costs one read of a ref while no jump waits.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a jump that waits for older turns continues when the list has them. The list is outside React state, and the page arrives from the server
  useEffect(() => {
    if (continuePendingJump() === "done") return;
    // The list takes its new rows in its own layout pass. One more look in the next frame.
    const frame = requestAnimationFrame(() => continuePendingJump());
    return () => cancelAnimationFrame(frame);
  });

  return useStableCallback((viewport: TimelineViewport) => {
    viewportRef.current = viewport;
    // A scroll by the user ends a jump that waits. A "command" is a scroll by the app.
    const unsubscribe = viewport.subscribe((navigation) => {
      if (navigation.source === "command") return;
      pendingRef.current = null;
      stopAligning();
    });
    const detach = input.attachTimelineViewport(viewport);
    return () => {
      unsubscribe();
      stopAligning();
      if (viewportRef.current === viewport) viewportRef.current = null;
      detach();
    };
  });
}

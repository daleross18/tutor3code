import type { AnyRouter } from "@tanstack/react-router";

import { focusPane, readPaneAreaSize } from "./paneActions";
import { showDropRefusal } from "./paneBrowserActions";
import { dropRefusal, layoutForMove, type PaneDrop } from "./paneBrowserLayout";
import { findOwnerAtDrop, moveChatLeaf } from "./paneChatMove";
import {
  beginPaneDrag,
  cancelPaneDrag,
  endPaneDrag,
  movePaneDrag,
  usePaneDragStore,
} from "./paneDrag";
import { requestPaneFocusRestore } from "./paneFocusMemory";
import { createDraftResolver, threadKey } from "./paneRouteSync";
import { usePaneStore } from "./paneStore";
import { getActiveTab } from "./paneTree";
import { useReadoutSettingsStore } from "./readoutSettings";

const draftResolver = createDraftResolver();

// The parts of the stock chat header that keep their own press: buttons, links and the editor
// of the title. Each other part of the header is the handle.
const HEADER_CONTROL_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [contenteditable="true"]';

/** The chat header that a press on its free area landed in, else null. */
function chatHeaderHandleOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element) || target.closest(HEADER_CONTROL_SELECTOR) !== null) return null;
  return target.closest<HTMLElement>("[data-chat-header]");
}

/**
 * Moves a chat pane to the drop. The pane keeps its id, so React keeps its chat view mounted, in
 * its tab and in another tab. False when the drop changes nothing or was refused.
 */
function moveChatPane(router: AnyRouter, paneId: string, drop: PaneDrop): boolean {
  const { layout } = usePaneStore.getState();
  const keyOf = (target: Parameters<typeof threadKey>[0]) => threadKey(target, draftResolver);
  const mirror = useReadoutSettingsStore.getState().mirrorPanes;
  const next = moveChatLeaf(layout, paneId, drop, keyOf, mirror);
  if (next === null) return false;
  // A pane that closes into the pane that owns its thread adds no pane to that tab.
  const adds = findOwnerAtDrop(layout, paneId, drop, keyOf, mirror) === null;
  const refusal = adds
    ? dropRefusal(layoutForMove(layout, paneId), drop, readPaneAreaSize())
    : null;
  if (refusal !== null) {
    showDropRefusal(refusal, drop, "Can't move the pane there");
    return false;
  }
  usePaneStore.getState().replaceLayout(next);
  const focusedPaneId = getActiveTab(next).focusedPaneId;
  // The moved pane kept its view and its DOM focus. Another pane needs the keyboard moved.
  if (focusedPaneId !== paneId) requestPaneFocusRestore(focusedPaneId);
  focusPane(router, focusedPaneId);
  return true;
}

let stopCurrentDrag: (() => void) | null = null;

interface HeaderPress {
  readonly button: number;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly target: EventTarget | null;
}

/**
 * A press on the free area of the chat header of a pane starts a drag of that pane. The zones
 * show after a small move, so a press with no move stays a click. The pointer is captured only
 * then, to keep the drag alive over the page of a browser pane.
 */
export function pressChatPaneHeader(press: HeaderPress, paneId: string, router: AnyRouter): void {
  const found = chatHeaderHandleOf(press.target);
  if (press.button !== 0 || found === null) return;
  const header = found;
  stopCurrentDrag?.();
  const { pointerId } = press;
  beginPaneDrag({ kind: "pane", paneId }, { x: press.clientX, y: press.clientY });
  let captured = false;
  function stop() {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    header.removeEventListener("lostpointercapture", onLostCapture);
    if (captured && header.hasPointerCapture(pointerId)) header.releasePointerCapture(pointerId);
    stopCurrentDrag = null;
  }
  function onMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    // A release that never reached the window, as over the page of a browser pane, ends the drag.
    if ((event.buttons & 1) === 0) {
      stopCurrentDrag?.();
      return;
    }
    movePaneDrag({ x: event.clientX, y: event.clientY });
    if (captured || !usePaneDragStore.getState().active || !header.isConnected) return;
    captured = true;
    header.setPointerCapture(pointerId);
    header.addEventListener("lostpointercapture", onLostCapture, { once: true });
  }
  function onLostCapture() {
    stop();
    cancelPaneDrag();
  }
  function onUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    stop();
    const drop = endPaneDrag();
    if (drop !== null) moveChatPane(router, paneId, drop);
  }
  function onCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    stop();
    cancelPaneDrag();
  }
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  stopCurrentDrag = () => {
    stop();
    cancelPaneDrag();
  };
}

/**
 * The mouse press on the handle takes no focus and starts no text selection, so the caret
 * stays in the composer of its pane through the move. With focus in another pane, the press
 * keeps the stock blur, so the pane focus rule can give the keys to a covering terminal.
 */
export function keepFocusOnChatHeaderPress(event: {
  readonly button: number;
  readonly target: EventTarget | null;
  readonly currentTarget: EventTarget | null;
  preventDefault: () => void;
}): void {
  if (event.button !== 0 || chatHeaderHandleOf(event.target) === null) return;
  const cell = event.currentTarget;
  if (cell instanceof Element && cell.contains(document.activeElement)) event.preventDefault();
}

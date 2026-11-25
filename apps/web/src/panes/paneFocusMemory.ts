import type { ComposerHandleRef } from "../composerHandleContext";
import { usePaneStore } from "./paneStore";
import { getActiveTab } from "./paneTree";

// Weak, so a pane never keeps an unmounted element alive.
const lastFocusedByPaneId = new Map<string, WeakRef<HTMLElement>>();
// The stock timeline scroller (MessagesTimeline.tsx) and the stock area-focus fallback name it so.
const CHAT_SCROLLER_SELECTOR = "[data-workspace-focus-default]";
let restorePaneId: string | null = null;
// A counter, not a clock: only the order of the focus changes matters.
const focusedAtByPaneId = new Map<string, number>();
let focusCount = 0;

/** Called by the pane host for each pane that becomes the focused pane. */
export function notePaneFocused(paneId: string): void {
  focusCount += 1;
  focusedAtByPaneId.set(paneId, focusCount);
}

/** Larger for a pane that had focus later. Zero for a pane that never had focus. */
export function paneLastFocusedAt(paneId: string): number {
  return focusedAtByPaneId.get(paneId) ?? 0;
}

/**
 * Records the element that holds DOM focus inside the focused pane. Focus that a passive pane
 * takes by itself is not recorded, because the focus guard sends it back.
 */
export function rememberPaneFocus(paneId: string, element: EventTarget): void {
  const { layout } = usePaneStore.getState();
  if (getActiveTab(layout).focusedPaneId !== paneId) return;
  if (!(element instanceof HTMLElement)) return;
  // A click on chat text focuses the chat scroller or, since v0.1.11, an assistant message body.
  // Return to the pane then goes to the input, so the Up key recalls a sent message. F6 focus on
  // the scroller (:focus-visible) is kept.
  const chatText =
    element.matches(CHAT_SCROLLER_SELECTOR) ||
    (element.tabIndex < 0 && element.closest(CHAT_SCROLLER_SELECTOR) !== null);
  if (chatText && !element.matches(":focus-visible")) {
    lastFocusedByPaneId.delete(paneId);
    return;
  }
  lastFocusedByPaneId.set(paneId, new WeakRef(element));
}

/** Asks the pane host to move DOM focus into this pane after the commit that focuses it. */
export function requestPaneFocusRestore(paneId: string): void {
  restorePaneId = paneId;
}

// The stock per-thread focus memory names the composer the same way (lib/terminalFocus.ts).
const COMPOSER_AREA_SELECTOR = '[data-workspace-area="composer"]';

/**
 * The terminal input of a short pane whose open drawer covers the timeline and the composer
 * (the `data-pane-short` drawer rules of panes.css). The covered composer takes no focus.
 */
export function coveringTerminalInput(cell: HTMLElement | null): HTMLElement | null {
  if (cell?.dataset.paneShort !== "true") return null;
  return cell.querySelector<HTMLElement>(
    '[data-thread-terminal-drawer][data-workspace-area="terminal"] textarea',
  );
}

/**
 * Runs after the commit that focuses the pane or mounts its thread. Focus goes to the pane's
 * last focused element, else to the terminal that covers its composer, else to its composer,
 * else to its empty view. A plain `focus()` on the prompt editor puts the caret at its start,
 * so the composer takes the caret at the end.
 */
export function restoreRequestedPaneFocus(
  focusedPaneId: string,
  showsThread: boolean,
  composer: ComposerHandleRef | null,
): void {
  const paneId = restorePaneId;
  if (paneId !== focusedPaneId) {
    restorePaneId = null;
    return;
  }
  const cell = document.querySelector<HTMLElement>(`[data-splitpane-cell="${paneId}"]`);
  if (cell === null) return;
  // A pane that waits for its draft keeps the request, for the commit that mounts the draft.
  if (showsThread) restorePaneId = null;
  const remembered = lastFocusedByPaneId.get(paneId)?.deref();
  const inPane = remembered !== undefined && cell.contains(remembered);
  if (inPane && remembered.closest(COMPOSER_AREA_SELECTOR) === null) remembered.focus();
  if (cell.contains(document.activeElement)) return;
  coveringTerminalInput(cell)?.focus({ preventScroll: true });
  if (cell.contains(document.activeElement)) return;
  if (showsThread) composer?.current?.focusAtEnd();
  else cell.querySelector<HTMLElement>("[data-pane-empty]")?.focus();
  // A browser pane has no composer: its own box takes the keyboard from the pane that had it.
  if (!cell.contains(document.activeElement)) {
    cell.querySelector<HTMLElement>("[data-pane-browser]")?.focus({ preventScroll: true });
  }
}

/**
 * One task after a press, the browser's own focus change is done. Focus that a keep-focus
 * control ("Scroll to end", the microphone) left in another pane moves into this pane. Focus on
 * the body is for the stock type-to-focus, except where a terminal covers the composer.
 */
export function claimPaneFocusAfterPress(
  paneId: string,
  showsThread: boolean,
  composer: ComposerHandleRef,
): void {
  window.setTimeout(() => {
    if (getActiveTab(usePaneStore.getState().layout).focusedPaneId !== paneId) return;
    const active = document.activeElement;
    if (active === null || active === document.body) {
      const cell = document.querySelector<HTMLElement>(`[data-splitpane-cell="${paneId}"]`);
      coveringTerminalInput(cell)?.focus({ preventScroll: true });
      return;
    }
    const activeCell = active.closest<HTMLElement>("[data-splitpane-cell]");
    if (activeCell === null || activeCell.dataset.splitpaneCell === paneId) return;
    restorePaneId = paneId;
    restoreRequestedPaneFocus(paneId, showsThread, composer);
  }, 0);
}

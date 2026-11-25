import type { ChatComposerHandle } from "../components/chat/ChatComposer";

export interface PaneFocusGuardDeps {
  /** Read from the pane store: the DOM attribute changes one commit later. */
  readonly getFocusedPaneId: () => string;
  readonly focusPane: (paneId: string) => void;
  /** The composer of the focused pane, or null when that pane has none. */
  readonly getComposer: () => ChatComposerHandle | null;
}

// The stock per-thread focus memory names the composer the same way (lib/terminalFocus.ts).
const COMPOSER_AREA_SELECTOR = '[data-workspace-area="composer"]';
const FRAME_SELECTOR = "iframe, webview";

function paneIdOf(node: Element): string | undefined {
  return node.closest<HTMLElement>("[data-splitpane-cell]")?.dataset.splitpaneCell;
}

/**
 * Keeps DOM focus out of passive panes. A pointer press focuses its pane before the press moves
 * DOM focus (see PaneCell), so the only focus that may enter a passive pane here is the one that
 * a plain Tab or F6 key moves, and then that pane becomes the focused pane. Focus that a passive
 * pane takes by itself, such as a thread view that focuses its composer on open, goes back.
 */
export function installPaneFocusGuard(deps: PaneFocusGuardDeps): () => void {
  // Set by the key press and used up by the first focus change after it. A timer alone is not
  // enough: a frame callback of a mounting pane can run before a timer of the same input.
  let keyMovesFocus = false;
  let resetTimer: number | undefined;
  const onKeyDown = (event: KeyboardEvent) => {
    const movesFocus = event.key === "Tab" || event.key === "F6";
    if (!movesFocus || event.metaKey || event.ctrlKey || event.altKey) return;
    keyMovesFocus = true;
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      keyMovesFocus = false;
    }, 0);
  };
  const isOutsidePassivePane = (node: Element) => {
    const paneId = paneIdOf(node);
    return paneId === undefined || paneId === deps.getFocusedPaneId();
  };
  const onFocusIn = (event: FocusEvent) => {
    const movedByKey = keyMovesFocus;
    keyMovesFocus = false;
    const target = event.target;
    if (!(target instanceof HTMLElement) || isOutsidePassivePane(target)) return;
    // Focus enters a frame only by a press or a key of the user, and the frame keeps the keys.
    if (movedByKey || target.matches(FRAME_SELECTOR)) {
      deps.focusPane(paneIdOf(target)!);
      return;
    }
    const previous = event.relatedTarget;
    const composer = deps.getComposer();
    // A plain `focus()` on the prompt editor puts the caret at its start.
    const previousIsComposer =
      previous instanceof HTMLElement && previous.closest(COMPOSER_AREA_SELECTOR) !== null;
    if (
      previous instanceof HTMLElement &&
      previous.isConnected &&
      isOutsidePassivePane(previous) &&
      !(previousIsComposer && composer !== null)
    ) {
      previous.focus();
      return;
    }
    if (composer === null) target.blur();
    // The editor keeps its caret while it has no focus, so text that the user types next goes
    // where the caret was. A composer that never had focus takes the caret at its end.
    else if (previousIsComposer) composer.focusAt(composer.readSnapshot().cursor);
    else composer.focusAtEnd();
  };
  // A press inside a frame sends no pointer event and no focus event to this document. The
  // window loses focus to the frame, and one task later the frame is the active element.
  let frameTimer: number | undefined;
  const onWindowBlur = () => {
    window.clearTimeout(frameTimer);
    frameTimer = window.setTimeout(() => {
      const frame = document.activeElement;
      if (!(frame instanceof HTMLElement) || !frame.matches(FRAME_SELECTOR)) return;
      const paneId = paneIdOf(frame);
      if (paneId !== undefined && paneId !== deps.getFocusedPaneId()) deps.focusPane(paneId);
    }, 0);
  };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("focusin", onFocusIn);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("focusin", onFocusIn);
    window.clearTimeout(resetTimer);
    window.clearTimeout(frameTimer);
  };
}

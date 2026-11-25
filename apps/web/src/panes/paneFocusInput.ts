import { TYPE_TO_FOCUS_FLOATING_LAYER_SELECTOR } from "../components/chat/composerFocusRedirect";
import type { ComposerHandleRef } from "../composerHandleContext";
import { isInSideChatPane } from "../lib/sideChatPane";
import { isInPassivePane } from "./paneDom";
import {
  coveringTerminalInput,
  requestPaneFocusRestore,
  restoreRequestedPaneFocus,
} from "./paneFocusMemory";
import { usePaneStore } from "./paneStore";
import { findLeaf, getActiveTab } from "./paneTree";

let appComposer: ComposerHandleRef | null = null;

/**
 * The pane host registers the app-wide composer handle here. The focused pane writes its
 * composer to that handle (`PaneCell`), also with one tab and one pane.
 */
export function registerFocusedComposer(handle: ComposerHandleRef | null): () => void {
  appComposer = handle;
  return () => {
    if (appComposer === handle) appComposer = null;
  };
}

/** The caret goes to the end of the prompt, as after the stock command palette closes. */
export function focusInputOfFocusedPane(): void {
  appComposer?.current?.focusAtEnd();
}

/**
 * DOM focus goes back into the focused pane, as after a pane key: to the element it last
 * focused, its covering terminal, its composer, its empty view or its browser box.
 */
export function returnFocusToFocusedPane(): void {
  const tab = getActiveTab(usePaneStore.getState().layout);
  requestPaneFocusRestore(tab.focusedPaneId);
  const showsThread = findLeaf(tab.root, tab.focusedPaneId)?.target != null;
  restoreRequestedPaneFocus(tab.focusedPaneId, showsThread, appComposer);
}

const FOCUSED_CELL_SELECTOR = '[data-splitpane-cell][data-pane-focused="true"]';
// Stock names the prompt editor this way for its own `composerFocus` key condition.
const COMPOSER_EDITOR_SELECTOR = '[data-testid="composer-editor"]';
// Stock makes the chat column inert while the maximized right panel hides it, the composer
// inert during a rewind, and the whole app inert behind the command palette.
const NO_FOCUS_SELECTOR = '[inert], [data-chat-column-maximized-away="true"]';
// The shell of the right panel, which the stock `previewFocus` condition reads.
const RIGHT_PANEL_SELECTOR = "[data-preview-panel-mode]";
// The field that the stock key `preview.focusUrl` focuses. Only a browser preview has one.
const PREVIEW_URL_FIELD_SELECTOR = "[data-preview-url-input]";

/**
 * True while focus is in a browser preview: in its page (a `webview` of the desktop app), or in
 * a right panel whose shown surface is a browser preview. The stock `isPreviewFocused` is true
 * for every surface of the right panel, so it cannot tell a preview from the file browser.
 */
export function isBrowserPreviewFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (active.tagName.toLowerCase() === "webview") return true;
  // The right panel mounts one surface at a time, so a URL field in it is the field of the
  // surface on show.
  return active.closest(RIGHT_PANEL_SELECTOR)?.querySelector(PREVIEW_URL_FIELD_SELECTOR) != null;
}

/** True while a modal dialog, a menu or a popup is open. Stock type-to-focus asks the same. */
export function isFloatingLayerOpen(): boolean {
  return document.querySelector(TYPE_TO_FOCUS_FLOATING_LAYER_SELECTOR) !== null;
}

/**
 * True when the focused pane shows a composer that can take the caret. False for an empty pane,
 * for a chat column that the maximized right panel hides, for a short pane whose open terminal
 * drawer covers the composer, and for an editor that stock disabled (a question with fixed
 * answers, for one). ProseMirror takes no focus then, and writes `contenteditable="false"`.
 */
export function focusedComposerShown(): boolean {
  if (appComposer?.current == null) return false;
  const cell = document.querySelector<HTMLElement>(FOCUSED_CELL_SELECTOR);
  if (cell === null || coveringTerminalInput(cell) !== null) return false;
  // A side chat in the right panel of the pane has a prompt editor of its own.
  const editor = Array.from(cell.querySelectorAll(COMPOSER_EDITOR_SELECTOR)).find(
    (candidate) => !isInSideChatPane(candidate),
  );
  return (
    editor !== undefined &&
    editor.getAttribute("contenteditable") === "true" &&
    editor.closest(NO_FOCUS_SELECTOR) === null
  );
}

/** True while the caret is in the composer of the focused pane, as stock `composerFocus`. */
export function caretInFocusedComposer(): boolean {
  const active = document.activeElement;
  return (
    active !== null &&
    active.matches(COMPOSER_EDITOR_SELECTOR) &&
    !isInSideChatPane(active) &&
    !isInPassivePane(active)
  );
}

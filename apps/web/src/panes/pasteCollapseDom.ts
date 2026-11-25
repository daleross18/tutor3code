import { isPasteAsTextShortcut } from "@t3tools/client-runtime/text-paste";
import type { TiptapEditorHTMLElement } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import { readPastedPlainText } from "../components/composerInlineTokenPaste";
import { DESKTOP_PASTE_AS_TEXT_EVENT } from "../lib/desktopPasteAsText";
import { isMacPlatform } from "../lib/utils";
import {
  PASTE_CHIP_KIND,
  expandPasteTokens,
  lookupPastedText,
  shouldCollapsePaste,
} from "./pasteCollapse";

const EDITOR_SELECTOR = '[data-testid="composer-editor"]';
export const CONTEXT_REFERENCE_NODE = "composer-context-reference";
// The stock composer arms its plain paste for the same time after the key or the menu action.
const PASTE_FOLLOWS_WITHIN_MS = 1_000;

let expanding = false;

/** True while a chip pastes its own text, so the composer's paste handlers stand down. */
export function isPasteChipExpanding(): boolean {
  return expanding;
}

/**
 * Replaces the chip that holds `chipElement` with its text. The text goes through the stock
 * paste of the editor, so it is parsed as a typed paste is, and one undo brings the chip back.
 */
export function expandPasteChip(chipElement: Element): boolean {
  const editor = chipElement.closest<TiptapEditorHTMLElement>(EDITOR_SELECTOR)?.editor;
  if (!editor?.isEditable) return false;
  let chip: { readonly pos: number; readonly id: string } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (chip !== null) return false;
    if (
      node.type.name === CONTEXT_REFERENCE_NODE &&
      node.attrs.kind === PASTE_CHIP_KIND &&
      editor.view.nodeDOM(pos)?.contains(chipElement)
    ) {
      chip = { pos, id: String(node.attrs.contextId) };
    }
    return true;
  });
  const found = chip as { readonly pos: number; readonly id: string } | null;
  const text = found === null ? undefined : lookupPastedText(found.id);
  if (found === null || text === undefined) return false;
  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", text);
  const paste = new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true });
  // A browser that drops the data of a scripted paste would replace the chip with nothing.
  if (paste.clipboardData?.getData("text/plain") !== text) return false;
  editor.view.focus();
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, found.pos)),
  );
  expanding = true;
  try {
    editor.view.dom.dispatchEvent(paste);
  } finally {
    expanding = false;
  }
  return true;
}

function isInComposerEditor(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const element = target instanceof Element ? target : target.parentElement;
  return element?.closest(EDITOR_SELECTOR) != null;
}

/** A copy or a cut of a chip puts its text on the clipboard, as the provider would read it. */
function expandCopiedPasteChips(event: ClipboardEvent): void {
  const clipboardData = event.clipboardData;
  if (!clipboardData || !isInComposerEditor(event.target)) return;
  const copied = clipboardData.getData("text/plain");
  const { prompt, ranges } = expandPasteTokens(copied, lookupPastedText);
  if (ranges.length > 0) clipboardData.setData("text/plain", prompt);
}

let plainPasteUntil = 0;
let redirectedPaste: { readonly text: string; readonly at: number } | null = null;

/** True once for a paste that follows the plain-paste key (Cmd+Shift+V) or its menu action. */
export function consumePlainPaste(): boolean {
  const armed = Date.now() <= plainPasteUntil;
  plainPasteUntil = 0;
  return armed;
}

/**
 * Stock sends a paste with no editable target to the end of the composer as a prompt edit, not
 * as a paste in the editor. Returns that text once, when the prompt grew by exactly it.
 */
export function takeRedirectedPaste(previousPrompt: string, prompt: string): string | null {
  const paste = redirectedPaste;
  if (paste === null || Date.now() - paste.at > PASTE_FOLLOWS_WITHIN_MS) return null;
  if (prompt !== previousPrompt + paste.text) return null;
  redirectedPaste = null;
  return paste.text;
}

const armPlainPaste = () => {
  plainPasteUntil = Date.now() + PASTE_FOLLOWS_WITHIN_MS;
};
const disarmPlainPaste = () => {
  plainPasteUntil = 0;
};
const onKeyDown = (event: KeyboardEvent) => {
  if (isPasteAsTextShortcut(event, isMacPlatform(navigator.platform))) armPlainPaste();
};
const onWindowPaste = (event: ClipboardEvent) => {
  // A paste in an editor reaches the editor's own paste handler.
  if (isInComposerEditor(event.target) || !event.clipboardData) return;
  if (consumePlainPaste() || event.clipboardData.files.length > 0) return;
  const text = readPastedPlainText(event.clipboardData);
  redirectedPaste = shouldCollapsePaste(text) ? { text, at: Date.now() } : null;
};

let installs = 0;

/** Window listeners shared by every collapsing editor. Returns the removal. */
export function installPasteCollapseListeners(): () => void {
  installs += 1;
  if (installs === 1) {
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(DESKTOP_PASTE_AS_TEXT_EVENT, armPlainPaste, true);
    window.addEventListener("blur", disarmPlainPaste);
    window.addEventListener("paste", onWindowPaste, true);
    // Bubble phase: the stock editor writes the clipboard in the capture phase.
    document.addEventListener("copy", expandCopiedPasteChips);
    document.addEventListener("cut", expandCopiedPasteChips);
  }
  return () => {
    installs -= 1;
    if (installs > 0) return;
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener(DESKTOP_PASTE_AS_TEXT_EVENT, armPlainPaste, true);
    window.removeEventListener("blur", disarmPlainPaste);
    window.removeEventListener("paste", onWindowPaste, true);
    document.removeEventListener("copy", expandCopiedPasteChips);
    document.removeEventListener("cut", expandCopiedPasteChips);
  };
}

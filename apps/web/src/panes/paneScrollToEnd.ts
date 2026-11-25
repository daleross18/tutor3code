/** Where the caret of a focused text field is. */
export interface TextFocus {
  /** False while a range of text is selected. */
  readonly collapsed: boolean;
  /** True when text, a chip or one more line comes after the caret. */
  readonly contentAfterCaret: boolean;
}

/**
 * True when the scroll key belongs to the text field: the native key moves the caret to the end
 * of the text, so the chat scrolls only when the caret is there, or when no text field has focus.
 */
export function scrollKeyStaysInText(focus: TextFocus | null): boolean {
  return focus !== null && (!focus.collapsed || focus.contentAfterCaret);
}

/** The caret of an `input` or a `textarea`, from its selection offsets. */
export function textFocusOfValue(
  valueLength: number,
  selectionStart: number | null,
  selectionEnd: number | null,
): TextFocus {
  // An input type with no selection (a checkbox, a number field in some browsers) has no caret.
  if (selectionStart === null || selectionEnd === null) {
    return { collapsed: true, contentAfterCaret: false };
  }
  return {
    collapsed: selectionStart === selectionEnd,
    contentAfterCaret: selectionEnd < valueLength,
  };
}

// A line break that the editor adds to keep an empty line open is not text.
const FILLER_BREAK_SELECTOR = "br.ProseMirror-trailingBreak";
// A chip, an image or a real line break after the caret is content with no text of its own.
const ATOM_SELECTOR = `[contenteditable="false"], img, br:not(${FILLER_BREAK_SELECTOR})`;

/** The caret of a `contenteditable` element, such as the composer. */
function textFocusOfEditable(root: HTMLElement): TextFocus | null {
  const selection = root.ownerDocument.getSelection();
  const focusNode = selection?.focusNode ?? null;
  if (selection === null || focusNode === null || !root.contains(focusNode)) return null;
  if (!selection.isCollapsed) return { collapsed: false, contentAfterCaret: true };
  const rest = root.ownerDocument.createRange();
  rest.setStart(focusNode, selection.focusOffset);
  rest.setEnd(root, root.childNodes.length);
  const after = rest.cloneContents();
  return {
    collapsed: true,
    contentAfterCaret:
      (after.textContent ?? "").length > 0 ||
      after.querySelector(ATOM_SELECTOR) !== null ||
      // The first child is the rest of the caret's own line. One more child is one more line.
      after.childElementCount > 1,
  };
}

/** Null when `element` is no text field, so the key is free. */
export function readTextFocus(element: Element | null): TextFocus | null {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return textFocusOfValue(element.value.length, element.selectionStart, element.selectionEnd);
  }
  return element instanceof HTMLElement && element.isContentEditable
    ? textFocusOfEditable(element)
    : null;
}

let focusedScrollToEnd: (() => void) | null = null;

/** The chat view of the focused pane registers its stock "scroll to end" here. */
export function registerFocusedScrollToEnd(scrollToEnd: () => void): () => void {
  focusedScrollToEnd = scrollToEnd;
  return () => {
    if (focusedScrollToEnd === scrollToEnd) focusedScrollToEnd = null;
  };
}

export function scrollFocusedPaneToEnd(): void {
  focusedScrollToEnd?.();
}

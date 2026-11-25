// A chat of a side chat or a pane cell. A selection goes to the input of the same chat.
const SCOPE_SELECTOR = "[data-side-chat-pane], [data-splitpane-cell]";
const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable="true"], [contenteditable=""], [data-chat-composer-form]';
const PREVIEW_LENGTH = 100;

export interface SelectionOffer {
  readonly text: string;
  readonly scope: Element;
}

function elementOf(node: Node | null): Element | null {
  if (node === null) return null;
  return node instanceof Element ? node : node.parentElement;
}

export function selectionScopeOf(node: Node | null): Element | null {
  return elementOf(node)?.closest(SCOPE_SELECTOR) ?? null;
}

/** The selected text of a chat, or null for no text, for text in a field, or across two chats. */
export function selectionOfferOf(selection: Selection | null): SelectionOffer | null {
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  const common = elementOf(selection.getRangeAt(0).commonAncestorContainer);
  if (common === null || common.closest(EDITABLE_SELECTOR) !== null) return null;
  const scope = selectionScopeOf(common);
  const text = selection.toString().trim();
  return scope === null || text.length === 0 ? null : { text, scope };
}

/** True when the caret is in a field of the input of the chat `scope`, as after a click in it. */
export function caretIsInInputOf(selection: Selection | null, scope: Element): boolean {
  const node = elementOf(selection?.anchorNode ?? null);
  return (
    node !== null &&
    node.closest("[data-chat-composer-form]") !== null &&
    selectionScopeOf(node) === scope
  );
}

export function selectionPreview(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return `“${line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH - 1)}…` : line}”`;
}

/** The text to add at the end of `prompt`: on a new line when the prompt has text. */
export function appendedText(prompt: string, text: string): string {
  return prompt.length === 0 || prompt.endsWith("\n") ? text : `\n${text}`;
}

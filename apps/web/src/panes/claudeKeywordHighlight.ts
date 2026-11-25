import "./claudeKeywords.css";

import {
  KEYWORD_TEXT_BREAK,
  findClaudeKeywordRanges,
  mayHoldClaudeKeyword,
} from "./claudeKeywords";

export const CLAUDE_KEYWORD_HIGHLIGHT = "fork-claude-keyword";

export const supportsClaudeKeywordHighlight =
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

const EDITOR_SELECTOR = '[data-testid="composer-editor"]';
// A code span, a code block, and a chip or another node that the editor does not edit as text.
const NOT_PROMPT_TEXT_SELECTOR = 'code, pre, [contenteditable="false"]';
// The marks of the stock editor, and its shown Markdown source. Any other element ends a line.
const INLINE_TAGS = new Set(["SPAN", "STRONG", "EM", "S", "B", "I", "U", "DEL", "MARK", "A"]);

/** One DOM range for each keyword of the editor. A word can lie in more than one text node. */
function keywordDomRanges(editor: Element): Array<Range> {
  // Most prompts hold no keyword. This skips the walk below on each key of such a prompt.
  if (!mayHoldClaudeKeyword(editor.textContent ?? "")) return [];
  let text = "";
  const nodes: Array<{ readonly node: Text; readonly start: number }> = [];
  const visit = (node: Node) => {
    if (node instanceof Text) {
      nodes.push({ node, start: text.length });
      text += node.data;
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.matches(NOT_PROMPT_TEXT_SELECTOR)) {
      text += KEYWORD_TEXT_BREAK;
      return;
    }
    const lineBreak = INLINE_TAGS.has(node.tagName) ? "" : "\n";
    text += lineBreak;
    for (const child of node.childNodes) visit(child);
    text += lineBreak;
  };
  for (const child of editor.childNodes) visit(child);
  return findClaudeKeywordRanges(text).flatMap(({ start, end }) => {
    const first = nodes.findLast((entry) => entry.start <= start);
    const last = nodes.findLast((entry) => entry.start < end);
    if (!first || !last) return [];
    const range = editor.ownerDocument.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return [range];
  });
}

/** Every composer adds its ranges to the one highlight that claudeKeywords.css styles. */
function keywordHighlight(): Highlight {
  const registered = CSS.highlights.get(CLAUDE_KEYWORD_HIGHLIGHT);
  if (registered) return registered;
  const highlight = new Highlight();
  CSS.highlights.set(CLAUDE_KEYWORD_HIGHLIGHT, highlight);
  return highlight;
}

/**
 * Styles each keyword of the editor in `container`, and again after each change of its text,
 * until the returned function runs. It adds nothing to the DOM and nothing to the document.
 */
export function styleClaudeKeywordsIn(container: Element): () => void {
  const highlight = keywordHighlight();
  let ranges: Array<Range> = [];
  const paint = () => {
    for (const range of ranges) highlight.delete(range);
    const editor = container.querySelector(EDITOR_SELECTOR);
    ranges = editor ? keywordDomRanges(editor) : [];
    for (const range of ranges) highlight.add(range);
  };
  // The observer runs before the next paint, so a word has its style in the frame of its last letter.
  const observer = new MutationObserver(paint);
  observer.observe(container, { subtree: true, childList: true, characterData: true });
  paint();
  return () => {
    observer.disconnect();
    for (const range of ranges) highlight.delete(range);
  };
}

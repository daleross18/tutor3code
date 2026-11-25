import type { ProviderDriverKind } from "@t3tools/contracts";

/** Stands in the text of the rule for a chip or a code element of the editor: it ends a word. */
export const KEYWORD_TEXT_BREAK = "\uFFFC";

// Claude Code reads these words in a prompt: "ultracode" starts its multi-agent mode for the
// message. Stock finds "ultrathink" with the same rule (isClaudeUltrathinkPrompt).
const KEYWORDS = "ultracode|ultrathink";
const CLAUDE_KEYWORD = new RegExp(`\\b(?:${KEYWORDS})\\b`, "gi");
const KEYWORD_LETTERS = new RegExp(KEYWORDS, "i");

/** False when `text` holds the letters of no keyword, so the caller can skip the search. */
export function mayHoldClaudeKeyword(text: string): boolean {
  return KEYWORD_LETTERS.test(text);
}

interface KeywordRange {
  readonly start: number;
  readonly end: number;
}

/** Only a Claude provider reads the keywords, whichever provider instance of it is selected. */
export function isClaudeKeywordProvider(provider: ProviderDriverKind | undefined): boolean {
  return provider === "claudeAgent";
}

// The fence forms of the stock editor (parseOpeningFence, isClosingFence). Written again here,
// because that module loads the whole editor, which a rule on plain text must not need.
const OPENING_FENCE = /^(`{3,}|~{3,})([^\n]*)$/;
const CLOSING_FENCE = /^(`{3,}|~{3,})[ \t]*\r?$/;

function openingFence(line: string): string | null {
  const match = OPENING_FENCE.exec(line);
  if (!match) return null;
  return match[1]!.startsWith("`") && match[2]!.includes("`") ? null : match[1]!;
}

function closesFence(line: string, fence: string): boolean {
  const run = CLOSING_FENCE.exec(line)?.[1];
  return run !== undefined && run[0] === fence[0] && run.length >= fence.length;
}

/** The Markdown code of `text`: fenced blocks, and backtick spans that close on their own line. */
function markdownCodeRanges(text: string): ReadonlyArray<KeywordRange> {
  const ranges: Array<KeywordRange> = [];
  let open: { readonly fence: string; readonly start: number } | null = null;
  let start = 0;
  for (const line of text.split("\n")) {
    const end = start + line.length;
    if (open !== null) {
      if (closesFence(line, open.fence)) {
        ranges.push({ start: open.start, end });
        open = null;
      }
    } else {
      const fence = openingFence(line);
      if (fence !== null) {
        open = { fence, start };
      } else {
        const ticks = [...line.matchAll(/`+/g)];
        for (let index = 0; index < ticks.length; index += 1) {
          const opener = ticks[index]!;
          const closerIndex = ticks.findIndex(
            (run, runIndex) => runIndex > index && run[0].length === opener[0].length,
          );
          if (closerIndex === -1) continue;
          const closer = ticks[closerIndex]!;
          ranges.push({
            start: start + opener.index,
            end: start + closer.index + closer[0].length,
          });
          index = closerIndex;
        }
      }
    }
    start = end + 1;
  }
  // A fence with no closing line holds the rest of the text.
  if (open !== null) ranges.push({ start: open.start, end: text.length });
  return ranges;
}

/**
 * Each whole word "ultracode" or "ultrathink" of `text`, in any letter case, that is not in
 * Markdown code. `text` has a line break between two blocks of the editor.
 */
export function findClaudeKeywordRanges(text: string): ReadonlyArray<KeywordRange> {
  const words = [...text.matchAll(CLAUDE_KEYWORD)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  if (words.length === 0) return words;
  const code = markdownCodeRanges(text);
  return words.filter((word) => !code.some((c) => c.start < word.end && word.start < c.end));
}

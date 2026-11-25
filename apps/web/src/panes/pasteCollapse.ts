import type { ComposerContextId } from "@t3tools/contracts";
import {
  collectComposerContextReferences,
  formatComposerContextReference,
} from "@t3tools/shared/composerContextReferences";

// The Claude Code CLI folds a paste at about this size: more than 10 lines, or more than
// 1000 characters on fewer lines.
export const PASTE_COLLAPSE_MIN_LINES = 10;
export const PASTE_COLLAPSE_MIN_CHARS = 1000;

/** A kind no stock record has, so the stock composer registry sends it to its fallback. */
export const PASTE_CHIP_KIND = "fork-paste";

function countPastedLines(text: string): number {
  return text.length === 0 ? 0 : text.replace(/\n$/, "").split("\n").length;
}

export function shouldCollapsePaste(text: string): boolean {
  return (
    text.length > PASTE_COLLAPSE_MIN_CHARS || countPastedLines(text) > PASTE_COLLAPSE_MIN_LINES
  );
}

export function pastedTextLabel(text: string): string {
  const lines = countPastedLines(text);
  return `Pasted text · ${lines} ${lines === 1 ? "line" : "lines"}`;
}

function fnv1a(text: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** The same text gives the same id, so a second paste of it finds the chip of the first. */
export function pastedTextId(text: string): string {
  return `${text.length.toString(36)}-${fnv1a(text, 0x811c9dc5)}-${fnv1a(text, 0x9dc5811c)}`;
}

/** The chip as the stock composer reads it: a context reference of the fork's own kind. */
export function pastedTextToken(text: string): string {
  return formatComposerContextReference({
    kind: PASTE_CHIP_KIND,
    contextId: pastedTextId(text) as ComposerContextId,
    label: pastedTextLabel(text),
  });
}

/**
 * One collapsed paste. `start` and `end` are offsets in the full prompt, which is the text that
 * every stock reader and the provider receive. `token` stands for that span in the editor only.
 */
export interface PasteRange {
  readonly start: number;
  readonly end: number;
  readonly id: string;
  readonly token: string;
}

/** Puts the full text back at each chip. A chip with no known text stays as it is written. */
export function expandPasteTokens(
  editorValue: string,
  lookup: (id: string) => string | undefined,
): { readonly prompt: string; readonly ranges: ReadonlyArray<PasteRange> } {
  const ranges: PasteRange[] = [];
  let prompt = "";
  let consumed = 0;
  for (const occurrence of collectComposerContextReferences(editorValue)) {
    if (occurrence.kind !== PASTE_CHIP_KIND || occurrence.start < consumed) continue;
    const text = lookup(occurrence.contextId);
    if (text === undefined) continue;
    prompt += editorValue.slice(consumed, occurrence.start);
    ranges.push({
      start: prompt.length,
      end: prompt.length + text.length,
      id: occurrence.contextId,
      token: occurrence.source,
    });
    prompt += text;
    consumed = occurrence.end;
  }
  return ranges.length === 0
    ? { prompt: editorValue, ranges }
    : { prompt: prompt + editorValue.slice(consumed), ranges };
}

/** The editor's text for a prompt: each collapsed span becomes its chip. */
export function collapsePasteRanges(prompt: string, ranges: ReadonlyArray<PasteRange>): string {
  if (ranges.length === 0) return prompt;
  let editorValue = "";
  let consumed = 0;
  for (const range of ranges) {
    editorValue += prompt.slice(consumed, range.start) + range.token;
    consumed = range.end;
  }
  return editorValue + prompt.slice(consumed);
}

/**
 * Keeps the chips that a stock edit of the prompt did not touch. A span stays only when it lies
 * in the unchanged start or the unchanged end of the prompt, so a kept chip still holds its text.
 */
export function carryPasteRanges(
  previousPrompt: string,
  nextPrompt: string,
  ranges: ReadonlyArray<PasteRange>,
): ReadonlyArray<PasteRange> {
  if (ranges.length === 0 || previousPrompt === nextPrompt) return ranges;
  const shortest = Math.min(previousPrompt.length, nextPrompt.length);
  let prefix = 0;
  while (prefix < shortest && previousPrompt[prefix] === nextPrompt[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    previousPrompt[previousPrompt.length - 1 - suffix] ===
      nextPrompt[nextPrompt.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const shift = nextPrompt.length - previousPrompt.length;
  return ranges.flatMap((range) => {
    if (range.end <= prefix) return [range];
    if (range.start >= previousPrompt.length - suffix) {
      return [{ ...range, start: range.start + shift, end: range.end + shift }];
    }
    return [];
  });
}

/** An offset inside a collapsed span has no place in the editor, so it moves behind the chip. */
export function promptOffsetToEditor(offset: number, ranges: ReadonlyArray<PasteRange>): number {
  let hidden = 0;
  for (const range of ranges) {
    if (offset <= range.start) break;
    if (offset < range.end) return range.start - hidden + range.token.length;
    hidden += range.end - range.start - range.token.length;
  }
  return offset - hidden;
}

export function editorOffsetToPrompt(offset: number, ranges: ReadonlyArray<PasteRange>): number {
  let hidden = 0;
  for (const range of ranges) {
    const chipStart = range.start - hidden;
    if (offset <= chipStart) break;
    if (offset < chipStart + range.token.length) return range.end;
    hidden += range.end - range.start - range.token.length;
  }
  return offset + hidden;
}

/** What is saved for a chip. The text itself is saved once, by the stock draft store. */
export type StoredPasteRange = readonly [start: number, end: number, id: string];

/** A saved span counts only while the prompt still holds the same text there. */
export function restorePasteRanges(
  prompt: string,
  stored: ReadonlyArray<StoredPasteRange>,
): ReadonlyArray<PasteRange> {
  const ranges: PasteRange[] = [];
  let consumed = 0;
  for (const [start, end, id] of stored.toSorted((left, right) => left[0] - right[0])) {
    if (start < consumed || end <= start || end > prompt.length) continue;
    const text = prompt.slice(start, end);
    if (pastedTextId(text) !== id) continue;
    ranges.push({ start, end, id, token: pastedTextToken(text) });
    consumed = end;
  }
  return ranges;
}

// Undo can bring back a chip whose text left the prompt, so a text is kept for the session.
const pastedTexts = new Map<string, string>();

export function rememberPastedText(text: string): string {
  const id = pastedTextId(text);
  pastedTexts.set(id, text);
  return id;
}

export function lookupPastedText(id: string): string | undefined {
  return pastedTexts.get(id);
}

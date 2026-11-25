import { PASTED_TEXT_ATTACHMENT_THRESHOLD_BYTES } from "@t3tools/client-runtime/text-paste";
import { describe, expect, it } from "vite-plus/test";

import { collapseExpandedComposerCursor, expandCollapsedComposerCursor } from "../composer-logic";
import { splitPromptIntoComposerSegments } from "../composer-editor-mentions";
import { searchSettings } from "../components/settings/settingsSearch";
import { createMemoryStorage } from "../lib/storage";
import {
  PASTE_CHIP_KIND,
  PASTE_COLLAPSE_MIN_CHARS,
  PASTE_COLLAPSE_MIN_LINES,
  carryPasteRanges,
  collapsePasteRanges,
  editorOffsetToPrompt,
  expandPasteTokens,
  lookupPastedText,
  pastedTextId,
  pastedTextLabel,
  pastedTextToken,
  promptOffsetToEditor,
  rememberPastedText,
  restorePasteRanges,
  shouldCollapsePaste,
  type PasteRange,
} from "./pasteCollapse";
import {
  PASTE_CHIPS_STORAGE_KEY,
  PASTE_COLLAPSE_SETTINGS_STORAGE_KEY,
  createPasteChipStore,
  createPasteCollapseSettingsStore,
  resolvePasteChipView,
  sanitizeSavedPasteChips,
  usePasteCollapseSettingsStore,
} from "./pasteCollapseStore";

const lines = (count: number) =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n");

const LOG = lines(12);
const DIFF = `diff --git a/x b/x\n${lines(40)}`;

/** A prompt with the given texts collapsed, built the way the editor reports it. */
function promptWithChips(parts: ReadonlyArray<string | { readonly paste: string }>) {
  const editorValue = parts
    .map((part) => {
      if (typeof part === "string") return part;
      rememberPastedText(part.paste);
      return pastedTextToken(part.paste);
    })
    .join("");
  return { editorValue, ...expandPasteTokens(editorValue, lookupPastedText) };
}

describe("paste collapse thresholds", () => {
  it.each([
    ["10 short lines", lines(PASTE_COLLAPSE_MIN_LINES), false],
    ["11 short lines", lines(PASTE_COLLAPSE_MIN_LINES + 1), true],
    ["10 lines and a final newline", `${lines(PASTE_COLLAPSE_MIN_LINES)}\n`, false],
    ["1000 characters on one line", "x".repeat(PASTE_COLLAPSE_MIN_CHARS), false],
    ["1001 characters on one line", "x".repeat(PASTE_COLLAPSE_MIN_CHARS + 1), true],
    ["no text", "", false],
  ])("%s", (_name, text, collapses) => {
    expect(shouldCollapsePaste(text)).toBe(collapses);
  });

  it("starts below the size at which stock attaches a paste as a file", () => {
    expect(PASTE_COLLAPSE_MIN_CHARS).toBeLessThan(PASTED_TEXT_ATTACHMENT_THRESHOLD_BYTES);
  });

  it("labels the chip with the line count", () => {
    expect(pastedTextLabel(LOG)).toBe("Pasted text · 12 lines");
    expect(pastedTextLabel(`${LOG}\n`)).toBe("Pasted text · 12 lines");
    expect(pastedTextLabel("x".repeat(2000))).toBe("Pasted text · 1 line");
  });
});

describe("paste chip token", () => {
  it("is a context reference that the stock composer shows as one chip", () => {
    const token = pastedTextToken(LOG);
    expect(splitPromptIntoComposerSegments(`see ${token} please`)).toEqual([
      { type: "text", text: "see " },
      {
        type: "context-reference",
        kind: PASTE_CHIP_KIND,
        contextId: pastedTextId(LOG),
        label: "Pasted text · 12 lines",
        source: token,
      },
      { type: "text", text: " please" },
    ]);
  });

  it("gives the same text the same id, and another text another id", () => {
    expect(pastedTextId(LOG)).toBe(pastedTextId(lines(12)));
    expect(pastedTextId(LOG)).not.toBe(pastedTextId(`${LOG} `));
    expect(pastedTextId(LOG)).not.toBe(pastedTextId(LOG.replace("line 3", "line 4")));
  });
});

describe("prompt and editor text", () => {
  it("puts the full text at the place of each chip, and builds the editor text back", () => {
    const { editorValue, prompt, ranges } = promptWithChips([
      "before ",
      { paste: LOG },
      " between ",
      { paste: DIFF },
      " after",
    ]);
    expect(prompt).toBe(`before ${LOG} between ${DIFF} after`);
    expect(ranges.map((range) => prompt.slice(range.start, range.end))).toEqual([LOG, DIFF]);
    expect(collapsePasteRanges(prompt, ranges)).toBe(editorValue);
    expect(editorValue).not.toContain("line 5");
  });

  it("leaves a chip with no known text as it is written", () => {
    const unknown = pastedTextToken("a text that was never pasted in this session");
    expect(expandPasteTokens(`a ${unknown} b`, lookupPastedText)).toEqual({
      prompt: `a ${unknown} b`,
      ranges: [],
    });
  });

  it("maps an offset across the chips in both directions", () => {
    const { editorValue, prompt, ranges } = promptWithChips(["ab", { paste: LOG }, "cd"]);
    const chipEnd = editorValue.length - 2;
    expect(editorOffsetToPrompt(1, ranges)).toBe(1);
    expect(editorOffsetToPrompt(2, ranges)).toBe(2);
    expect(editorOffsetToPrompt(chipEnd, ranges)).toBe(2 + LOG.length);
    expect(editorOffsetToPrompt(editorValue.length, ranges)).toBe(prompt.length);
    expect(promptOffsetToEditor(2, ranges)).toBe(2);
    expect(promptOffsetToEditor(2 + LOG.length, ranges)).toBe(chipEnd);
    expect(promptOffsetToEditor(prompt.length, ranges)).toBe(editorValue.length);
    // An offset inside the pasted text has no place in the editor.
    expect(promptOffsetToEditor(10, ranges)).toBe(chipEnd);
    expect(editorOffsetToPrompt(5, ranges)).toBe(2 + LOG.length);
  });

  it("keeps the stock collapsed cursor in step with the editor's own cursor", () => {
    const { editorValue, prompt, ranges } = promptWithChips(["ab ", { paste: LOG }, " cd"]);
    for (let cursor = 0; cursor <= 7; cursor += 1) {
      const promptCursor = collapseExpandedComposerCursor(
        prompt,
        editorOffsetToPrompt(expandCollapsedComposerCursor(editorValue, cursor), ranges),
      );
      const back = collapseExpandedComposerCursor(
        editorValue,
        promptOffsetToEditor(expandCollapsedComposerCursor(prompt, promptCursor), ranges),
      );
      expect(back).toBe(cursor);
    }
  });
});

describe("chips after a stock edit of the prompt", () => {
  const { prompt, ranges } = promptWithChips(["ab ", { paste: LOG }, " cd ", { paste: DIFF }]);
  const texts = (next: string, kept: ReadonlyArray<PasteRange>) =>
    kept.map((range) => next.slice(range.start, range.end));

  it.each([
    ["text added at the end", `${prompt} and more`, [LOG, DIFF]],
    ["text added at the start", `first ${prompt}`, [LOG, DIFF]],
    ["text added between the chips", prompt.replace(" cd ", " cd, ef "), [LOG, DIFF]],
    ["an edit inside the first pasted text", prompt.replace("line 3\n", "line three\n"), [DIFF]],
    ["the prompt cleared by a send", "", []],
    ["another prompt", "something else", []],
  ])("%s", (_name, next, expected) => {
    expect(texts(next, carryPasteRanges(prompt, next, ranges))).toEqual(expected);
  });
});

describe("saved chips", () => {
  it("restores a chip only while the prompt still holds its text at that place", () => {
    const { prompt, ranges } = promptWithChips(["ab ", { paste: LOG }, " cd"]);
    const stored = ranges.map((range) => [range.start, range.end, range.id] as const);
    expect(restorePasteRanges(prompt, stored)).toEqual(ranges);
    expect(restorePasteRanges(`x${prompt}`, stored)).toEqual([]);
    expect(restorePasteRanges(prompt.replace("line 3", "line 4"), stored)).toEqual([]);
    expect(restorePasteRanges("short", stored)).toEqual([]);
  });

  it("saves the place of each chip, not its text, and reads it in a new store", () => {
    const storage = createMemoryStorage();
    const { prompt, ranges } = promptWithChips(["ab ", { paste: LOG }, " cd"]);
    createPasteChipStore(storage).getState().record("draft-1", { prompt, ranges, cursor: null });
    const saved = storage.getItem(PASTE_CHIPS_STORAGE_KEY) as string;
    expect(saved).not.toContain("line 5");
    expect(JSON.parse(saved).state).toEqual({
      drafts: { "draft-1": [[3, 3 + LOG.length, pastedTextId(LOG)]] },
    });

    const restored = createPasteChipStore(storage).getState().entries["draft-1"];
    expect(resolvePasteChipView(prompt, restored)).toMatchObject({ source: "restored", ranges });
    expect(resolvePasteChipView(`x${prompt}`, restored).ranges).toEqual([]);
  });

  it.each([
    ["nothing stored", null],
    ["a value that is not an object", "chips"],
    ["drafts of another shape", { drafts: { a: "x", b: [[1, "2", 3]], c: [] } }],
  ])("drops %s", (_name, stored) => {
    expect(sanitizeSavedPasteChips(stored)).toEqual({});
  });
});

describe("paste chip store", () => {
  it("finds the chips by prompt, and carries them to a prompt it does not know", () => {
    const store = createPasteChipStore(createMemoryStorage());
    const first = promptWithChips(["ab ", { paste: LOG }]);
    const second = promptWithChips(["ab ", { paste: LOG }, " cd"]);
    const record = (state: { prompt: string; ranges: ReadonlyArray<PasteRange> }) =>
      store.getState().record("draft-1", { ...state, cursor: null });
    const view = (prompt: string) =>
      resolvePasteChipView(prompt, store.getState().entries["draft-1"]);

    expect(view(first.prompt)).toMatchObject({ source: "none", ranges: [] });
    record(first);
    record(second);
    expect(view(second.prompt)).toMatchObject({ source: "newest", ranges: second.ranges });
    expect(view(first.prompt)).toMatchObject({ source: "recent", ranges: first.ranges });
    expect(view(`${second.prompt} ef`)).toMatchObject({ source: "carried", ranges: second.ranges });
    expect(view("").ranges).toEqual([]);
  });

  it("forgets a draft with no chip left, after the edit that removed the last one", () => {
    const store = createPasteChipStore(createMemoryStorage());
    const { prompt, ranges } = promptWithChips(["ab ", { paste: LOG }]);
    store.getState().record("draft-1", { prompt, ranges, cursor: null });
    store.getState().record("draft-1", { prompt: "ab ", ranges: [], cursor: null });
    // The prompt before the edit can still reach a render, so its chips stay findable.
    expect(resolvePasteChipView(prompt, store.getState().entries["draft-1"]).ranges).toEqual(
      ranges,
    );
    store.getState().record("draft-1", { prompt: "ab c", ranges: [], cursor: null });
    expect(store.getState().entries).toEqual({});
  });

  it("keeps the newest 200 drafts", () => {
    const store = createPasteChipStore(createMemoryStorage());
    const { prompt, ranges } = promptWithChips([{ paste: LOG }]);
    for (let index = 0; index < 205; index += 1) {
      store.getState().record(`draft-${index}`, { prompt, ranges, cursor: null });
    }
    const keys = Object.keys(store.getState().entries);
    expect(keys).toHaveLength(200);
    expect(keys[0]).toBe("draft-5");
    expect(keys.at(-1)).toBe("draft-204");
  });
});

describe("collapse long pastes setting", () => {
  it("is off by default, in the fork's own storage key", () => {
    expect(usePasteCollapseSettingsStore.getState().collapseLongPastes).toBe(false);
    expect(usePasteCollapseSettingsStore.persist.getOptions()).toMatchObject({
      name: "t3code-fork:paste-collapse:v1",
      version: 1,
    });
  });

  it("restores the value in a new store on the same storage", () => {
    const storage = createMemoryStorage();
    createPasteCollapseSettingsStore(storage).getState().setCollapseLongPastes(true);
    expect(
      JSON.parse(storage.getItem(PASTE_COLLAPSE_SETTINGS_STORAGE_KEY) as string).state,
    ).toEqual({ collapseLongPastes: true });
    expect(createPasteCollapseSettingsStore(storage).getState().collapseLongPastes).toBe(true);
  });

  it("stays off for a stored value that is not true", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      PASTE_COLLAPSE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { collapseLongPastes: "yes" }, version: 1 }),
    );
    expect(createPasteCollapseSettingsStore(storage).getState().collapseLongPastes).toBe(false);
  });

  it("is found by the settings search", () => {
    expect(searchSettings("collapse long pastes")[0]).toMatchObject({
      id: "collapse-long-pastes",
      to: "/settings/appearance",
    });
  });
});

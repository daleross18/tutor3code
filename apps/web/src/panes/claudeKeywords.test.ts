import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  KEYWORD_TEXT_BREAK,
  findClaudeKeywordRanges,
  isClaudeKeywordProvider,
  mayHoldClaudeKeyword,
} from "./claudeKeywords";

/** The words that the rule found, as text. */
const found = (text: string) =>
  findClaudeKeywordRanges(text).map((range) => text.slice(range.start, range.end));

describe("findClaudeKeywordRanges", () => {
  it("gives the place of the word in the prompt", () => {
    expect(findClaudeKeywordRanges("run this with ultracode please")).toEqual([
      { start: 14, end: 23 },
    ]);
    expect(findClaudeKeywordRanges("run this please")).toEqual([]);
  });

  it.each([
    [
      "any letter case",
      "Ultracode, ULTRACODE and uLtRaCoDe",
      ["Ultracode", "ULTRACODE", "uLtRaCoDe"],
    ],
    [
      "several hits, also on other lines",
      "ultracode\nultrathink ultracode",
      ["ultracode", "ultrathink", "ultracode"],
    ],
    [
      "punctuation ends a word",
      "(ultracode). ultracode: ultracode!",
      ["ultracode", "ultracode", "ultracode"],
    ],
    ["a longer word is no hit", "ultracoder ultracodes xultracode ultracode_mode ultracode2", []],
    ["a part of the word is no hit", "ultra code, ultracod", []],
    [
      "a chip ends a word",
      `ultra${KEYWORD_TEXT_BREAK}code ${KEYWORD_TEXT_BREAK}ultracode`,
      ["ultracode"],
    ],
  ])("%s", (_name, text, expected) => {
    expect(found(text)).toEqual(expected);
  });

  it.each([
    ["a backtick span", "use `ultracode` here, then ultrathink", ["ultrathink"]],
    ["a span of two backticks", "``the `ultracode` word`` and ultracode", ["ultracode"]],
    ["a backtick with no partner is text", "a ` then ultracode", ["ultracode"]],
    ["a span does not reach the next line", "a ` open\nultracode ` b", ["ultracode"]],
    ["a fenced block", "ultracode\n```ts\nultracode\n```\nultrathink", ["ultracode", "ultrathink"]],
    ["a tilde fence", "~~~\nultracode\n~~~\nultracode", ["ultracode"]],
    ["a fence that is still open", "ultracode\n```\nultracode\nultrathink", ["ultracode"]],
    ["a shorter fence line does not close", "````\n```\nultracode\n````\nultracode", ["ultracode"]],
  ])("leaves out Markdown code: %s", (_name, text, expected) => {
    expect(found(text)).toEqual(expected);
  });
});

describe("mayHoldClaudeKeyword", () => {
  it("is false only for a text with the letters of no keyword", () => {
    expect(mayHoldClaudeKeyword("run this please, ultra code")).toBe(false);
    // The text of an editor has no break between its blocks, so this is no word test.
    expect(mayHoldClaudeKeyword("xUltraThinky")).toBe(true);
    expect(mayHoldClaudeKeyword("with ultracode")).toBe(true);
  });
});

describe("isClaudeKeywordProvider", () => {
  it("is true for the Claude driver only", () => {
    expect(isClaudeKeywordProvider(ProviderDriverKind.make("claudeAgent"))).toBe(true);
    expect(isClaudeKeywordProvider(ProviderDriverKind.make("codex"))).toBe(false);
    expect(isClaudeKeywordProvider(undefined)).toBe(false);
  });
});

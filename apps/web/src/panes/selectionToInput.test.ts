import { describe, expect, it } from "vite-plus/test";

import { appendedText, selectionPreview } from "./selectionToInput";

describe("selectionPreview", () => {
  it("puts the text on one line in quotes and cuts it at 100 characters", () => {
    expect(selectionPreview("  one\n\n two\tthree ")).toBe("“one two three”");
    const preview = selectionPreview("x".repeat(150));
    expect(preview).toBe(`“${"x".repeat(99)}…”`);
  });
});

describe("appendedText", () => {
  it.each([
    ["", "new", "new"],
    ["old", "new", "\nnew"],
    ["old\n", "new", "new"],
  ])("after %j adds %j as %j", (prompt, text, expected) => {
    expect(appendedText(prompt, text)).toBe(expected);
  });
});

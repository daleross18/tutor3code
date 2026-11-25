import { describe, expect, it, vi } from "vite-plus/test";

import {
  registerFocusedScrollToEnd,
  scrollFocusedPaneToEnd,
  scrollKeyStaysInText,
  textFocusOfValue,
} from "./paneScrollToEnd";

describe("scrollKeyStaysInText", () => {
  it.each([
    ["no text field has focus", null, false],
    ["the composer is empty", textFocusOfValue(0, 0, 0), false],
    ["the caret is at the end of the text", textFocusOfValue(12, 12, 12), false],
    ["the caret is at the start of the text", textFocusOfValue(12, 0, 0), true],
    ["the caret is inside the text", textFocusOfValue(12, 5, 5), true],
    ["a range of the text is selected", textFocusOfValue(12, 5, 9), true],
    ["the whole text is selected", textFocusOfValue(12, 0, 12), true],
    ["a field with no selection has focus", textFocusOfValue(2, null, null), false],
    ["a chip or a line comes after the caret", { collapsed: true, contentAfterCaret: true }, true],
  ])("when %s", (_name, focus, staysInText) => {
    expect(scrollKeyStaysInText(focus)).toBe(staysInText);
  });
});

describe("scrollFocusedPaneToEnd", () => {
  it("runs the scroll of the chat view that registered last, and of none after it left", () => {
    const first = vi.fn();
    const second = vi.fn();
    const leaveFirst = registerFocusedScrollToEnd(first);
    // Pane focus moves: the next chat view registers before the last one leaves.
    const leaveSecond = registerFocusedScrollToEnd(second);
    leaveFirst();
    scrollFocusedPaneToEnd();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    leaveSecond();
    scrollFocusedPaneToEnd();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

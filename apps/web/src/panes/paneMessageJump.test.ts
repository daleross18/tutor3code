import { describe, expect, it } from "vite-plus/test";

import {
  alignmentCorrection,
  MESSAGE_JUMP_OFFSET,
  resolveLoadedJump,
  resolveMessageJump,
} from "./paneMessageJump";

// Three user messages. A jump leaves each top at scroll + MESSAGE_JUMP_OFFSET.
const userRows = [
  { index: 0, top: 0 },
  { index: 4, top: 1000 },
  { index: 9, top: 2000 },
];
const at = (top: number) => top - MESSAGE_JUMP_OFFSET;

describe("resolveMessageJump", () => {
  it.each([
    [
      "previous: from inside the answer of a message, to the start of that message",
      "previous",
      1500,
      false,
      false,
      { kind: "row", index: 4 },
    ],
    [
      "previous: from the start of a message, to the message before it",
      "previous",
      at(1000),
      false,
      false,
      { kind: "row", index: 0 },
    ],
    [
      "previous: scroll rounding of one pixel does not select the same message",
      "previous",
      at(1000) + 1,
      false,
      false,
      { kind: "row", index: 0 },
    ],
    [
      "previous: a message whose start shows lower on the screen is skipped",
      "previous",
      1800,
      false,
      false,
      { kind: "row", index: 4 },
    ],
    [
      "previous: at the first loaded message with older turns on the server",
      "previous",
      at(0),
      false,
      true,
      { kind: "loadEarlier" },
    ],
    [
      "previous: at the first message of the thread",
      "previous",
      at(0),
      false,
      false,
      { kind: "none" },
    ],
    [
      "next: to the message after the place that shows",
      "next",
      at(1000),
      false,
      false,
      { kind: "row", index: 9 },
    ],
    [
      "next: scroll rounding of one pixel does not select the same message",
      "next",
      at(1000) - 1,
      false,
      false,
      { kind: "row", index: 9 },
    ],
    [
      "next: after the last message, to the end of the chat",
      "next",
      at(2000),
      false,
      false,
      { kind: "end" },
    ],
    ["next: at the end of the chat", "next", 1700, true, false, { kind: "none" }],
  ] as const)("%s", (_name, direction, scroll, atEnd, hasMoreHistory, target) => {
    expect(resolveMessageJump({ direction, userRows, scroll, atEnd, hasMoreHistory })).toEqual(
      target,
    );
  });

  it("loads older turns when the loaded turns hold no user message", () => {
    const input = { userRows: [], scroll: 300, atEnd: false, hasMoreHistory: true };
    expect(resolveMessageJump({ ...input, direction: "previous" })).toEqual({
      kind: "loadEarlier",
    });
    expect(resolveMessageJump({ ...input, direction: "next" })).toEqual({ kind: "end" });
  });
});

describe("resolveLoadedJump", () => {
  const row = (id: string, isUserMessage = false) => ({ id, isUserMessage });
  const known = new Set(["u3", "a3"]);
  const idle = { knownRowIds: known, hasMoreHistory: true, loading: false, error: false };

  it.each([
    [
      "the page is not in the list yet, and the request runs",
      [row("u3", true), row("a3")],
      { ...idle, loading: true },
      { kind: "wait" },
    ],
    [
      "the page arrived: the last user message before the old first row",
      [row("u1", true), row("a1"), row("u2", true), row("a2"), row("u3", true), row("a3")],
      idle,
      { kind: "row", index: 2 },
    ],
    [
      "the old first row has another id after the load",
      [row("u2", true), row("work-merged"), row("a3")],
      idle,
      { kind: "row", index: 0 },
    ],
    [
      "the page holds no user message: one more page",
      [row("a2"), row("u3", true), row("a3")],
      idle,
      { kind: "loadEarlier" },
    ],
    [
      "the page holds no user message and the next request runs",
      [row("a2"), row("u3", true), row("a3")],
      { ...idle, loading: true },
      { kind: "wait" },
    ],
    [
      "no user message and no older turns",
      [row("a2"), row("u3", true), row("a3")],
      { ...idle, hasMoreHistory: false },
      { kind: "drop" },
    ],
    ["the load failed", [row("u3", true), row("a3")], { ...idle, error: true }, { kind: "drop" }],
    [
      "the page arrived and a later request failed: the jump still runs",
      [row("u2", true), row("u3", true), row("a3")],
      { ...idle, error: true },
      { kind: "row", index: 0 },
    ],
    ["the list shows another thread", [row("x1", true), row("x2")], idle, { kind: "drop" }],
  ] as const)("%s", (_name, rows, state, step) => {
    expect(resolveLoadedJump({ rows, ...state })).toEqual(step);
  });
});

describe("alignmentCorrection", () => {
  it.each([
    ["the message is on the target line", MESSAGE_JUMP_OFFSET, 500, 2000, 0],
    ["one pixel of scroll rounding is no fault", MESSAGE_JUMP_OFFSET - 1, 500, 2000, 0],
    [
      "the list stopped 38 px short after a load of older turns",
      MESSAGE_JUMP_OFFSET - 38,
      500,
      2000,
      -38,
    ],
    ["the message is under the target line", MESSAGE_JUMP_OFFSET + 60, 500, 2000, 60],
    ["the chat is at its end and cannot scroll more", MESSAGE_JUMP_OFFSET + 60, 2000, 2000, 0],
    ["the chat is at its start and cannot scroll more", MESSAGE_JUMP_OFFSET - 10, 0, 2000, 0],
    ["only a part of the change is in reach", MESSAGE_JUMP_OFFSET + 60, 1980, 2000, 20],
  ] as const)("%s", (_name, rowTop, scrollTop, maxScrollTop, change) => {
    expect(alignmentCorrection({ rowTop, scrollTop, maxScrollTop })).toBe(change);
  });
});

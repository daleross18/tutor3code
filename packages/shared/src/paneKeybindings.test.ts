import { describe, expect, it } from "vite-plus/test";

import { compileResolvedKeybindingRule, DEFAULT_KEYBINDINGS } from "./keybindings.ts";
import { PANE_DEFAULT_KEYBINDINGS } from "./paneKeybindings.ts";

const stockDefaults = DEFAULT_KEYBINDINGS.slice(0, -PANE_DEFAULT_KEYBINDINGS.length);
const chordOf = (rule: { readonly key: string; readonly when?: string | undefined }) =>
  `${rule.key}\u0000${rule.when ?? ""}`;

describe("PANE_DEFAULT_KEYBINDINGS", () => {
  it("is the tail of the defaults, so a pane rule wins its chord over a stock default", () => {
    expect(DEFAULT_KEYBINDINGS.slice(-PANE_DEFAULT_KEYBINDINGS.length)).toEqual(
      PANE_DEFAULT_KEYBINDINGS,
    );
    expect(stockDefaults.some((rule) => rule.command.startsWith("layout."))).toBe(false);
  });

  it("holds only rules that compile", () => {
    for (const rule of PANE_DEFAULT_KEYBINDINGS) {
      expect(compileResolvedKeybindingRule(rule), `${rule.command} on ${rule.key}`).not.toBeNull();
    }
  });

  it("binds every pane and tab command", () => {
    const bound = new Set(PANE_DEFAULT_KEYBINDINGS.map((rule) => rule.command));
    expect([...bound].filter((command) => command.startsWith("layout.")).toSorted()).toEqual(
      [
        "layout.splitRight",
        "layout.splitDown",
        "layout.focusLeft",
        "layout.focusRight",
        "layout.focusUp",
        "layout.focusDown",
        "layout.closePane",
        "layout.closePaneNow",
        "layout.newTab",
        "layout.closeTab",
        "layout.nextTab",
        "layout.previousTab",
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((position) => `layout.tab.jump.${position}`),
        "layout.scrollToEnd",
        "layout.stopTurn",
        "layout.focusInput",
        "layout.previousMessage",
        "layout.nextMessage",
        "layout.toggleMusic",
      ].toSorted(),
    );
  });

  it("takes a stock chord and condition only from the three commands it moves", () => {
    const stockChords = new Map(stockDefaults.map((rule) => [chordOf(rule), rule.command]));
    const taken = PANE_DEFAULT_KEYBINDINGS.flatMap((rule) => {
      const stockCommand = stockChords.get(chordOf(rule));
      return stockCommand === undefined ? [] : [[rule.command, stockCommand]];
    });
    expect(taken).toEqual([
      ["layout.splitRight", "diff.toggle"],
      ["layout.splitDown", "composer.dictation"],
    ]);
    const movedKeys = PANE_DEFAULT_KEYBINDINGS.filter(
      (rule) => !rule.command.startsWith("layout."),
    ).map((rule) => [rule.command, rule.key]);
    expect(movedKeys).toEqual([
      ["diff.toggle", "mod+alt+g"],
      ["composer.dictation", "mod+shift+u"],
      ["rightPanel.new", "mod+alt+t"],
    ]);
    // No stock default uses a moved key, under any condition.
    const stockKeys = new Set(stockDefaults.map((rule) => rule.key));
    expect(movedKeys.filter(([, key]) => stockKeys.has(key!))).toEqual([]);
    // The focus-input key shares its key with one stock rule, which holds the opposite condition.
    expect(PANE_DEFAULT_KEYBINDINGS.filter((rule) => rule.command === "layout.focusInput")).toEqual(
      [{ key: "mod+l", command: "layout.focusInput", when: "!previewFocus" }],
    );
    expect(stockDefaults.filter((rule) => rule.key === "mod+l")).toEqual([
      { key: "mod+l", command: "preview.focusUrl", when: "previewFocus" },
    ]);
  });
});

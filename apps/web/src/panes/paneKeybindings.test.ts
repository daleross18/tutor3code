import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
  mergeWithDefaultKeybindings,
} from "@t3tools/shared/keybindings";
import { describe, expect, it } from "vite-plus/test";

import { buildKeybindingRows } from "../components/settings/KeybindingsSettings.logic";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  type ShortcutEventLike,
} from "../keybindings";
import {
  isPaneCommand,
  paneKeybindingTargets,
  withoutDeadPaneChords,
  withPaneKeybindings,
} from "./paneKeybindings";

const MAC = "MacIntel";

function press(key: string, modifiers: ReadonlyArray<"meta" | "ctrl" | "shift" | "alt">) {
  return {
    key,
    code: /^\d$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`,
    metaKey: modifiers.includes("meta"),
    ctrlKey: modifiers.includes("ctrl"),
    shiftKey: modifiers.includes("shift"),
    altKey: modifiers.includes("alt"),
  } satisfies ShortcutEventLike;
}

const resolve = (
  keybindings: ResolvedKeybindingsConfig,
  event: ShortcutEventLike,
  context: Record<string, boolean> = {},
) =>
  resolveShortcutCommand(event, keybindings, {
    platform: MAC,
    context: { isDesktop: true, ...context },
  });

const label = (
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
  context: Record<string, boolean> = {},
) =>
  shortcutLabelForCommand(keybindings, command, {
    platform: MAC,
    context: { isDesktop: true, ...context },
  });

const hasRule = (keybindings: ResolvedKeybindingsConfig, command: KeybindingCommand, key: string) =>
  keybindings.some(
    (rule) => rule.command === command && rule.shortcut.key === key && !rule.shortcut.altKey,
  );

/** The list a stock server sends: no pane rule and no moved key. */
const stockServerList = DEFAULT_RESOLVED_KEYBINDINGS.slice(
  0,
  DEFAULT_RESOLVED_KEYBINDINGS.findIndex(
    (rule) => rule.command === "diff.toggle" && rule.shortcut.key === "g",
  ),
);

describe.each([
  ["the fork's own server", DEFAULT_RESOLVED_KEYBINDINGS],
  ["a stock server", mergeWithDefaultKeybindings(stockServerList)],
])("withPaneKeybindings with the list of %s", (_name, list) => {
  const keybindings = withPaneKeybindings(list);

  it("removes the three stock rules whose chords the pane keys take", () => {
    expect(hasRule(list, "diff.toggle", "d")).toBe(true);
    expect(hasRule(keybindings, "diff.toggle", "d")).toBe(false);
    expect(hasRule(keybindings, "composer.dictation", "d")).toBe(false);
    expect(hasRule(keybindings, "rightPanel.new", "t")).toBe(false);
    expect(resolve(keybindings, press("d", ["meta"]))).not.toBe("diff.toggle");
    expect(resolve(keybindings, press("d", ["meta", "shift"]))).not.toBe("composer.dictation");
    expect(resolve(keybindings, press("t", ["meta"]), { rightPanelOpen: true })).not.toBe(
      "rightPanel.new",
    );
  });

  it("gives the three commands their moved keys and labels", () => {
    expect(resolve(keybindings, press("g", ["meta", "alt"]))).toBe("diff.toggle");
    expect(resolve(keybindings, press("u", ["meta", "shift"]))).toBe("composer.dictation");
    expect(resolve(keybindings, press("t", ["meta", "alt"]), { rightPanelOpen: true })).toBe(
      "rightPanel.new",
    );
    expect(label(keybindings, "diff.toggle")).toBe("⌥⌘G");
    expect(label(keybindings, "composer.dictation")).toBe("⇧⌘U");
    expect(label(keybindings, "rightPanel.new", { rightPanelOpen: true })).toBe("⌥⌘T");
  });

  it("keeps the stock rules that share a chord under another condition", () => {
    expect(resolve(keybindings, press("d", ["meta"]), { terminalFocus: true })).toBe(
      "terminal.split",
    );
    expect(resolve(keybindings, press("w", ["meta"]))).toBe("rightPanel.close");
    expect(resolve(keybindings, press("1", ["meta"]))).toBe("thread.jump.1");
    expect(resolve(keybindings, press("1", ["meta"]), { modelPickerOpen: true })).toBe(
      "modelPicker.jump.1",
    );
    // The focus-input key and the stock URL key share a chord under opposite conditions.
    expect(resolve(keybindings, press("l", ["meta"]), { previewFocus: true })).toBe(
      "preview.focusUrl",
    );
    expect(resolve(keybindings, press("l", ["meta"]))).toBe("layout.focusInput");
    expect(label(keybindings, "preview.focusUrl", { previewFocus: true })).toBe("⌘L");
    expect(label(keybindings, "layout.focusInput")).toBe("⌘L");
  });

  it("adds a second thread jump key and keeps the stock label", () => {
    expect(resolve(keybindings, press("1", ["meta", "alt"]))).toBe("thread.jump.1");
    expect(resolve(keybindings, press("9", ["meta", "alt"]))).toBe("thread.jump.9");
    expect(label(keybindings, "thread.jump.1")).toBe("⌘1");
    expect(label(keybindings, "thread.next")).toBe("⇧⌘]");
    expect(isPaneCommand(keybindings[0]!.command)).toBe(false);
  });
});

describe("withPaneKeybindings with user rules", () => {
  it("gives the stock chord back when the user moves the pane key off it", () => {
    const keybindings = withPaneKeybindings(
      mergeWithDefaultKeybindings(
        compileResolvedKeybindingsConfig([
          { key: "mod+alt+r", command: "layout.splitRight", when: "!terminalFocus" },
        ]),
      ),
    );
    expect(resolve(keybindings, press("d", ["meta"]))).toBe("diff.toggle");
    expect(resolve(keybindings, press("g", ["meta", "alt"]))).toBe("diff.toggle");
    // The other two pane chords are unchanged.
    expect(hasRule(keybindings, "composer.dictation", "d")).toBe(false);
  });

  it("keeps a user key of a moved command and adds no default beside it", () => {
    const keybindings = withPaneKeybindings(
      mergeWithDefaultKeybindings(
        compileResolvedKeybindingsConfig([{ key: "mod+alt+x", command: "diff.toggle" }]),
      ),
    );
    expect(keybindings.filter((rule) => rule.command === "diff.toggle")).toHaveLength(1);
    expect(label(keybindings, "diff.toggle")).toBe("⌥⌘X");
  });
});

describe("what Settings lists and where it saves", () => {
  it("lists one working key for a moved command and no thread jump alternate", () => {
    // The fork's own server saves every default, the dead stock chords included.
    const rows = withoutDeadPaneChords(mergeWithDefaultKeybindings(DEFAULT_RESOLVED_KEYBINDINGS));
    const keysOf = (command: KeybindingCommand) =>
      rows.filter((rule) => rule.command === command).map((rule) => rule.shortcut.key);
    expect(keysOf("diff.toggle")).toEqual(["g"]);
    expect(keysOf("composer.dictation")).toEqual(["u"]);
    expect(keysOf("layout.splitRight")).toEqual(["d"]);
    expect(keysOf("thread.jump.1")).toEqual(["1"]);
    // The stock URL key of the preview and the focus-input key are both listed on their chord.
    expect(keysOf("preview.focusUrl")).toEqual(["l"]);
    expect(keysOf("layout.focusInput")).toEqual(["l"]);
    // Stock has no conflict among its defaults, and the pane keys must add none.
    const conflicting = buildKeybindingRows(rows, MAC).filter((row) => row.conflicts.length > 0);
    expect(conflicting.map((row) => row.command)).toEqual([]);
  });

  it("sends a pane key only to an environment whose server lists a pane rule", () => {
    const fork = { id: "fork", serverConfig: { keybindings: DEFAULT_RESOLVED_KEYBINDINGS } };
    const stock = { id: "stock", serverConfig: { keybindings: stockServerList } };
    const offline = { id: "offline", serverConfig: null };
    const all = [fork, stock, offline];
    expect(paneKeybindingTargets("layout.focusLeft", all)).toEqual([fork]);
    expect(paneKeybindingTargets("diff.toggle", all)).toBe(all);
  });
});

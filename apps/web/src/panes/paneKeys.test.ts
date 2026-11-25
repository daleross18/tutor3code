import type { KeybindingCommand } from "@t3tools/contracts";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
  mergeWithDefaultKeybindings,
} from "@t3tools/shared/keybindings";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveShortcutCommand, type ShortcutEventLike } from "../keybindings";
import { isPaneCommand, withPaneKeybindings } from "./paneKeybindings";
import {
  handleBubbleKey,
  handleCaptureKey,
  resolvePaneCommand,
  type PaneKeyDeps,
  type PaneKeyState,
} from "./paneKeys";

const MAC = "MacIntel";
const LINUX = "Linux x86_64";
const CODES: Readonly<Record<string, string>> = { "1": "Digit1", "9": "Digit9" };

/** `press("meta+alt+ArrowLeft")`: the modifiers, then the event's `key`. */
function press(chord: string): ShortcutEventLike {
  const parts = chord.split("+");
  const key = parts.at(-1)!;
  return {
    key,
    code: CODES[key] ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key),
    metaKey: parts.includes("meta"),
    ctrlKey: parts.includes("ctrl"),
    shiftKey: parts.includes("shift"),
    altKey: parts.includes("alt"),
  };
}

const multi: PaneKeyState = {
  paneCount: 2,
  tabCount: 2,
  terminalFocus: false,
  modelPickerOpen: false,
  caretBeforeTextEnd: () => false,
  turnStoppable: () => false,
  textSelected: () => false,
  rightPanelFocus: () => false,
  browserPreviewFocus: () => false,
  floatingLayerOpen: () => false,
  composerShown: () => true,
  caretInComposer: () => false,
  messageJumpAvailable: () => true,
  musicAvailable: () => true,
};
/** A turn runs in the focused pane. */
const running: PaneKeyState = { ...multi, turnStoppable: () => true };
const single: PaneKeyState = { ...multi, paneCount: 1, tabCount: 1 };

const paneCommand = (
  chord: string,
  state: PaneKeyState,
  keybindings = DEFAULT_RESOLVED_KEYBINDINGS,
  platform = MAC,
) => resolvePaneCommand(press(chord), keybindings, state, platform);

/** What a stock handler resolves: the whole list, and no pane condition in the context. */
const stockCommand = (chord: string, context: Record<string, boolean> = {}) =>
  resolveShortcutCommand(press(chord), DEFAULT_RESOLVED_KEYBINDINGS, {
    platform: MAC,
    context: { isDesktop: true, ...context },
  });

describe("resolvePaneCommand", () => {
  it.each<[string, KeybindingCommand]>([
    ["meta+d", "layout.splitRight"],
    ["meta+shift+d", "layout.splitDown"],
    ["meta+w", "layout.closePane"],
    ["meta+shift+w", "layout.closePaneNow"],
    ["meta+t", "layout.newTab"],
    ["meta+alt+w", "layout.closeTab"],
    ["meta+alt+ArrowRight", "layout.nextTab"],
    ["meta+alt+ArrowLeft", "layout.previousTab"],
    ["ctrl+Tab", "layout.nextTab"],
    ["ctrl+shift+Tab", "layout.previousTab"],
    ["meta+1", "layout.tab.jump.1"],
    ["meta+9", "layout.tab.jump.9"],
    ["ctrl+alt+ArrowLeft", "layout.focusLeft"],
    ["ctrl+alt+ArrowRight", "layout.focusRight"],
    ["ctrl+alt+ArrowUp", "layout.focusUp"],
    ["ctrl+alt+ArrowDown", "layout.focusDown"],
    ["meta+ArrowDown", "layout.scrollToEnd"],
    ["ctrl+c", "layout.stopTurn"],
    ["meta+l", "layout.focusInput"],
    ["meta+PageUp", "layout.previousMessage"],
    ["meta+PageDown", "layout.nextMessage"],
    ["meta+alt+m", "layout.toggleMusic"],
  ])("resolves the default key %s to %s", (chord, command) => {
    expect(paneCommand(chord, running)).toBe(command);
  });

  it("returns null for a key that no pane rule uses", () => {
    expect(paneCommand("meta+j", multi)).toBeNull();
    expect(paneCommand("j", multi)).toBeNull();
  });

  it("leaves the split keys to the terminal while a terminal has focus", () => {
    const terminal = { ...multi, terminalFocus: true };
    expect(paneCommand("meta+d", terminal)).toBeNull();
    expect(paneCommand("meta+shift+d", terminal)).toBeNull();
    expect(stockCommand("meta+d", { terminalFocus: true })).toBe("terminal.split");
    expect(stockCommand("meta+shift+d", { terminalFocus: true })).toBe("terminal.splitVertical");
    // Focus moves and tab keys also work from a terminal.
    expect(paneCommand("ctrl+alt+ArrowLeft", terminal)).toBe("layout.focusLeft");
    expect(paneCommand("meta+t", terminal)).toBe("layout.newTab");
  });

  it("scrolls the chat to its end with one pane too, and leaves the key to a terminal and to a caret inside a text", () => {
    expect(paneCommand("meta+ArrowDown", single)).toBe("layout.scrollToEnd");
    expect(paneCommand("meta+ArrowDown", { ...single, terminalFocus: true })).toBeNull();
    const caretBeforeTextEnd = vi.fn(() => true);
    expect(paneCommand("meta+ArrowDown", { ...single, caretBeforeTextEnd })).toBeNull();
    // The key is then not consumed: no stock handler runs a pane command, and no stock default
    // is on this chord, so the browser moves the caret to the end of the text.
    expect(
      DEFAULT_RESOLVED_KEYBINDINGS.filter(
        (rule) =>
          rule.shortcut.key === "arrowdown" &&
          rule.shortcut.modKey &&
          !rule.shortcut.shiftKey &&
          !rule.shortcut.altKey,
      ).map((rule) => rule.command),
    ).toEqual(["layout.scrollToEnd"]);
    // The caret is read for this key only: no other key pays for the DOM range.
    expect(caretBeforeTextEnd).toHaveBeenCalledTimes(1);
    for (const chord of ["meta+d", "meta+j", "ArrowDown", "ctrl+alt+ArrowDown"]) {
      paneCommand(chord, { ...multi, caretBeforeTextEnd });
    }
    expect(caretBeforeTextEnd).toHaveBeenCalledTimes(1);
  });

  it("jumps to a user message with one pane too, and leaves the key to a terminal and to a pane with no chat", () => {
    expect(paneCommand("meta+PageUp", single)).toBe("layout.previousMessage");
    expect(paneCommand("meta+PageDown", single)).toBe("layout.nextMessage");
    expect(paneCommand("ctrl+PageUp", single, DEFAULT_RESOLVED_KEYBINDINGS, LINUX)).toBe(
      "layout.previousMessage",
    );
    // The plain keys stay the stock page scroll.
    expect(paneCommand("PageUp", single)).toBeNull();
    expect(paneCommand("meta+PageUp", { ...single, terminalFocus: true })).toBeNull();
    // Settings or an empty pane: the key is not consumed.
    const messageJumpAvailable = vi.fn(() => false);
    const noChat = { ...single, messageJumpAvailable };
    expect(paneCommand("meta+PageDown", noChat)).toBeNull();
    expect(messageJumpAvailable).toHaveBeenCalledTimes(1);
    // The reader runs for these two keys only.
    for (const chord of ["meta+d", "meta+ArrowDown", "ctrl+c", "meta+l"])
      paneCommand(chord, noChat);
    expect(messageJumpAvailable).toHaveBeenCalledTimes(1);
  });

  it("opens the music popup with one pane too, and leaves the key free with no music button and in a terminal", () => {
    expect(paneCommand("meta+alt+m", single)).toBe("layout.toggleMusic");
    expect(paneCommand("ctrl+alt+m", single, DEFAULT_RESOLVED_KEYBINDINGS, LINUX)).toBe(
      "layout.toggleMusic",
    );
    // No stock default is on the chord, under any condition.
    expect(
      DEFAULT_RESOLVED_KEYBINDINGS.filter(
        (rule) =>
          rule.shortcut.key === "m" &&
          rule.shortcut.modKey &&
          rule.shortcut.altKey &&
          !rule.shortcut.shiftKey,
      ).map((rule) => rule.command),
    ).toEqual(["layout.toggleMusic"]);
    expect(stockCommand("meta+shift+c")).toBe("thread.copyReference");
    expect(stockCommand("meta+shift+m")).toBe("modelPicker.toggle");
    expect(paneCommand("meta+alt+m", { ...single, terminalFocus: true })).toBeNull();
    // A browser, or a pane with no bottom bar: the key is not consumed.
    const musicAvailable = vi.fn(() => false);
    const noMusic = { ...single, musicAvailable };
    expect(paneCommand("meta+alt+m", noMusic)).toBeNull();
    expect(musicAvailable).toHaveBeenCalledTimes(1);
    // The reader runs for this key only.
    for (const chord of ["meta+d", "meta+shift+m", "meta+l", "m"]) paneCommand(chord, noMusic);
    expect(musicAvailable).toHaveBeenCalledTimes(1);
  });

  it("stops the turn with one pane too, and leaves the key to copy, to a terminal and to the right panel", () => {
    const stoppable = { ...single, turnStoppable: () => true };
    expect(paneCommand("ctrl+c", stoppable)).toBe("layout.stopTurn");
    // No turn runs: the key is not consumed, so it stays the native key.
    expect(paneCommand("ctrl+c", single)).toBeNull();
    expect(paneCommand("ctrl+c", { ...stoppable, terminalFocus: true })).toBeNull();
    expect(paneCommand("ctrl+c", { ...stoppable, textSelected: () => true })).toBeNull();
    expect(paneCommand("ctrl+c", { ...stoppable, rightPanelFocus: () => true })).toBeNull();
    // The rule holds a literal Ctrl, so Cmd+C is copy on macOS whatever the state.
    expect(paneCommand("meta+c", stoppable)).toBeNull();
    expect(paneCommand("ctrl+shift+c", stoppable)).toBeNull();
    // The key is then not consumed: no stock handler runs a pane command, and no stock default
    // is on Ctrl+C or on Cmd+C, so the browser copies.
    expect(
      DEFAULT_RESOLVED_KEYBINDINGS.filter(
        (rule) =>
          rule.shortcut.key === "c" &&
          (rule.shortcut.ctrlKey || rule.shortcut.modKey || rule.shortcut.metaKey) &&
          !rule.shortcut.shiftKey &&
          !rule.shortcut.altKey,
      ).map((rule) => rule.command),
    ).toEqual(["layout.stopTurn"]);
    // The three readers run for this key only, and the DOM is read only while a turn can stop.
    const turnStoppable = vi.fn(() => false);
    const textSelected = vi.fn(() => false);
    const rightPanelFocus = vi.fn(() => false);
    const probed = { ...multi, turnStoppable, textSelected, rightPanelFocus };
    for (const chord of ["meta+d", "meta+c", "c", "meta+ArrowDown", "ctrl+alt+ArrowDown"]) {
      paneCommand(chord, probed);
    }
    expect(turnStoppable).not.toHaveBeenCalled();
    expect(paneCommand("ctrl+c", probed)).toBeNull();
    expect(turnStoppable).toHaveBeenCalledTimes(1);
    expect(textSelected).not.toHaveBeenCalled();
    expect(rightPanelFocus).not.toHaveBeenCalled();
  });

  it("follows a user rule for the stop key, with the conditions of the command", () => {
    const rebound = mergeWithDefaultKeybindings(
      compileResolvedKeybindingsConfig([{ key: "mod+.", command: "layout.stopTurn" }]),
    );
    expect(paneCommand("meta+.", running, rebound)).toBe("layout.stopTurn");
    expect(paneCommand("ctrl+c", running, rebound)).toBeNull();
    // The user's rule has no condition. The command's own conditions still hold.
    expect(paneCommand("meta+.", multi, rebound)).toBeNull();
    expect(paneCommand("meta+.", { ...running, terminalFocus: true }, rebound)).toBeNull();
    expect(paneCommand("meta+.", { ...running, textSelected: () => true }, rebound)).toBeNull();
  });

  it("puts the caret in the composer from any focus, with one pane too, and leaves the key to a browser preview, a floating layer and a second press", () => {
    // Focus on the body, on a button or in another text field: no reader says no.
    expect(paneCommand("meta+l", single)).toBe("layout.focusInput");
    // A browser preview has focus: the key is not consumed, and the stock rule resolves in the
    // stock handler.
    expect(paneCommand("meta+l", { ...single, browserPreviewFocus: () => true })).toBeNull();
    expect(stockCommand("meta+l", { previewFocus: true })).toBe("preview.focusUrl");
    // No stock handler runs a pane command, so the key does nothing in stock elsewhere.
    expect(stockCommand("meta+l")).toBe("layout.focusInput");
    expect(paneCommand("meta+l", { ...single, floatingLayerOpen: () => true })).toBeNull();
    expect(paneCommand("meta+l", { ...single, composerShown: () => false })).toBeNull();
    expect(paneCommand("meta+l", { ...single, caretInComposer: () => true })).toBeNull();
    // On macOS the chord means nothing to a shell, and Ctrl+L is no pane key there. Where mod
    // is Ctrl, the chord is "clear screen" in a shell.
    const terminal = { ...single, terminalFocus: true };
    expect(paneCommand("meta+l", terminal)).toBe("layout.focusInput");
    expect(paneCommand("ctrl+l", terminal)).toBeNull();
    expect(paneCommand("ctrl+l", single, DEFAULT_RESOLVED_KEYBINDINGS, LINUX)).toBe(
      "layout.focusInput",
    );
    expect(paneCommand("ctrl+l", terminal, DEFAULT_RESOLVED_KEYBINDINGS, LINUX)).toBeNull();
    // The four readers run for this key only.
    const browserPreviewFocus = vi.fn(() => false);
    const floatingLayerOpen = vi.fn(() => false);
    const composerShown = vi.fn(() => false);
    const caretInComposer = vi.fn(() => false);
    const probed = {
      ...multi,
      browserPreviewFocus,
      floatingLayerOpen,
      composerShown,
      caretInComposer,
    };
    for (const chord of ["meta+d", "l", "ctrl+l", "meta+shift+l", "meta+ArrowDown", "ctrl+c"]) {
      paneCommand(chord, probed);
    }
    expect(browserPreviewFocus).not.toHaveBeenCalled();
    expect(paneCommand("meta+l", probed)).toBeNull();
    expect(browserPreviewFocus).toHaveBeenCalledTimes(1);
    expect(floatingLayerOpen).toHaveBeenCalledTimes(1);
    expect(composerShown).toHaveBeenCalledTimes(1);
    expect(caretInComposer).not.toHaveBeenCalled();
  });

  it("follows a user rule for the focus-input key, with the conditions of the command", () => {
    const rebound = mergeWithDefaultKeybindings(
      compileResolvedKeybindingsConfig([{ key: "mod+shift+i", command: "layout.focusInput" }]),
    );
    expect(paneCommand("meta+shift+i", multi, rebound)).toBe("layout.focusInput");
    expect(paneCommand("meta+l", multi, rebound)).toBeNull();
    // The user's rule has no condition. The command's own conditions still hold.
    expect(
      paneCommand("meta+shift+i", { ...multi, browserPreviewFocus: () => true }, rebound),
    ).toBeNull();
    expect(
      paneCommand("meta+shift+i", { ...multi, caretInComposer: () => true }, rebound),
    ).toBeNull();
    expect(
      paneCommand("ctrl+shift+i", { ...multi, terminalFocus: true }, rebound, LINUX),
    ).toBeNull();
    // The stock key of the preview is as it was.
    expect(
      resolveShortcutCommand(press("meta+l"), rebound, {
        platform: MAC,
        context: { previewFocus: true },
      }),
    ).toBe("preview.focusUrl");
  });

  it("takes the focus keys only with two or more panes", () => {
    expect(paneCommand("ctrl+alt+ArrowLeft", { ...multi, paneCount: 1 })).toBeNull();
  });

  it("takes the tab keys only with two or more tabs, so thread jumps keep mod+1..9", () => {
    const oneTab = { ...multi, tabCount: 1 };
    for (const chord of ["meta+1", "meta+9", "meta+alt+ArrowRight", "ctrl+Tab", "meta+alt+w"]) {
      expect(paneCommand(chord, oneTab)).toBeNull();
    }
    expect(stockCommand("meta+1")).toBe("thread.jump.1");
    expect(stockCommand("meta+9")).toBe("thread.jump.9");
  });

  it("leaves mod+1..9 to the model picker while it is open", () => {
    expect(paneCommand("meta+1", { ...multi, modelPickerOpen: true })).toBeNull();
    expect(stockCommand("meta+1", { modelPickerOpen: true })).toBe("modelPicker.jump.1");
  });

  it("leaves the close keys alone with one tab and one pane", () => {
    expect(paneCommand("meta+w", single)).toBeNull();
    expect(paneCommand("meta+shift+w", single)).toBeNull();
    expect(paneCommand("meta+w", { ...single, paneCount: 2 })).toBe("layout.closePane");
    expect(paneCommand("meta+w", { ...single, tabCount: 2 })).toBe("layout.closePane");
  });

  it("keeps the stock close order: no stock handler resolves the pane close", () => {
    expect(stockCommand("meta+w")).toBe("rightPanel.close");
    expect(stockCommand("meta+w", { terminalFocus: true })).toBe("terminal.close");
  });

  it("splits and opens a tab from one tab with one pane", () => {
    expect(paneCommand("meta+d", single)).toBe("layout.splitRight");
    expect(paneCommand("meta+t", single)).toBe("layout.newTab");
  });

  it("follows a user rule: the new key works and the default key is unbound", () => {
    const rebound = mergeWithDefaultKeybindings(
      compileResolvedKeybindingsConfig([{ key: "mod+alt+h", command: "layout.focusLeft" }]),
    );
    expect(paneCommand("meta+alt+h", multi, rebound)).toBe("layout.focusLeft");
    expect(paneCommand("ctrl+alt+ArrowLeft", multi, rebound)).toBeNull();
    expect(paneCommand("ctrl+alt+ArrowRight", multi, rebound)).toBe("layout.focusRight");
    // The user's rule has no condition. The command's own condition still holds.
    expect(paneCommand("meta+alt+h", { ...multi, paneCount: 1 }, rebound)).toBeNull();
  });

  it("does not depend on the list order: a stock server puts the pane defaults first", () => {
    const stockServerList = DEFAULT_RESOLVED_KEYBINDINGS.filter(
      (rule) => !isPaneCommand(rule.command),
    );
    const merged = mergeWithDefaultKeybindings(stockServerList);
    expect(isPaneCommand(merged[0]!.command)).toBe(true);
    expect(paneCommand("meta+d", multi, merged)).toBe("layout.splitRight");
    expect(paneCommand("meta+1", multi, merged)).toBe("layout.tab.jump.1");
  });

  it("gives a pane chord to a rule that the user added after the pane rule", () => {
    const withUserRule = [
      ...DEFAULT_RESOLVED_KEYBINDINGS,
      ...compileResolvedKeybindingsConfig([
        { key: "mod+d", command: "chat.new", when: "!terminalFocus" },
      ]),
    ];
    expect(paneCommand("meta+d", multi, withUserRule)).toBeNull();
    expect(paneCommand("meta+shift+d", multi, withUserRule)).toBe("layout.splitDown");
    // The stock handlers and Settings read this list: the user's rule is in it, and it wins.
    const stockList = withPaneKeybindings(withUserRule);
    expect(resolveShortcutCommand(press("meta+d"), stockList, { platform: MAC })).toBe("chat.new");
  });
});

function keyboardEvent(chord: string, init: { repeat?: boolean; isComposing?: boolean } = {}) {
  const event = {
    ...press(chord),
    repeat: init.repeat ?? false,
    isComposing: init.isComposing ?? false,
    defaultPrevented: false,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
  return event;
}

function setup(state: PaneKeyState = multi) {
  const run = vi.fn<PaneKeyDeps["run"]>();
  const suspended = vi.fn<PaneKeyDeps["suspended"]>(() => false);
  const deps: PaneKeyDeps = {
    keybindings: () => DEFAULT_RESOLVED_KEYBINDINGS,
    state: () => state,
    suspended,
    run,
    platform: MAC,
  };
  const dispatch = (
    handler: typeof handleCaptureKey,
    event: ReturnType<typeof keyboardEvent>,
  ): boolean => handler(event as unknown as KeyboardEvent, deps);
  return { run, suspended, dispatch };
}

describe("pane key handlers", () => {
  it("takes a pane key in the capture phase and stops every later handler", () => {
    const { run, dispatch } = setup();
    const event = keyboardEvent("meta+d");
    expect(dispatch(handleCaptureKey, event)).toBe(true);
    expect(run).toHaveBeenCalledExactlyOnceWith("layout.splitRight");
    expect(event.defaultPrevented).toBe(true);
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it("returns false for a key that is not an active pane key", () => {
    const { run, dispatch } = setup(single);
    for (const chord of ["j", "meta+k", "meta+1", "ctrl+alt+ArrowLeft"]) {
      const event = keyboardEvent(chord);
      expect(dispatch(handleCaptureKey, event)).toBe(false);
      expect(dispatch(handleBubbleKey, event)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("leaves the layered close to the bubble phase", () => {
    const { run, dispatch } = setup();
    const event = keyboardEvent("meta+w");
    expect(dispatch(handleCaptureKey, event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(run).not.toHaveBeenCalled();

    expect(dispatch(handleBubbleKey, event)).toBe(true);
    expect(run).toHaveBeenCalledExactlyOnceWith("layout.closePane");
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not close the pane when a stock handler already took the close key", () => {
    const { run, dispatch } = setup();
    const event = keyboardEvent("meta+w");
    event.preventDefault();
    expect(dispatch(handleBubbleKey, event)).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("closes the pane at once on the direct close key", () => {
    const { run, dispatch } = setup();
    expect(dispatch(handleCaptureKey, keyboardEvent("meta+shift+w"))).toBe(true);
    expect(run).toHaveBeenCalledExactlyOnceWith("layout.closePaneNow");
  });

  it("consumes a key repeat of split, new and close with no action", () => {
    const { run, dispatch } = setup();
    for (const chord of ["meta+d", "meta+shift+d", "meta+t", "meta+shift+w", "meta+alt+w"]) {
      const event = keyboardEvent(chord, { repeat: true });
      expect(dispatch(handleCaptureKey, event)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(dispatch(handleBubbleKey, keyboardEvent("meta+w", { repeat: true }))).toBe(true);
    expect(run).not.toHaveBeenCalled();

    expect(dispatch(handleCaptureKey, keyboardEvent("ctrl+alt+ArrowLeft", { repeat: true }))).toBe(
      true,
    );
    expect(run).toHaveBeenCalledExactlyOnceWith("layout.focusLeft");
  });

  it("stops one time for a held stop key, and passes the key on when no turn runs", () => {
    const stopping = setup(running);
    const first = keyboardEvent("ctrl+c");
    expect(stopping.dispatch(handleCaptureKey, first)).toBe(true);
    expect(first.defaultPrevented).toBe(true);
    const repeat = keyboardEvent("ctrl+c", { repeat: true });
    expect(stopping.dispatch(handleCaptureKey, repeat)).toBe(true);
    expect(repeat.defaultPrevented).toBe(true);
    expect(stopping.run).toHaveBeenCalledExactlyOnceWith("layout.stopTurn");

    const idle = setup(multi);
    const copy = keyboardEvent("ctrl+c");
    expect(idle.dispatch(handleCaptureKey, copy)).toBe(false);
    expect(idle.dispatch(handleBubbleKey, copy)).toBe(false);
    expect(copy.defaultPrevented).toBe(false);
    expect(idle.run).not.toHaveBeenCalled();
  });

  it("moves the caret one time for a held focus-input key, and passes a second press on", () => {
    const outside = setup(multi);
    const first = keyboardEvent("meta+l");
    expect(outside.dispatch(handleCaptureKey, first)).toBe(true);
    expect(first.defaultPrevented).toBe(true);
    expect(outside.run).toHaveBeenCalledExactlyOnceWith("layout.focusInput");

    // The first press put the caret in the composer. The held key repeats: the repeat is
    // consumed with no action, so it does not reach the browser.
    const inComposer = setup({ ...multi, caretInComposer: () => true });
    const repeat = keyboardEvent("meta+l", { repeat: true });
    expect(inComposer.dispatch(handleCaptureKey, repeat)).toBe(true);
    expect(repeat.defaultPrevented).toBe(true);
    // A second press is the key of the browser.
    const second = keyboardEvent("meta+l");
    expect(inComposer.dispatch(handleCaptureKey, second)).toBe(false);
    expect(inComposer.dispatch(handleBubbleKey, second)).toBe(false);
    expect(second.defaultPrevented).toBe(false);
    expect(inComposer.run).not.toHaveBeenCalled();
  });

  it("toggles the music popup one time for a held key", () => {
    const { run, dispatch } = setup(multi);
    expect(dispatch(handleCaptureKey, keyboardEvent("meta+alt+m"))).toBe(true);
    const repeat = keyboardEvent("meta+alt+m", { repeat: true });
    expect(dispatch(handleCaptureKey, repeat)).toBe(true);
    expect(repeat.defaultPrevented).toBe(true);
    expect(run).toHaveBeenCalledExactlyOnceWith("layout.toggleMusic");
  });

  it("stands down while another surface owns the keyboard or a composition is open", () => {
    const { run, suspended, dispatch } = setup();
    expect(dispatch(handleCaptureKey, keyboardEvent("meta+d", { isComposing: true }))).toBe(false);
    suspended.mockReturnValue(true);
    expect(dispatch(handleCaptureKey, keyboardEvent("meta+d"))).toBe(false);
    expect(dispatch(handleBubbleKey, keyboardEvent("meta+w"))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});

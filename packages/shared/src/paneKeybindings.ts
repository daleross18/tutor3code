import type { KeybindingRule } from "@t3tools/contracts";

/**
 * Fork-owned: the default keys of the Tutor3 fork, appended as the last defaults. The
 * `paneMultiPane` and `paneMultiTab` conditions are supplied only by the fork's own key handler,
 * so a rule that carries one never resolves in a stock handler and the stock key keeps working.
 */
export const PANE_DEFAULT_KEYBINDINGS: ReadonlyArray<KeybindingRule> = [
  // The stock keys of these three commands are the split and new-tab keys below.
  { key: "mod+alt+g", command: "diff.toggle", when: "!terminalFocus" },
  { key: "mod+shift+u", command: "composer.dictation", when: "!terminalFocus" },
  { key: "mod+alt+t", command: "rightPanel.new", when: "rightPanelOpen && !terminalFocus" },
  { key: "mod+d", command: "layout.splitRight", when: "!terminalFocus" },
  { key: "mod+shift+d", command: "layout.splitDown", when: "!terminalFocus" },
  { key: "mod+w", command: "layout.closePane", when: "paneMultiPane || paneMultiTab" },
  { key: "mod+shift+w", command: "layout.closePaneNow", when: "paneMultiPane || paneMultiTab" },
  { key: "mod+t", command: "layout.newTab" },
  { key: "mod+alt+w", command: "layout.closeTab", when: "paneMultiTab" },
  // The last rule of a command supplies its label, so the arrow keys follow the Tab keys.
  { key: "ctrl+shift+tab", command: "layout.previousTab", when: "paneMultiTab" },
  { key: "ctrl+tab", command: "layout.nextTab", when: "paneMultiTab" },
  { key: "mod+alt+arrowleft", command: "layout.previousTab", when: "paneMultiTab" },
  { key: "mod+alt+arrowright", command: "layout.nextTab", when: "paneMultiTab" },
  // The ninth key selects the last tab.
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((position) => ({
    key: `mod+${position}`,
    command: `layout.tab.jump.${position}` as const,
    when: "paneMultiTab && !modelPickerOpen",
  })),
  // After the tab keys: where mod is Ctrl, both sets share a chord and a pane move wins.
  { key: "ctrl+alt+arrowleft", command: "layout.focusLeft", when: "paneMultiPane" },
  { key: "ctrl+alt+arrowright", command: "layout.focusRight", when: "paneMultiPane" },
  { key: "ctrl+alt+arrowup", command: "layout.focusUp", when: "paneMultiPane" },
  { key: "ctrl+alt+arrowdown", command: "layout.focusDown", when: "paneMultiPane" },
  // The stock "scroll to end" button as a key, for the chat of the focused pane. In a text field
  // the key keeps its native meaning (caret to the end of the text) until the caret is there.
  { key: "mod+arrowdown", command: "layout.scrollToEnd", when: "!terminalFocus" },
  // A literal Ctrl, so Cmd+C stays copy on macOS. Where mod is Ctrl the chord is the copy key:
  // the fork's key handler takes it only while a turn runs and no text is selected.
  { key: "ctrl+c", command: "layout.stopTurn", when: "!terminalFocus" },
  // The caret goes to the chat input of the focused pane. Stock has `preview.focusUrl` on this
  // chord with `previewFocus`. The opposite condition keeps that rule alive: in a stock handler,
  // in the labels and in the keys that the desktop app forwards from a preview page.
  { key: "mod+l", command: "layout.focusInput", when: "!previewFocus" },
  // The chat of the focused pane scrolls to the user message before or after the place that
  // shows. "Previous" loads older turns when no earlier message is loaded.
  { key: "mod+pageup", command: "layout.previousMessage", when: "!terminalFocus" },
  { key: "mod+pagedown", command: "layout.nextMessage", when: "!terminalFocus" },
  // The music popup of the focused pane. `mod+shift+c` and `mod+shift+m` are stock keys.
  { key: "mod+alt+m", command: "layout.toggleMusic", when: "!terminalFocus" },
];

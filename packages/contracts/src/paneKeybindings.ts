// Fork-owned: the pane and tab commands of the Tutor3 fork. Stock servers do not know them.
export const PANE_KEYBINDING_COMMANDS = [
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
  "layout.tab.jump.1",
  "layout.tab.jump.2",
  "layout.tab.jump.3",
  "layout.tab.jump.4",
  "layout.tab.jump.5",
  "layout.tab.jump.6",
  "layout.tab.jump.7",
  "layout.tab.jump.8",
  "layout.tab.jump.9",
  // Not a pane or tab command, but it takes the same path: the fork's key handler resolves it,
  // and a stock server does not know it.
  "layout.scrollToEnd",
  // Stops the running turn of the focused pane's chat, and takes back a message that was sent a
  // moment ago. The stock command `thread.stop` has no default key and takes nothing back.
  "layout.stopTurn",
  // Puts the caret in the chat input of the focused pane, from any place in the window. Stock
  // has no command for it.
  "layout.focusInput",
  // Scroll the chat of the focused pane to the user message before or after the place that
  // shows. The stock minimap has the two actions as buttons, with no key.
  "layout.previousMessage",
  "layout.nextMessage",
  // Opens and closes the music popup of the focused pane's bottom bar (the Mac app only).
  "layout.toggleMusic",
] as const;

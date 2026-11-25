import type { ResolvedKeybindingRule, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { isMacPlatform } from "@t3tools/shared/keybindings";

import { resolveShortcutCommand, type ShortcutEventLike } from "../keybindings";
import { isPaneCommand, livePaneRules, type PaneCommand } from "./paneKeybindings";

/** Read at event time. */
export interface PaneKeyState {
  /** Panes of the active tab. */
  readonly paneCount: number;
  readonly tabCount: number;
  readonly terminalFocus: boolean;
  readonly modelPickerOpen: boolean;
  /**
   * True when focus is in a text field whose caret is not at the end of its text. Read only for
   * a key that resolves to the scroll command, because the answer costs a DOM range.
   */
  readonly caretBeforeTextEnd: () => boolean;
  /**
   * The three readers below are read only for a key that resolves to the stop command. True
   * when the chat view of the focused pane can stop a turn now.
   */
  readonly turnStoppable: () => boolean;
  /** True while text is selected, in the focused text field or on the page. */
  readonly textSelected: () => boolean;
  /**
   * True while focus is in the right panel, in the floating preview or in a dialog. Their
   * surfaces have their own copy key.
   */
  readonly rightPanelFocus: () => boolean;
  /**
   * The four readers below are read only for a key that resolves to the focus-input command.
   * True while focus is in a browser preview, where the stock key on the same chord focuses
   * the URL field.
   */
  readonly browserPreviewFocus: () => boolean;
  /** True while a modal dialog, a menu or a popup is open. */
  readonly floatingLayerOpen: () => boolean;
  /** True when the focused pane shows a composer that can take the caret. */
  readonly composerShown: () => boolean;
  /** True while the caret is in the composer of the focused pane. */
  readonly caretInComposer: () => boolean;
  /**
   * Read only for a key that resolves to a message jump. True when the focused pane shows a
   * chat.
   */
  readonly messageJumpAvailable: () => boolean;
  /**
   * Read only for a key that resolves to the music command. True when the sidebar shows the
   * music button, or a music popup is open.
   */
  readonly musicAvailable: () => boolean;
}

export interface PaneKeyDeps {
  readonly keybindings: () => ResolvedKeybindingsConfig;
  readonly state: () => PaneKeyState;
  /** True while another surface owns the keyboard, such as the command palette. */
  readonly suspended: (event: KeyboardEvent) => boolean;
  readonly run: (command: PaneCommand) => void;
  readonly platform?: string;
}

// A held key must not split, open or close once for each repeat.
const SINGLE_SHOT_COMMANDS: ReadonlySet<PaneCommand> = new Set([
  "layout.splitRight",
  "layout.splitDown",
  "layout.closePane",
  "layout.closePaneNow",
  "layout.newTab",
  "layout.closeTab",
  "layout.scrollToEnd",
  "layout.stopTurn",
  "layout.focusInput",
  // A held key must not ask for one page of older turns after the other.
  "layout.previousMessage",
  "layout.nextMessage",
  // A held key must not open and close the popup in turns.
  "layout.toggleMusic",
]);

/** A rebound rule may carry no condition, so each command also has its own. */
function isPaneCommandActive(command: PaneCommand, state: PaneKeyState): boolean {
  const multiPane = state.paneCount > 1;
  const multiTab = state.tabCount > 1;
  switch (command) {
    case "layout.splitRight":
    case "layout.splitDown":
      // The terminal has its own split on these keys.
      return !state.terminalFocus;
    case "layout.focusLeft":
    case "layout.focusRight":
    case "layout.focusUp":
    case "layout.focusDown":
      return multiPane;
    case "layout.closePane":
    case "layout.closePaneNow":
      // The last pane of the last tab never closes, so the key keeps its stock meaning.
      return multiPane || multiTab;
    case "layout.newTab":
    case "layout.focusInput":
      // The rules of the focus-input key need the platform. They are applied after the chord
      // matched.
      return true;
    case "layout.scrollToEnd":
    case "layout.stopTurn":
    case "layout.previousMessage":
    case "layout.nextMessage":
    case "layout.toggleMusic":
      // The terminal keeps its own keys. The caret rule of the scroll key, the three rules of
      // the stop key and the rule of the message jumps are applied after the chord matched.
      return !state.terminalFocus;
    case "layout.closeTab":
    case "layout.nextTab":
    case "layout.previousTab":
      return multiTab;
    default:
      // Tab jumps share mod+1..9 with the model picker's jumps.
      return multiTab && !state.modelPickerOpen;
  }
}

/**
 * The default stop key is the copy key where mod is Ctrl, and a rebound one can be. It is a pane
 * key only while a turn can stop and the key has no other use: no selected text to copy, and no
 * focus in a surface (spreadsheet, browser page, preview) that reads the key itself.
 */
function stopKeyIsFree(state: PaneKeyState): boolean {
  return state.turnStoppable() && !state.rightPanelFocus() && !state.textSelected();
}

/**
 * The focus-input key works from any focus, with four exceptions. A second press, with the
 * caret already in the composer, goes to the browser (its address bar on the web). A repeat of
 * a held key is still the first press, so it never reaches the browser.
 */
function focusInputKeyIsFree(state: PaneKeyState, modIsCtrl: boolean, repeat: boolean): boolean {
  // Where mod is Ctrl, the default chord is "clear screen" in a shell.
  if (state.terminalFocus && modIsCtrl) return false;
  if (state.browserPreviewFocus() || state.floatingLayerOpen() || !state.composerShown()) {
    return false;
  }
  return repeat || !state.caretInComposer();
}

const paneRulesByList = new WeakMap<
  ResolvedKeybindingsConfig,
  ReadonlyArray<ResolvedKeybindingRule>
>();

function paneRulesOf(keybindings: ResolvedKeybindingsConfig) {
  let rules = paneRulesByList.get(keybindings);
  if (rules === undefined) {
    rules = livePaneRules(keybindings);
    paneRulesByList.set(keybindings, rules);
  }
  return rules;
}

/**
 * The pane command of a key event, or null. Only the pane rules that own their chord are read
 * (see `livePaneRules`), so the result does not depend on where the pane defaults sit among the
 * stock defaults, and a rule that the user put on a pane chord later still wins.
 */
export function resolvePaneCommand(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  state: PaneKeyState,
  platform?: string,
): PaneCommand | null {
  const activeRules = paneRulesOf(keybindings).filter(
    (rule) => isPaneCommand(rule.command) && isPaneCommandActive(rule.command, state),
  );
  const command = resolveShortcutCommand(event, activeRules, {
    ...(platform === undefined ? {} : { platform }),
    context: {
      terminalFocus: state.terminalFocus,
      modelPickerOpen: state.modelPickerOpen,
      paneMultiPane: state.paneCount > 1,
      paneMultiTab: state.tabCount > 1,
    },
  });
  if (command === null || !isPaneCommand(command)) return null;
  // In a text field the key first moves the caret to the end of the text, as it does natively.
  if (command === "layout.scrollToEnd" && state.caretBeforeTextEnd()) return null;
  if (command === "layout.stopTurn" && !stopKeyIsFree(state)) return null;
  if (
    (command === "layout.previousMessage" || command === "layout.nextMessage") &&
    !state.messageJumpAvailable()
  ) {
    return null;
  }
  // With no music button (a browser, a collapsed sidebar) the chord stays free.
  if (command === "layout.toggleMusic" && !state.musicAvailable()) return null;
  if (
    command === "layout.focusInput" &&
    !focusInputKeyIsFree(
      state,
      !isMacPlatform(platform ?? navigator.platform),
      event.repeat === true,
    )
  ) {
    return null;
  }
  return command;
}

function resolveForDeps(event: KeyboardEvent, deps: PaneKeyDeps): PaneCommand | null {
  if (event.isComposing || deps.suspended(event)) return null;
  return resolvePaneCommand(event, deps.keybindings(), deps.state(), deps.platform);
}

/**
 * Capture phase, ahead of every stock handler. Returns false for a key that is not an active
 * pane key, so stock handling continues. The layered close waits for the bubble phase.
 */
export function handleCaptureKey(event: KeyboardEvent, deps: PaneKeyDeps): boolean {
  const command = resolveForDeps(event, deps);
  if (command === null || command === "layout.closePane") return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!(event.repeat && SINGLE_SHOT_COMMANDS.has(command))) deps.run(command);
  return true;
}

/**
 * Bubble phase. The stock handlers close a focused terminal or an open right-panel surface in
 * the capture phase and stop the event, so a key that arrives here closes the pane.
 */
export function handleBubbleKey(event: KeyboardEvent, deps: PaneKeyDeps): boolean {
  if (event.defaultPrevented || resolveForDeps(event, deps) !== "layout.closePane") return false;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) deps.run("layout.closePane");
  return true;
}

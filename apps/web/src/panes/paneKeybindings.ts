import {
  THREAD_JUMP_KEYBINDING_COMMANDS,
  type KeybindingCommand,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ResolvedKeybindingRule,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
} from "@t3tools/shared/keybindings";

export type PaneCommand = Extract<KeybindingCommand, `layout.${string}`>;

export function isPaneCommand(command: KeybindingCommand): command is PaneCommand {
  return command.startsWith("layout.");
}

// With 2+ tabs the tab keys take mod+1..9, so thread jumps get a second key that always works.
const THREAD_JUMP_ALTERNATES = compileResolvedKeybindingsConfig(
  THREAD_JUMP_KEYBINDING_COMMANDS.map((command, index) => ({
    key: `mod+alt+${index + 1}`,
    command,
    when: "!modelPickerOpen && isDesktop",
  })),
);

function sameShortcut(left: KeybindingShortcut, right: KeybindingShortcut): boolean {
  return (
    left.key === right.key &&
    left.metaKey === right.metaKey &&
    left.ctrlKey === right.ctrlKey &&
    left.shiftKey === right.shiftKey &&
    left.altKey === right.altKey &&
    left.modKey === right.modKey
  );
}

function sameWhen(
  left: KeybindingWhenNode | undefined,
  right: KeybindingWhenNode | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.type === "identifier") return right.type === "identifier" && left.name === right.name;
  if (left.type === "not") return right.type === "not" && sameWhen(left.node, right.node);
  return (
    left.type === right.type && sameWhen(left.left, right.left) && sameWhen(left.right, right.right)
  );
}

/** True when `taker` takes every key press that `rule` would take. */
function covers(taker: ResolvedKeybindingRule, rule: ResolvedKeybindingRule): boolean {
  return (
    sameShortcut(taker.shortcut, rule.shortcut) &&
    (taker.whenAst === undefined || sameWhen(taker.whenAst, rule.whenAst))
  );
}

function isStockDefault(rule: ResolvedKeybindingRule): boolean {
  return DEFAULT_RESOLVED_KEYBINDINGS.some(
    (stock) =>
      stock.command === rule.command &&
      sameShortcut(stock.shortcut, rule.shortcut) &&
      sameWhen(stock.whenAst, rule.whenAst),
  );
}

/**
 * The pane rules that own their chord. A later rule wins a chord, as in stock: a rule that the
 * user added after a pane rule, for another command on the same chord and condition, takes the
 * chord. A stock default never does, whatever its place: a stock server and an older
 * keybindings file list the stock defaults after the pane defaults.
 */
export function livePaneRules(keybindings: ResolvedKeybindingsConfig) {
  return keybindings.filter(
    (rule, index) =>
      isPaneCommand(rule.command) &&
      !keybindings
        .slice(index + 1)
        .some(
          (later) => !isPaneCommand(later.command) && !isStockDefault(later) && covers(later, rule),
        ),
  );
}

/**
 * Removes each rule of another command that a live pane rule covers: the pane key handler runs
 * first, so that rule can never run. A command that loses its only key takes its other default
 * key.
 */
export function withoutDeadPaneChords(keybindings: ResolvedKeybindingsConfig) {
  const paneRules = livePaneRules(keybindings);
  const isDead = (rule: ResolvedKeybindingRule) =>
    !isPaneCommand(rule.command) && paneRules.some((pane) => covers(pane, rule));
  const live = keybindings.filter((rule) => !isDead(rule));
  const liveCommands = new Set(live.map((rule) => rule.command));
  const keylessCommands = new Set(
    keybindings.map((rule) => rule.command).filter((command) => !liveCommands.has(command)),
  );
  const restored = DEFAULT_RESOLVED_KEYBINDINGS.filter(
    (rule) => keylessCommands.has(rule.command) && !isDead(rule),
  );
  return [...restored, ...live];
}

/**
 * The merged keybinding list that the web client resolves keys and labels from. First is lowest
 * precedence: the stock rules keep their chords and supply the labels.
 */
export function withPaneKeybindings(keybindings: ResolvedKeybindingsConfig) {
  return [...THREAD_JUMP_ALTERNATES, ...withoutDeadPaneChords(keybindings)];
}

/**
 * The environments that take a change to this command's keys. A stock server does not know the
 * pane commands and rejects them, so a pane key goes only to a server that lists a pane rule.
 */
export function paneKeybindingTargets<
  Environment extends {
    readonly serverConfig?: { readonly keybindings: ResolvedKeybindingsConfig } | null;
  },
>(command: KeybindingCommand, environments: ReadonlyArray<Environment>) {
  if (!isPaneCommand(command)) return environments;
  return environments.filter((environment) =>
    environment.serverConfig?.keybindings.some((rule) => isPaneCommand(rule.command)),
  );
}

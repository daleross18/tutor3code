import type { PreviewForwardedShortcut, ResolvedKeybindingsConfig } from "@t3tools/contracts";

import { livePaneRules, type PaneCommand } from "./paneKeybindings";
import { usePaneStore } from "./paneStore";

// A focused browser page takes every key press, so the desktop app sends these back as menu
// actions. They switch tabs only, and only while there are tabs to switch.
export const PREVIEW_FORWARDED_PANE_COMMANDS: ReadonlyArray<PaneCommand> = [
  "layout.nextTab",
  "layout.previousTab",
  ...Array.from({ length: 9 }, (_, index) => `layout.tab.jump.${index + 1}` as PaneCommand),
];

const FORWARDED = new Set(PREVIEW_FORWARDED_PANE_COMMANDS);

export function previewForwardedPaneShortcuts(
  keybindings: ResolvedKeybindingsConfig,
  multiTab: boolean,
): ReadonlyArray<PreviewForwardedShortcut> {
  if (!multiTab) return [];
  return livePaneRules(keybindings)
    .filter((rule) => FORWARDED.has(rule.command as PaneCommand))
    .map(({ command, shortcut }) => ({ command, shortcut }));
}

/** The tab keys that a focused browser page sends back to the app. */
export function usePreviewForwardedPaneShortcuts(
  keybindings: ResolvedKeybindingsConfig,
): ReadonlyArray<PreviewForwardedShortcut> {
  const multiTab = usePaneStore((state) => state.layout.tabs.length > 1);
  return previewForwardedPaneShortcuts(keybindings, multiTab);
}

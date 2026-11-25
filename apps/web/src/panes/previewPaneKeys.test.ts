import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { describe, expect, it } from "vite-plus/test";

import { withPaneKeybindings } from "./paneKeybindings";
import { PREVIEW_FORWARDED_PANE_COMMANDS, previewForwardedPaneShortcuts } from "./previewPaneKeys";

describe("previewForwardedPaneShortcuts", () => {
  const keybindings = withPaneKeybindings(DEFAULT_RESOLVED_KEYBINDINGS);

  it("forwards no key with one tab, so the browser page keeps them", () => {
    expect(previewForwardedPaneShortcuts(keybindings, false)).toEqual([]);
  });

  it("forwards the default key of each tab switch command with 2+ tabs, and no other", () => {
    const commands = previewForwardedPaneShortcuts(keybindings, true).map((rule) => rule.command);
    expect(new Set(commands)).toEqual(new Set(PREVIEW_FORWARDED_PANE_COMMANDS));
  });
});

import type { AnyRouter } from "@tanstack/react-router";

import { isCommandPaletteOpen } from "../commandPaletteBus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { registerCommands, registerMenuAction } from "../shortcuts/dispatcher";
import { primaryServerKeybindingsAtom } from "../state/server";
import { runPaneCommand } from "./paneActions";
import {
  caretInFocusedComposer,
  focusedComposerShown,
  isBrowserPreviewFocused,
  isFloatingLayerOpen,
} from "./paneFocusInput";
import { handleBubbleKey, handleCaptureKey, type PaneKeyDeps } from "./paneKeys";
import { focusedMessageJumpAvailable } from "./paneMessageJump";
import { PREVIEW_FORWARDED_PANE_COMMANDS } from "./previewPaneKeys";
import { musicKeyAvailable } from "./musicStore";
import { readTextFocus, scrollKeyStaysInText } from "./paneScrollToEnd";
import { focusedTurnStoppable, isTextSelected } from "./paneStopTurn";
import { usePaneStore } from "./paneStore";
import { getActiveTab, leafCount } from "./paneTree";

const KEYBOARD_OWNER_SELECTOR = '[data-keybinding-capture], [role="alertdialog"]';
// Stock regions outside the right panel that hold a widget with its own Ctrl+C: the floating
// preview, the remote browser page, and a dialog (it can show the spreadsheet viewer or the
// source preview). Their selection is no selection of the document.
const OWN_COPY_KEY_SELECTOR =
  '[data-preview-mini-player], [data-server-browser-surface], [role="dialog"]';

/**
 * Registers the pane keys on the stock dispatcher. Its window capture listener exists from
 * startup, so the capture scope runs before the chat view's own window listener.
 */
export function registerPaneKeyScopes(router: AnyRouter): () => void {
  const deps: PaneKeyDeps = {
    keybindings: () => appAtomRegistry.get(primaryServerKeybindingsAtom),
    state: () => {
      const { layout } = usePaneStore.getState();
      return {
        paneCount: leafCount(getActiveTab(layout)),
        tabCount: layout.tabs.length,
        terminalFocus: isTerminalFocused(),
        modelPickerOpen: isModelPickerOpen(),
        caretBeforeTextEnd: () => scrollKeyStaysInText(readTextFocus(document.activeElement)),
        turnStoppable: focusedTurnStoppable,
        textSelected: () => isTextSelected(),
        // The stock reader behind the `previewFocus` key condition: focus inside the shell of
        // the right panel (`[data-preview-panel-mode]`), or in a desktop preview page. The
        // selector adds the regions that show the same surfaces outside that shell.
        rightPanelFocus: () =>
          isPreviewFocused() || document.activeElement?.closest(OWN_COPY_KEY_SELECTOR) != null,
        browserPreviewFocus: isBrowserPreviewFocused,
        floatingLayerOpen: isFloatingLayerOpen,
        composerShown: focusedComposerShown,
        caretInComposer: caretInFocusedComposer,
        messageJumpAvailable: focusedMessageJumpAvailable,
        musicAvailable: musicKeyAvailable,
      };
    },
    suspended: (event) =>
      isCommandPaletteOpen() ||
      (event.target instanceof Element && event.target.closest(KEYBOARD_OWNER_SELECTOR) !== null),
    run: (command) => runPaneCommand(router, command),
  };
  const disposeCapture = registerCommands(
    {},
    { capture: true, onKeyDown: (event) => handleCaptureKey(event, deps) },
  );
  const disposeBubble = registerCommands(
    {},
    { onKeyDown: (event) => handleBubbleKey(event, deps) },
  );
  // The tab keys that a focused browser page sends back as menu actions.
  const disposeMenuActions = PREVIEW_FORWARDED_PANE_COMMANDS.map((command) =>
    registerMenuAction(command, () => {
      if (usePaneStore.getState().layout.tabs.length > 1) deps.run(command);
    }),
  );
  return () => {
    disposeCapture();
    disposeBubble();
    for (const dispose of disposeMenuActions) dispose();
  };
}

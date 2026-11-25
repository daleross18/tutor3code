import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";

import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";
import { useTerminalUiStateStore } from "../terminalUiStateStore";

/**
 * The terminal drawer is a child of the chat column, and a maximized right panel gives that
 * column no width. Stock then opens the drawer where nobody sees it and shows its toggle as on.
 * With panes, a drawer that opens restores the maximized panel of its thread to its place
 * beside the chat column. Stock does the same for a shell command of a side chat (ChatView).
 */
export function installPaneTerminalReveal(): () => void {
  return useTerminalUiStateStore.subscribe((state, previous) => {
    if (state.terminalUiStateByThreadKey === previous.terminalUiStateByThreadKey) return;
    for (const [threadKey, terminal] of Object.entries(state.terminalUiStateByThreadKey)) {
      if (!terminal.terminalOpen) continue;
      if (previous.terminalUiStateByThreadKey[threadKey]?.terminalOpen === true) continue;
      const threadRef = parseScopedThreadKey(threadKey);
      if (threadRef === null) continue;
      const panels = useRightPanelStore.getState();
      if (selectThreadRightPanelState(panels.byThreadKey, threadRef).maximized === true) {
        panels.setMaximized(threadRef, false);
      }
    }
  });
}

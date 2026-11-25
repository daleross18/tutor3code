import type { ScopedThreadRef } from "@t3tools/contracts";

import { toastManager } from "../components/ui/toast";
import { useRightPanelStore } from "../rightPanelStore";
import { paneRefusesPanel } from "./panePanelViews";
import { PANE_PANEL_INLINE_MIN_WIDTH_PX } from "./paneSize";

/**
 * A pane too narrow for the right panel shows no panel (paneSize.ts). A request for a panel
 * surface there, such as a file link, the diff of a turn or `/side`, would change the stored
 * panel state where the user cannot see it, and the panel would open later by itself when the
 * pane becomes wide. Such a request is refused with a message, and the stored state stays.
 */
const PANE_NARROW_PANEL_HINT = `Make this pane ${PANE_PANEL_INLINE_MIN_WIDTH_PX} px wide or more to use the right panel.`;

/** The reason a side chat cannot start from a narrow pane, else null. A side chat is a panel. */
export function paneNarrowSideChatReason(narrow: boolean): string | null {
  return narrow ? PANE_NARROW_PANEL_HINT : null;
}

function refusePanelRequest(): void {
  toastManager.add({
    type: "warning",
    title: "This pane is too narrow for the right panel",
    description: PANE_NARROW_PANEL_HINT,
  });
}

type PanelStore = ReturnType<typeof useRightPanelStore.getState>;

/**
 * The store actions that open the panel or bring a surface to the front after a user action.
 * The other actions pass: closing, arranging, and what an agent opens with no user action
 * (`openProactive`, `revealSurface`, an automatic `openDevice`), which shows in a wide pane.
 */
export const PANE_GUARDED_PANEL_ACTIONS = [
  "open",
  "openSideChat",
  "openDevice",
  "openBrowser",
  "openFile",
  "openAttachment",
  "openPullRequest",
  "openIssue",
  "openTerminal",
  "show",
  "toggleVisibility",
  "toggle",
] as const satisfies ReadonlyArray<keyof PanelStore>;

function guardPanelAction<Rest extends ReadonlyArray<unknown>>(
  action: (ref: ScopedThreadRef, ...rest: Rest) => void,
  passes: (...rest: Rest) => boolean = () => false,
): (ref: ScopedThreadRef, ...rest: Rest) => void {
  return (ref, ...rest) => {
    if (!paneRefusesPanel(ref) || passes(...rest)) action(ref, ...rest);
    else refusePanelRequest();
  };
}

/**
 * Puts the guard in front of the panel store's opening actions. Every caller reads an action
 * from the store at call time, so no call site needs an edit. Returns the function that puts
 * the stock actions back.
 */
export function installPaneNarrowPanelGuard(): () => void {
  const stock = useRightPanelStore.getState();
  useRightPanelStore.setState({
    open: guardPanelAction(stock.open),
    openSideChat: guardPanelAction(stock.openSideChat),
    openDevice: guardPanelAction(stock.openDevice, (_target, automatic) => automatic === true),
    openBrowser: guardPanelAction(stock.openBrowser),
    openFile: guardPanelAction(stock.openFile),
    openAttachment: guardPanelAction(stock.openAttachment),
    openPullRequest: guardPanelAction(stock.openPullRequest),
    openIssue: guardPanelAction(stock.openIssue),
    openTerminal: guardPanelAction(stock.openTerminal),
    show: guardPanelAction(stock.show),
    toggleVisibility: guardPanelAction(stock.toggleVisibility),
    toggle: guardPanelAction(stock.toggle),
  });
  return () =>
    useRightPanelStore.setState(
      Object.fromEntries(PANE_GUARDED_PANEL_ACTIONS.map((name) => [name, stock[name]])),
    );
}

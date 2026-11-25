import type { ScopedThreadRef } from "@t3tools/contracts";
import { createContext, use, useEffect, type ComponentProps } from "react";

import type { ChatShortcutCommands } from "../components/chat/useChatShortcuts";
import { useStableCallback } from "../hooks/useStableCallback";
import { trackPanePanelView } from "./panePanelViews";
import { registerFocusedScrollToEnd } from "./paneScrollToEnd";

export interface PaneCellContextValue {
  readonly paneId: string;
  readonly focused: boolean;
  readonly multi: boolean;
  /** The pane's server thread. Null for a draft pane and for an empty pane. */
  readonly threadRef: ScopedThreadRef | null;
  /** True when the pane is too narrow for the stock right panel beside the chat column. */
  readonly narrow: boolean;
}

/** Null outside a pane cell. */
export const PaneCellContext = createContext<PaneCellContextValue | null>(null);

/** True in a cell that is not focused. False in the focused cell and outside a cell. */
export function usePanePassive(): boolean {
  const cell = use(PaneCellContext);
  return cell !== null && !cell.focused;
}

/**
 * The pane's own thread wherever more than one pane or tab exists, else the route's thread,
 * which is what stock reads. The focused pane reads its own thread too: the store focuses a pane
 * before the router commits, and until then the route still names the pane that lost focus.
 */
export function resolvePaneThreadRef(
  cell: Pick<PaneCellContextValue, "multi" | "threadRef"> | null,
  routeRef: ScopedThreadRef | null,
): ScopedThreadRef | null {
  return cell !== null && cell.multi ? cell.threadRef : routeRef;
}

export function usePaneThreadRef(routeRef: ScopedThreadRef | null): ScopedThreadRef | null {
  return resolvePaneThreadRef(use(PaneCellContext), routeRef);
}

/**
 * True in a pane too narrow for the right panel beside the chat column. Such a pane has no
 * right panel: the chat view treats the panel as closed and keeps the thread's stored panel
 * state, so the panel returns when the pane is wide again. `panelThreadRef` is the thread whose
 * panel the chat view shows, so a request for a panel surface can be refused while it is narrow.
 */
export function usePaneNarrow(panelThreadRef: ScopedThreadRef | null): boolean {
  const cell = use(PaneCellContext);
  const narrow = cell?.narrow ?? false;
  const tracked = cell !== null && cell.multi ? panelThreadRef : null;
  const environmentId = tracked?.environmentId ?? null;
  const threadId = tracked?.threadId ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the mounted chat view and its pane width outside React, for the guard of the right panel store (paneNarrowPanel.ts)
  useEffect(() => {
    if (environmentId === null || threadId === null) return undefined;
    return trackPanePanelView({ environmentId, threadId }, narrow);
  }, [environmentId, threadId, narrow]);
  return narrow;
}

/**
 * Gives the stock "scroll to end" of a chat view to the `layout.scrollToEnd` key. `active` is
 * true only for the chat view of the focused pane: a passive pane is a background thread, and a
 * side chat is embedded.
 */
export function usePaneScrollToEnd(
  scrollToEnd: (animated?: boolean) => void,
  active: boolean,
): void {
  // What the stock button does.
  const scrollToEndAnimated = useStableCallback(() => scrollToEnd(true));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers this chat view's scroll action outside React, for the fork's key handler (paneScrollToEnd.ts)
  useEffect(
    () => (active ? registerFocusedScrollToEnd(scrollToEndAnimated) : undefined),
    [active, scrollToEndAnimated],
  );
}

const passKey = () => false;

/**
 * The right-panel keys of a chat view. In a narrow pane they do nothing and the key event goes
 * on, so the close key reaches the pane. A hidden panel must not change where the user cannot
 * see it.
 */
export function panePanelShortcuts<Commands extends ChatShortcutCommands>(
  shortcuts: Commands,
  narrow: boolean,
): Commands {
  if (!narrow) return shortcuts;
  return {
    ...shortcuts,
    "rightPanel.toggle": passKey,
    "rightPanel.toggleMaximized": passKey,
    "rightPanel.close": passKey,
    "diff.toggle": passKey,
  };
}

/** Takes the place of the stock inset in a thread view. The pane host renders the one inset. */
export function PaneCellInset(props: ComponentProps<"main">) {
  return props.children;
}

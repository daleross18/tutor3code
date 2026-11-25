import type { ThreadId } from "@t3tools/contracts";

import type { RightPanelSurface } from "../rightPanelStore";
import type { ThreadRouteTarget } from "../threadRoutes";
import { dropRefusal, placeLeaf, tabOfDrop, type PaneDrop } from "./paneBrowserLayout";
import {
  createChatLeaf,
  findCollidingLeaf,
  focusLeaf,
  replaceTab,
  type PaneContainerSize,
  type PaneLayout,
  type PaneSplitRefusal,
  type PaneTargetKey,
} from "./paneTree";

/**
 * What a tab of the right panel becomes when it is dropped outside the panel: a browser tab a
 * browser pane, a side chat a chat pane. Null for each other tab, which does not drag out.
 */
export type PanelTabPane =
  | { readonly kind: "browser"; readonly tabId: string }
  | { readonly kind: "chat"; readonly threadId: ThreadId };

export function panelTabPaneOf(surface: RightPanelSurface): PanelTabPane | null {
  switch (surface.kind) {
    case "preview":
      return surface.resourceId === null ? null : { kind: "browser", tabId: surface.resourceId };
    case "side-chat":
      return { kind: "chat", threadId: surface.threadId };
    default:
      return null;
  }
}

/**
 * Opens a chat pane of `target` at the drop. Where the tab of the drop already has a pane that
 * owns the thread (by the rule of "Mirror panes"), that pane takes focus and no pane is added.
 * Else a drop with no room for one more pane gives its refusal. Null when the drop is gone.
 */
export function placeChatPane(
  layout: PaneLayout,
  target: ThreadRouteTarget,
  drop: PaneDrop,
  keyOf: PaneTargetKey,
  mirror: boolean,
  container: PaneContainerSize,
):
  | { readonly layout: PaneLayout; readonly added: boolean }
  | { readonly refusal: PaneSplitRefusal }
  | null {
  const destination = tabOfDrop(layout, drop);
  const owner =
    destination === null ? null : findCollidingLeaf(destination.root, target, keyOf, mirror);
  if (destination !== null && owner !== null) {
    const shown = {
      ...replaceTab(layout, focusLeaf(destination, owner.id)),
      activeTabId: destination.id,
    };
    return { layout: shown, added: false };
  }
  const refusal = dropRefusal(layout, drop, container);
  if (refusal !== null) return { refusal };
  const next = placeLeaf(layout, createChatLeaf(target), drop);
  return next === null ? null : { layout: next, added: true };
}

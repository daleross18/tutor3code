import { Plus } from "lucide-react";
import { createPortal } from "react-dom";

import { cn } from "~/lib/utils";

import { usePaneDragStore } from "./paneDrag";
import type { PaneDropRect } from "./paneDropZones";

const boxStyle = (rect: PaneDropRect) => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
});

/**
 * The drop zones of a dragged browser: the new-tab zone, and the box of the zone under the
 * pointer, or a line between two tabs for a new tab there. It is above the pages of the panes
 * (the stock webview layers are at 30 and 48) and takes no pointer event, so the element that
 * started the drag keeps the pointer.
 */
export function PaneDropOverlay() {
  const active = usePaneDragStore((state) => state.active);
  const zone = usePaneDragStore((state) => state.zone);
  const newTab = usePaneDragStore((state) => state.newTab);
  if (!active) return null;
  // The empty end of the tab strip is a new-tab drop with a box of its own.
  const overNewTab = zone !== null && newTab !== null && zone.rect === newTab;
  return createPortal(
    <div data-pane-drop-overlay className="pointer-events-none fixed inset-0 z-[60]">
      {newTab !== null ? (
        <div
          data-pane-drop-new-tab
          className={cn(
            "absolute flex items-center justify-center gap-1.5 rounded-md border border-dashed text-xs font-medium shadow-lg/20 backdrop-blur-xl",
            overNewTab
              ? "border-primary bg-primary/25 text-foreground"
              : "border-border bg-popover/92 text-muted-foreground",
          )}
          style={boxStyle(newTab)}
        >
          <Plus className="size-3.5" />
          New tab
        </div>
      ) : null}
      {zone?.marker === true ? (
        <div
          data-pane-drop-zone="tab-slot"
          className="absolute rounded-full bg-primary"
          style={boxStyle(zone.rect)}
        />
      ) : zone !== null && !overNewTab ? (
        <div
          data-pane-drop-zone={zone.drop.kind === "pane" ? zone.drop.side : zone.drop.kind}
          className="absolute rounded-md border-2 border-primary bg-primary/20"
          style={boxStyle(zone.rect)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

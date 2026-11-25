import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "~/lib/utils";

import { usePaneStore } from "./paneStore";
import type { PaneDividerRect } from "./paneTree";

const percent = (fraction: number) => `${fraction * 100}%`;

/** A 1px line on the boundary between two children of a split, with a wider drag area. */
export function PaneDivider({ divider }: { divider: PaneDividerRect }) {
  const row = divider.axis === "row";
  // Pixels from the boundary to the pointer at the press, so the boundary does not jump to it.
  const grabOffsetRef = useRef(0);
  const pointerPosition = (event: ReactPointerEvent<HTMLDivElement>) =>
    row ? event.clientX : event.clientY;

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget.getBoundingClientRect();
    grabOffsetRef.current =
      pointerPosition(event) -
      (row ? handle.left + handle.width / 2 : handle.top + handle.height / 2);
    // Capture keeps the drag alive over terminals and preview frames.
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const grid = event.currentTarget.parentElement?.getBoundingClientRect();
    if (grid === undefined) return;
    const boundary = pointerPosition(event) - grabOffsetRef.current;
    usePaneStore
      .getState()
      .resizeSplit(
        divider.splitId,
        divider.index,
        row ? (boundary - grid.left) / grid.width : (boundary - grid.top) / grid.height,
        { width: grid.width, height: grid.height },
      );
  };

  const position = { left: percent(divider.left), top: percent(divider.top) };
  const length = row ? { height: percent(divider.height) } : { width: percent(divider.width) };
  return (
    <>
      <div
        aria-hidden
        className={cn("pointer-events-none absolute bg-border", row ? "w-px" : "h-px")}
        style={{ ...position, ...length }}
      />
      <div
        role="separator"
        aria-orientation={row ? "vertical" : "horizontal"}
        data-pane-divider={divider.id}
        className={cn(
          "absolute touch-none select-none",
          row ? "w-2 -translate-x-1/2 cursor-col-resize" : "h-2 -translate-y-1/2 cursor-row-resize",
        )}
        style={{ ...position, ...length }}
        // A press on the divider must not take DOM focus from the pane that has it.
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={startResize}
        onPointerMove={resize}
        onDoubleClick={(event) => {
          const grid = event.currentTarget.parentElement?.getBoundingClientRect();
          if (grid === undefined) return;
          usePaneStore
            .getState()
            .equalizeSplit(divider.splitId, { width: grid.width, height: grid.height });
        }}
      />
    </>
  );
}

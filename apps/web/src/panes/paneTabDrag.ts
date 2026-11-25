import { DRAG_SLOP_PX } from "./paneDrag";
import { usePaneStore } from "./paneStore";
import { useReadoutSettingsStore } from "./readoutSettings";

interface TabPress {
  readonly button: number;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly target: EventTarget | null;
  readonly currentTarget: HTMLElement;
}

interface TabBox {
  readonly element: HTMLElement;
  readonly left: number;
  readonly right: number;
}

/**
 * The place of the dragged tab in the new order. It passes a tab when its leading edge passes
 * the center of that tab, so at either end of the strip it takes the first or the last place.
 */
function dropIndexOf(boxes: ReadonlyArray<TabBox>, from: number, dx: number): number {
  const dragged = boxes[from]!;
  const centerOf = (box: TabBox) => (box.left + box.right) / 2;
  if (dx < 0) {
    return boxes.filter((box, index) => index < from && centerOf(box) <= dragged.left + dx).length;
  }
  return (
    from + boxes.filter((box, index) => index > from && centerOf(box) < dragged.right + dx).length
  );
}

const SHIFT_TRANSITION = "transform 150ms ease";

let stopCurrentDrag: (() => void) | null = null;

/** The click that ends a drag must not reach the tab, which would make it the active tab. */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, true), 0);
}

/**
 * A press on a tab of the tab strip and a move of the drag slop starts a reorder, as in VS
 * Code: the tab follows the pointer along the strip, and the other tabs move aside to show
 * its place. The release puts it there. A press with no move stays a click.
 */
export function pressPaneTab(press: TabPress, tabId: string): void {
  if (press.button !== 0 || !useReadoutSettingsStore.getState().dragPanes) return;
  if (usePaneStore.getState().layout.tabs.length < 2) return;
  const tab = press.currentTarget;
  if (press.target instanceof Element && press.target.closest("[data-pane-tab-close]")) return;
  const foundList = tab.closest("[data-pane-tablist]");
  if (foundList === null) return;
  const list: Element = foundList;
  stopCurrentDrag?.();
  const { pointerId } = press;
  const startX = press.clientX;
  const startY = press.clientY;
  let boxes: ReadonlyArray<TabBox> | null = null;
  let from = -1;
  let toIndex = -1;
  let cancelled = false;
  let startScroll = 0;
  let lastClientX = startX;
  let unsubscribe: (() => void) | null = null;

  function arm(): boolean {
    boxes = [...list.querySelectorAll<HTMLElement>(":scope > [data-pane-tab]")].map((element) => {
      const box = element.getBoundingClientRect();
      return { element, left: box.left, right: box.right };
    });
    from = boxes.findIndex((box) => box.element === tab);
    if (from === -1 || boxes.length < 2) return false;
    toIndex = from;
    startScroll = list.scrollLeft;
    const shift = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? ""
      : SHIFT_TRANSITION;
    for (const box of boxes) {
      if (box.element !== tab) box.element.style.transition = shift;
    }
    tab.style.zIndex = "1";
    tab.setPointerCapture(pointerId);
    tab.addEventListener("lostpointercapture", cancel);
    list.addEventListener("scroll", onScroll);
    // The boxes and the indexes hold only for the tabs measured here.
    const tabIds = usePaneStore.getState().layout.tabs.map((each) => each.id).join();
    unsubscribe = usePaneStore.subscribe((state) => {
      if (state.layout.tabs.map((each) => each.id).join() !== tabIds) cancel();
    });
    return true;
  }
  function place(clientX: number) {
    if (boxes === null || cancelled) return;
    lastClientX = clientX;
    const dragged = boxes[from]!;
    // The boxes are in the scroll position of the start, and the transforms scroll with the list.
    const moved = clientX - startX + list.scrollLeft - startScroll;
    const dx = Math.min(
      Math.max(moved, boxes[0]!.left - dragged.left),
      boxes.at(-1)!.right - dragged.right,
    );
    toIndex = dropIndexOf(boxes, from, dx);
    // A tab between the old and the new place moves by the width of the dragged tab and a gap.
    const step = boxes[1]!.left - boxes[0]!.right + dragged.right - dragged.left;
    boxes.forEach((box, index) => {
      const offset =
        index === from
          ? dx
          : from < index && index <= toIndex
            ? -step
            : toIndex <= index && index < from
              ? step
              : 0;
      box.element.style.transform = offset === 0 ? "" : `translateX(${offset}px)`;
    });
  }
  function restore() {
    for (const box of boxes ?? []) {
      box.element.style.transform = "";
      box.element.style.transition = "";
    }
    tab.style.zIndex = "";
  }
  function stop() {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("keydown", onKeyDown, true);
    tab.removeEventListener("lostpointercapture", cancel);
    list.removeEventListener("scroll", onScroll);
    unsubscribe?.();
    unsubscribe = null;
    if (tab.hasPointerCapture(pointerId)) tab.releasePointerCapture(pointerId);
    restore();
    stopCurrentDrag = null;
  }
  /** The tabs go back now. The release that follows is still not a click. */
  function cancel() {
    if (boxes === null || cancelled) return;
    cancelled = true;
    restore();
  }
  function onScroll() {
    place(lastClientX);
  }
  function onMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    // A release that never reached the window ends the drag with no move, also after a cancel.
    if ((event.buttons & 1) === 0) {
      stop();
      return;
    }
    if (cancelled) return;
    if (boxes === null) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_SLOP_PX) return;
      if (!arm()) {
        stop();
        return;
      }
    }
    place(event.clientX);
  }
  function onUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    const armed = boxes !== null;
    stop();
    if (!armed) return;
    swallowNextClick();
    if (!cancelled) usePaneStore.getState().moveTab(tabId, toIndex);
  }
  function onCancel(event: PointerEvent) {
    if (event.pointerId === pointerId) stop();
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || boxes === null || cancelled) return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  window.addEventListener("keydown", onKeyDown, true);
  stopCurrentDrag = stop;
}

import { TIMELINE_MINIMAP_TARGET_OFFSET } from "../components/chat/MessagesTimeline.logic";

export type MessageJumpDirection = "previous" | "next";

/** The gap that a jump leaves above its message. It is the gap of the stock minimap. */
export const MESSAGE_JUMP_OFFSET = TIMELINE_MINIMAP_TARGET_OFFSET;
// A message whose top is on the target line is the current message, within scroll rounding.
const POSITION_SLOP_PX = 2;

/** A row of the timeline list, as far as a jump reads it. */
export interface JumpRow {
  readonly id: string;
  readonly isUserMessage: boolean;
}

/** A user message row and the top of it, in the positions of the list. */
export interface UserRowTop {
  readonly index: number;
  readonly top: number;
}

export type MessageJumpTarget =
  | { readonly kind: "row"; readonly index: number }
  | { readonly kind: "loadEarlier" }
  | { readonly kind: "end" }
  | { readonly kind: "none" };

/**
 * Where a key press goes. "previous" is the last user message that starts above the target
 * line, so a message whose start is on the screen is skipped. With no such message in the
 * loaded turns, older turns are loaded. "next" after the last user message is the end of the chat.
 */
export function resolveMessageJump(input: {
  readonly direction: MessageJumpDirection;
  readonly userRows: ReadonlyArray<UserRowTop>;
  /** The list position at the top of the viewport. */
  readonly scroll: number;
  readonly atEnd: boolean;
  readonly hasMoreHistory: boolean;
}): MessageJumpTarget {
  const line = input.scroll + MESSAGE_JUMP_OFFSET;
  if (input.direction === "previous") {
    const row = input.userRows.findLast((candidate) => candidate.top < line - POSITION_SLOP_PX);
    if (row !== undefined) return { kind: "row", index: row.index };
    return input.hasMoreHistory ? { kind: "loadEarlier" } : { kind: "none" };
  }
  if (input.atEnd) return { kind: "none" };
  const row = input.userRows.find((candidate) => candidate.top > line + POSITION_SLOP_PX);
  return row === undefined ? { kind: "end" } : { kind: "row", index: row.index };
}

export type LoadedJumpStep =
  | { readonly kind: "row"; readonly index: number }
  | { readonly kind: "loadEarlier" }
  | { readonly kind: "wait" }
  | { readonly kind: "drop" };

/**
 * The next step of a "previous" jump that waits for older turns. `knownRowIds` holds the rows
 * that the list had at the key press: the target is the last user message before the first of
 * them. A page with no user message asks for one more page.
 */
export function resolveLoadedJump(input: {
  readonly rows: ReadonlyArray<JumpRow>;
  readonly knownRowIds: ReadonlySet<string>;
  readonly hasMoreHistory: boolean;
  readonly loading: boolean;
  readonly error: boolean;
}): LoadedJumpStep {
  const firstKnown = input.rows.findIndex((row) => input.knownRowIds.has(row.id));
  // The list shows other content now: another thread, or a rebuilt timeline.
  if (firstKnown === -1) return { kind: "drop" };
  const target = input.rows.findLastIndex((row, index) => index < firstKnown && row.isUserMessage);
  if (target !== -1) return { kind: "row", index: target };
  if (input.error) return { kind: "drop" };
  if (input.loading) return { kind: "wait" };
  return input.hasMoreHistory ? { kind: "loadEarlier" } : { kind: "drop" };
}

/** How long a jump watches its message, in animation frames, and how often it scrolls again. */
export const ALIGN_WATCH_FRAMES = 90;
export const ALIGN_MAX_CORRECTIONS = 6;

/**
 * The scroll change that puts the message of a jump on the target line, or 0. The list scrolls
 * to a row from estimated sizes, and the "Load earlier turns" line can leave after the scroll:
 * the message is then some pixels off, and the next key press would select it again.
 */
export function alignmentCorrection(input: {
  /** The top of the message row, in pixels under the top of the viewport. */
  readonly rowTop: number;
  readonly scrollTop: number;
  readonly maxScrollTop: number;
}): number {
  const wanted = input.scrollTop + input.rowTop - MESSAGE_JUMP_OFFSET;
  const reachable = Math.min(Math.max(wanted, 0), Math.max(input.maxScrollTop, 0));
  const change = reachable - input.scrollTop;
  return Math.abs(change) <= 1 ? 0 : change;
}

let focusedMessageJump: ((direction: MessageJumpDirection) => void) | null = null;

/** The chat view of the focused pane registers its jump here. */
export function registerFocusedMessageJump(
  jump: (direction: MessageJumpDirection) => void,
): () => void {
  focusedMessageJump = jump;
  return () => {
    if (focusedMessageJump === jump) focusedMessageJump = null;
  };
}

export function jumpToMessageInFocusedPane(direction: MessageJumpDirection): void {
  focusedMessageJump?.(direction);
}

/** False when the focused pane shows no chat, so the key keeps its stock meaning. */
export function focusedMessageJumpAvailable(): boolean {
  return focusedMessageJump !== null;
}

import type {
  ThreadRunSummary,
  ThreadStructure,
  ThreadStructureTurnItem,
  ThreadStructureVisibleTurnItem,
} from "@t3tools/client-runtime/state/shell";
import { turnItemIsWorkspacePreparation } from "@t3tools/client-runtime/state/turn-item-presentation";
import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import type { MessageId, RunId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { TimelineEntry } from "../session-logic";
import type { ChatMessage, SessionPhase } from "../types";
import { readTextFocus } from "./paneScrollToEnd";

/** A message that is older than this, on the clock of its server, stays in the timeline. */
const TAKE_BACK_WINDOW_MS = 15_000;
/** How long a take back waits for the stopped run to settle and for its rewind target. */
export const TAKE_BACK_SETTLE_TIMEOUT_MS = 10_000;

export type StopSignal =
  | { readonly kind: "stop" }
  | { readonly kind: "take-back"; readonly runId: RunId; readonly messageId: MessageId };

const STOP_ONLY: StopSignal = { kind: "stop" };

/**
 * True for a turn item that leaves the run untouched: text of the agent, the workspace setup
 * that the server ran, or a record that changes nothing. Every type has its own case, so a type
 * that upstream adds fails the type check here until someone decides.
 */
function turnItemAllowsTakeBack(item: ThreadStructureTurnItem): boolean {
  switch (item.type) {
    // The message of the run itself. `deriveStopSignal` counts it.
    case "user_message":
    // Output only: the agent wrote or thought, and did nothing.
    case "assistant_message":
    case "reasoning":
    // Records of the app, not work of the agent.
    case "checkpoint":
    case "system_notice":
    case "notification":
    case "run_interrupt_request":
    case "run_interrupt_result":
      return true;
    // The server adds a command item for the worktree setup, and an error item when the user
    // cancels that setup. The agent ran neither. Every other command or error counts as work.
    case "command_execution":
    case "error":
      return turnItemIsWorkspacePreparation(item);
    // A tool ran or changed a file.
    case "file_change":
    case "file_search":
    case "web_search":
    case "dynamic_tool":
    // The agent started other work.
    case "subagent":
    case "thread_created":
    case "handoff":
    case "fork":
    // The agent asked the user for something, or the user already answered.
    case "approval_request":
    case "user_input_request":
    case "secret_request":
    case "link_request":
    // The agent made a plan, or the conversation was compacted.
    case "todo_list":
    case "proposed_plan":
    case "compaction":
      return false;
    default:
      item satisfies never;
      // A server that is newer than this client can send a type that the client does not know.
      return false;
  }
}

/**
 * True when the run holds its own message one time and nothing that counts as work. Asked at
 * the key press, and again when the stopped run settles: a tool can start between the two.
 */
export function runIsUntouched(
  turnItems: ReadonlyArray<ThreadStructureTurnItem>,
  runId: RunId,
  messageId: MessageId,
): boolean {
  let userMessages = 0;
  for (const item of turnItems) {
    if (item.runId !== runId) continue;
    // Collapsed work hides items that this client cannot classify.
    if (item.deferredWork !== undefined || !turnItemAllowsTakeBack(item)) return false;
    if (item.type !== "user_message") continue;
    // A second message of the run is a steer. A rewind would take that back too.
    if (item.messageId !== messageId) return false;
    userMessages += 1;
  }
  return userMessages === 1;
}

/**
 * Decided at the key press. "take-back" only for a run that the user started a moment ago and
 * that did nothing but write text. Every doubt gives "stop", which leaves the message where it
 * is.
 */
export function deriveStopSignal(input: {
  readonly projection: Pick<ThreadStructure, "runs" | "messages" | "turnItems"> | null;
  /** The run that the stock stop targets: `activeRuntime.activeRunId`. */
  readonly activeRunId: RunId | null;
  /** `toServerClock(environmentId, Date.now())`: the message time is a server time. */
  readonly nowServerMs: number;
}): StopSignal {
  const { projection, activeRunId, nowServerMs } = input;
  if (projection === null || activeRunId === null) return STOP_ONLY;
  const run = projection.runs.find((candidate) => candidate.id === activeRunId);
  if (run === undefined) return STOP_ONLY;
  // A continuation or a delegated task has no message that the user typed for this run.
  if (
    run.manualContinuationOfRunId !== undefined ||
    run.restartContinuationOfRunId !== undefined ||
    run.usageLimitContinuationOfRunId !== undefined ||
    run.delegatedTaskId !== undefined
  ) {
    return STOP_ONLY;
  }
  const message = projection.messages.find((candidate) => candidate.id === run.userMessageId);
  if (message === undefined || message.role !== "user" || message.createdBy !== "user") {
    return STOP_ONLY;
  }
  // A scheduled task and a guest send with `createdBy` "user", and stock shows both with a
  // sender label. The user typed neither, so neither goes to the composer of the user.
  if (resolveUserMessagePresentation(message).attribution !== null) return STOP_ONLY;
  // NaN for a time that cannot be read, and NaN fails both comparisons. A message that is from
  // the future by more than the window means the two clocks disagree, so its age is unknown.
  const ageMs = nowServerMs - DateTime.toEpochMillis(message.createdAt);
  if (!(ageMs < TAKE_BACK_WINDOW_MS && ageMs > -TAKE_BACK_WINDOW_MS)) return STOP_ONLY;
  return runIsUntouched(projection.turnItems, run.id, message.id)
    ? { kind: "take-back", runId: run.id, messageId: message.id }
    : STOP_ONLY;
}

/**
 * The composer text after a taken back message returns to it: behind a draft that the composer
 * already holds, as the stock rewind puts it.
 */
export function promptWithReturnedMessage(currentPrompt: string, returnedPrompt: string): string {
  if (returnedPrompt.length === 0) return currentPrompt;
  return currentPrompt.length > 0 ? `${currentPrompt}\n\n${returnedPrompt}` : returnedPrompt;
}

/** A take back that waits for its stopped run. One object for each key press. */
export interface PendingTakeBack {
  /** The thread of the chat view at the key press (`routeThreadKey`). */
  readonly threadKey: string;
  readonly runId: RunId;
  readonly messageId: MessageId;
}

export interface TakeBackState {
  readonly threadKey: string;
  readonly runs: ReadonlyArray<Pick<ThreadStructure["runs"][number], "id" | "ordinal" | "status">>;
  /** `runIsUntouched` for the pending run, in this render. */
  readonly runUntouched: boolean;
  readonly phase: SessionPhase;
  readonly isSendBusy: boolean;
  /** `laterSendIsPending` in this render. */
  readonly laterSendPending: boolean;
  readonly supportsConversationRollback: boolean;
  readonly environmentUnavailable: boolean;
  /** The stock rewind target of the message, or undefined while it has none. */
  readonly revertTurnCount: number | undefined;
  /** True when `TAKE_BACK_SETTLE_TIMEOUT_MS` passed since the key press. */
  readonly timedOut: boolean;
}

export type TakeBackResolution = "wait" | "drop" | { readonly rewind: number };

/**
 * What a pending take back does in this render. "drop" is silent: the turn stays stopped, the
 * message stays in the timeline and no error shows.
 */
export function resolveTakeBack(
  pending: PendingTakeBack,
  state: TakeBackState,
): TakeBackResolution {
  if (state.threadKey !== pending.threadKey || !state.supportsConversationRollback) return "drop";
  const run = state.runs.find((candidate) => candidate.id === pending.runId);
  if (run === undefined) return "drop";
  // A later run means the user sent again. The stock rewind would roll that run back too.
  if (state.runs.some((candidate) => candidate.ordinal > run.ordinal)) return "drop";
  // The same, for a send that the server does not show yet. `isSendBusy` cannot tell: it
  // clears when the stopped run settles, also while a later send is still on its way.
  if (state.laterSendPending) return "drop";
  // A tool started after the key press and before the stop reached the agent.
  if (!state.runUntouched) return "drop";
  switch (run.status) {
    case "interrupted":
      break;
    case "preparing":
    case "queued":
    case "starting":
    case "running":
    case "waiting":
      // The stop is asynchronous: the server settles the run in a later event.
      return state.timedOut ? "drop" : "wait";
    default:
      // Completed, failed, cancelled or rolled back: the stop came too late, or a rewind ran.
      return "drop";
  }
  const ready =
    state.phase !== "running" &&
    !state.isSendBusy &&
    !state.environmentUnavailable &&
    state.revertTurnCount !== undefined;
  if (ready) return { rewind: state.revertTurnCount };
  // A first turn that was stopped before its provider started never gets a target.
  return state.timedOut ? "drop" : "wait";
}

/**
 * True while the user sends again and the server does not show that send yet. A send is in
 * flight from the Enter key to the answer of the server (`sendInFlight` of the stock
 * `draftSendState`), and its message shows as an optimistic message for most of that time.
 */
export function laterSendIsPending(
  optimisticUserMessages: ReadonlyArray<Pick<ChatMessage, "id">>,
  messageId: MessageId,
  sendInFlight: boolean,
): boolean {
  return sendInFlight || optimisticUserMessages.some((message) => message.id !== messageId);
}

/**
 * The entries of the chat view, plus one for each message of the agent, as the timeline has
 * them. `deriveRevertTurnCountByUserMessageId` finds the run before a message through any
 * message with a run, and after a turn longer than the loaded history that is a message of
 * the agent only.
 */
export function withAssistantMessageEntries(
  timelineEntries: ReadonlyArray<TimelineEntry>,
  visibleTurnItems: ReadonlyArray<ThreadStructureVisibleTurnItem>,
): ReadonlyArray<TimelineEntry> {
  const rowIndexByItemId = new Map<string, number>();
  const assistantEntries: Array<{ readonly rowIndex: number; readonly entry: TimelineEntry }> = [];
  visibleTurnItems.forEach((row, rowIndex) => {
    const { item } = row;
    rowIndexByItemId.set(item.id, rowIndex);
    // The stock function skips inherited history, and it reads no text and no time.
    if (item.type !== "assistant_message" || row.visibility === "inherited") return;
    assistantEntries.push({
      rowIndex,
      entry: {
        id: item.messageId,
        kind: "message",
        createdAt: "",
        message: {
          id: item.messageId,
          role: "assistant",
          text: "",
          runId: item.runId,
          streaming: false,
          createdAt: "",
          updatedAt: "",
        },
      },
    });
  });
  if (assistantEntries.length === 0) return timelineEntries;
  const merged: TimelineEntry[] = [];
  let next = 0;
  for (const entry of timelineEntries) {
    const row =
      entry.kind === "message"
        ? entry.projectedItem
        : entry.kind === "work"
          ? entry.entry.projectedItem
          : undefined;
    const rowIndex = row === undefined ? undefined : rowIndexByItemId.get(row.item.id);
    if (rowIndex !== undefined) {
      while (next < assistantEntries.length && assistantEntries[next]!.rowIndex < rowIndex) {
        merged.push(assistantEntries[next]!.entry);
        next += 1;
      }
    }
    merged.push(entry);
  }
  for (; next < assistantEntries.length; next += 1) merged.push(assistantEntries[next]!.entry);
  return merged;
}

/**
 * A copy of the stock `deriveUnsettledRunId` (components/chat/MessagesTimeline.logic.ts), which
 * is not exported. The timeline gives its result to `deriveRevertTurnCountByUserMessageId`, and
 * the take back must ask that function with the same input.
 */
export function unsettledRunIdOf(
  latestRun: Pick<ThreadRunSummary, "runId" | "status" | "completedAt"> | null,
  runningRunId: RunId | null,
): RunId | null {
  if (runningRunId !== null) return runningRunId;
  if (latestRun === null) return null;
  const settled =
    latestRun.completedAt !== null &&
    latestRun.status !== "running" &&
    latestRun.status !== "starting" &&
    latestRun.status !== "waiting";
  return settled ? null : latestRun.runId;
}

/**
 * True while text is selected, so the key stays the copy key. An `input` and a `textarea` keep
 * their selection outside the document selection, so the focused field is read first.
 */
export function isTextSelected(doc: Document = document): boolean {
  if (readTextFocus(doc.activeElement)?.collapsed === false) return true;
  const selection = doc.getSelection();
  return selection !== null && !selection.isCollapsed && selection.toString().length > 0;
}

export interface FocusedStopTurn {
  /** The stock `canInterruptRunningThread` of the chat view, read at the key press. */
  readonly canStop: () => boolean;
  readonly stop: () => void;
}

let focusedStopTurn: FocusedStopTurn | null = null;

/** The chat view of the focused pane registers its stop here. */
export function registerFocusedStopTurn(handle: FocusedStopTurn): () => void {
  focusedStopTurn = handle;
  return () => {
    if (focusedStopTurn === handle) focusedStopTurn = null;
  };
}

export function focusedTurnStoppable(): boolean {
  return focusedStopTurn?.canStop() ?? false;
}

export function stopFocusedTurn(): void {
  focusedStopTurn?.stop();
}

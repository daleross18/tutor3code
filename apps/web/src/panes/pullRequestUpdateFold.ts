import { checkpointFileTotals } from "@t3tools/client-runtime/state/thread-checkpoints";
import { RunId } from "@t3tools/contracts";

import type { MessagesTimelineRow } from "../components/chat/MessagesTimeline.logic";
import type { WorkLogEntry } from "../session-logic";

type FoldRow = Extract<MessagesTimelineRow, { kind: "turn-fold" }>;

const FOLD_KEY_PREFIX = "pull-request-updates:";

/** Some turns of a pull request watch that show as one line. */
export interface PullRequestUpdateFold {
  /** The key of the fold in the stock set of expanded runs. No run has this id. */
  readonly runId: RunId;
  /** The folded rows are `start` to `end`, without `end`. */
  readonly start: number;
  readonly end: number;
  readonly turnCount: number;
  readonly createdAt: string;
}

type TurnStart = "update" | "other";

/**
 * A turn starts at a message of the user or at a notification, as in the stock
 * `timelineEntryStartsResponse`. "update" is the wake of a pull request watch that reports no
 * failed check, no conflict and no passed checks: the server gives those wakes the outcome
 * "updated" (`pullRequestWatch.ts`), and new comments are such a wake.
 */
function turnStartOf(row: MessagesTimelineRow): TurnStart | null {
  if (row.kind === "message") return row.message.role === "user" ? "other" : null;
  if (row.kind !== "work" || row.groupedEntries.length !== 1) return null;
  const entry = row.groupedEntries[0];
  if (entry?.itemType !== "notification") return null;
  const item = entry.structuredPayload;
  return item?.type === "notification" &&
    item.source.kind === "monitor" &&
    item.source.pullRequest !== undefined &&
    item.outcome === "updated"
    ? "update"
    : "other";
}

// Work that reads only. Each other type keeps its turn visible: a file change, a request to
// the user, a sub-agent, an error, a plan, and a type that this client does not know.
const QUIET_WORK_ITEM_TYPES = new Set<WorkLogEntry["itemType"]>([
  "reasoning",
  "checkpoint",
  "command_execution",
  "dynamic_tool",
  "file_search",
  "web_search",
]);

function workEntryIsQuiet(entry: WorkLogEntry): boolean {
  return (
    QUIET_WORK_ITEM_TYPES.has(entry.itemType) &&
    entry.tone !== "error" &&
    entry.toolLifecycleStatus !== "failed" &&
    entry.toolLifecycleStatus !== "declined" &&
    (entry.changedFiles?.length ?? 0) === 0
  );
}

/**
 * True for a row that a settled turn shows when the agent only read and wrote text. A row of a
 * turn that still runs is not quiet, so a turn folds only after the next one ends. The work that
 * stock already collapsed is not read: a changed file shows in the diff summary of the turn.
 */
function rowIsQuiet(row: MessagesTimelineRow): boolean {
  switch (row.kind) {
    case "message":
      return (
        row.message.role === "assistant" &&
        row.message.streaming !== true &&
        (row.assistantTurnDiffSummary === undefined ||
          checkpointFileTotals(row.assistantTurnDiffSummary).count === 0)
      );
    case "assistant-meta":
    case "turn-fold":
    case "viewed-images":
      return true;
    case "work":
      return row.groupedEntries.every(workEntryIsQuiet);
    case "work-toggle":
      return !row.hasFailure;
    default:
      return false;
  }
}

/**
 * The folds of a list of rows. A sequence is two or more quiet update turns in a row. Each turn
 * of a sequence folds, but not the newest one, which stays on the screen.
 */
export function planPullRequestUpdateFolds(
  rows: ReadonlyArray<MessagesTimelineRow>,
): ReadonlyArray<PullRequestUpdateFold> {
  const turns: Array<{ start: number; quietUpdate: boolean }> = [];
  rows.forEach((row, index) => {
    const start = turnStartOf(row);
    if (start !== null) {
      turns.push({ start: index, quietUpdate: start === "update" });
      return;
    }
    const turn = turns.at(-1);
    if (turn?.quietUpdate === true && !rowIsQuiet(row)) turn.quietUpdate = false;
  });

  const folds: PullRequestUpdateFold[] = [];
  let first = 0;
  while (first < turns.length) {
    if (!turns[first]!.quietUpdate) {
      first += 1;
      continue;
    }
    let newest = first;
    while (turns[newest + 1]?.quietUpdate === true) newest += 1;
    if (newest > first) {
      const start = turns[first]!.start;
      const startRow = rows[start]!;
      folds.push({
        runId: RunId.make(`${FOLD_KEY_PREFIX}${startRow.id}`),
        start,
        end: turns[newest]!.start,
        turnCount: newest - first,
        createdAt: startRow.createdAt ?? "",
      });
    }
    first = newest + 1;
  }
  return folds;
}

export function pullRequestUpdatesLabel(turnCount: number): string {
  return turnCount === 1
    ? "1 earlier pull request update"
    : `${turnCount} earlier pull request updates`;
}

/** Open by a click on its line, or because a folded row must show (a match of the find bar). */
export function foldIsOpen(
  rows: ReadonlyArray<MessagesTimelineRow>,
  fold: PullRequestUpdateFold,
  expandedRunIds: ReadonlySet<RunId>,
  revealRowId: string | null,
): boolean {
  if (expandedRunIds.has(fold.runId)) return true;
  if (revealRowId === null) return false;
  for (let index = fold.start; index < fold.end; index += 1) {
    if (rows[index]?.id === revealRowId) return true;
  }
  return false;
}

/** The stock fold row: stock renders the line and toggles `runId` in its set of expanded runs. */
function foldRowOf(fold: PullRequestUpdateFold, expanded: boolean, previous?: FoldRow): FoldRow {
  const label = pullRequestUpdatesLabel(fold.turnCount);
  if (
    previous !== undefined &&
    previous.label === label &&
    previous.expanded === expanded &&
    previous.createdAt === fold.createdAt
  ) {
    return previous;
  }
  return {
    kind: "turn-fold",
    // The stock toggle anchors the list on the key `turn-fold:<run id>`.
    id: `turn-fold:${fold.runId}`,
    createdAt: fold.createdAt,
    runId: fold.runId,
    label,
    expanded,
  };
}

/**
 * The rows with each closed fold as one line, and each open fold as its line and its rows.
 * Returns `rows` itself with no fold. `previousRows` gives the lines of the last call, so a line
 * that did not change keeps its object.
 */
export function applyPullRequestUpdateFolds(
  rows: MessagesTimelineRow[],
  folds: ReadonlyArray<PullRequestUpdateFold>,
  isOpen: (fold: PullRequestUpdateFold) => boolean,
  previousRows: ReadonlyArray<MessagesTimelineRow> = [],
): MessagesTimelineRow[] {
  if (folds.length === 0) return rows;
  const previousLines = new Map<string, FoldRow>();
  for (const row of previousRows) {
    if (row.kind === "turn-fold" && row.runId.startsWith(FOLD_KEY_PREFIX)) {
      previousLines.set(row.id, row);
    }
  }
  const result: MessagesTimelineRow[] = [];
  let cursor = 0;
  for (const fold of folds) {
    result.push(...rows.slice(cursor, fold.start));
    const open = isOpen(fold);
    result.push(foldRowOf(fold, open, previousLines.get(`turn-fold:${fold.runId}`)));
    if (open) result.push(...rows.slice(fold.start, fold.end));
    cursor = fold.end;
  }
  result.push(...rows.slice(cursor));
  return result;
}

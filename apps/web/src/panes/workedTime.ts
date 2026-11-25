import {
  orchestrationV2RunWorkStartedAt,
  type OrchestrationV2Run,
  type OrchestrationV2TurnItem,
  type RunId,
} from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import * as DateTime from "effect/DateTime";

/** A turn that worked for less time than this shows no label, so a short answer stays clean. */
const WORKED_TIME_MIN_MS = 10_000;

type WorkedRun = Pick<
  OrchestrationV2Run,
  | "id"
  | "ordinal"
  | "status"
  | "requestedAt"
  | "startedAt"
  | "completedAt"
  | "workStartedAt"
  | "restartContinuationOfRunId"
  | "manualContinuationOfRunId"
  | "usageLimitContinuationOfRunId"
>;

type WorkedTurnItem =
  | Pick<Extract<OrchestrationV2TurnItem, { type: "notification" }>, "type" | "runId" | "source">
  | { readonly type: Exclude<OrchestrationV2TurnItem["type"], "notification"> };

export interface WorkedTimeProjection {
  readonly runs: ReadonlyArray<WorkedRun>;
  readonly turnItems: ReadonlyArray<WorkedTurnItem>;
}

export interface WorkedTime {
  readonly durationMs: number;
  /** The start of the first run that the number covers, in epoch milliseconds. */
  readonly startedAtMs: number;
  /** Above 1 when the server continued the turn in a new run. */
  readonly runCount: number;
}

const OPEN_RUN_STATUSES = new Set<WorkedRun["status"]>([
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
]);

/** A run that has not ended: the stock timeline still counts it as working. */
export const isOpenRun = (run: Pick<WorkedRun, "status" | "completedAt">): boolean =>
  run.completedAt === null || OPEN_RUN_STATUSES.has(run.status);

const continuedRunId = (run: WorkedRun): RunId | undefined =>
  run.restartContinuationOfRunId ??
  run.manualContinuationOfRunId ??
  run.usageLimitContinuationOfRunId;

const ownStartMs = (run: WorkedRun) => DateTime.toEpochMillis(run.startedAt ?? run.requestedAt);

/**
 * The start that the stock "Working for" label counts from, for each run. One exception: the
 * wake of a pull request watch starts new work, and so do the wakes that follow it, because a
 * watch can wake a thread hours after its work ended.
 */
function workStarts(projection: WorkedTimeProjection): ReadonlyMap<RunId, number> {
  const pullRequestWakes = new Set<RunId>();
  for (const item of projection.turnItems) {
    if (
      item.type === "notification" &&
      item.runId !== null &&
      item.source.kind === "monitor" &&
      item.source.pullRequest !== undefined
    ) {
      pullRequestWakes.add(item.runId);
    }
  }
  const starts = new Map<RunId, number>();
  let previousStock = Number.NaN;
  let previousStart = Number.NaN;
  const started = projection.runs
    .filter((run) => run.startedAt !== null)
    .toSorted(
      (left, right) => ownStartMs(left) - ownStartMs(right) || left.ordinal - right.ordinal,
    );
  for (const run of started) {
    const own = ownStartMs(run);
    const stock = DateTime.toEpochMillis(orchestrationV2RunWorkStartedAt(run));
    const inherits = run.workStartedAt !== undefined && !pullRequestWakes.has(run.id);
    // A wake after a pull request wake carries the stock start of the work before that wake.
    previousStart = !inherits ? own : previousStock === stock ? previousStart : stock;
    previousStock = stock;
    starts.set(run.id, previousStart);
  }
  return starts;
}

/**
 * The working time of the finished turn that ends with the run `runId`. It is the time from the
 * work start of the run to its end, plus the same of each run that it continues after a restart,
 * a usage limit or a manual "continue". The wait between two such runs does not count.
 * Null for a turn that still runs, for a run that a later run continues, and below the threshold.
 */
export function finishedTurnWorkedTime(
  projection: WorkedTimeProjection | null,
  runId: RunId | null | undefined,
): WorkedTime | null {
  if (projection === null || runId == null) return null;
  const runsById = new Map(projection.runs.map((run) => [run.id, run]));
  const last = runsById.get(runId);
  if (last === undefined) return null;
  // A continuation that ended before it started continues nothing.
  const isContinued = projection.runs.some(
    (run) =>
      continuedRunId(run) === runId &&
      (run.startedAt !== null || OPEN_RUN_STATUSES.has(run.status)),
  );
  if (isContinued) return null;

  const starts = workStarts(projection);
  const intervals: Array<readonly [number, number]> = [];
  const seen = new Set<RunId>();
  let run: WorkedRun | undefined = last;
  while (run !== undefined && !seen.has(run.id)) {
    seen.add(run.id);
    if (run.completedAt === null || isOpenRun(run)) return null;
    const start = starts.get(run.id);
    if (start !== undefined) intervals.push([start, DateTime.toEpochMillis(run.completedAt)]);
    const continued = continuedRunId(run);
    run = continued === undefined ? undefined : runsById.get(continued);
  }

  // A run after a restart counts from the start of the run before it, so the two overlap.
  let durationMs = 0;
  let coveredUntil = Number.NEGATIVE_INFINITY;
  for (const [start, end] of intervals.toSorted((left, right) => left[0] - right[0])) {
    durationMs += Math.max(0, end - Math.max(start, coveredUntil));
    coveredUntil = Math.max(coveredUntil, end);
  }
  if (durationMs < WORKED_TIME_MIN_MS) return null;
  const startedAtMs = Math.min(...intervals.map(([start]) => start));
  return { durationMs, startedAtMs, runCount: intervals.length };
}

/** The form of the stock "Working for" label: whole seconds, then the stock duration format. */
export function formatWorkedTime(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1_000));
  return seconds < 60 ? `${seconds}s` : formatDuration(seconds * 1_000);
}

/** The run `runId` and each run that it continues, as the working time counts them. */
export function continuedRunChain(
  runs: ReadonlyArray<WorkedRun>,
  runId: RunId,
): ReadonlyArray<RunId> {
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const chain: RunId[] = [];
  let run = runsById.get(runId);
  while (run !== undefined && !chain.includes(run.id)) {
    chain.push(run.id);
    const continued = continuedRunId(run);
    run = continued === undefined ? undefined : runsById.get(continued);
  }
  return chain;
}

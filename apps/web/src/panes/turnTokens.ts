import type {
  OrchestrationV2ProviderTurn,
  OrchestrationV2RunAttempt,
  RunId,
} from "@t3tools/contracts";

import { continuedRunChain, isOpenRun, type WorkedTimeProjection } from "./workedTime";

/** The part of a thread that carries the per-turn token reports of a stock server. */
export interface TurnTokenProjection {
  readonly attempts: ReadonlyArray<
    Pick<OrchestrationV2RunAttempt, "id" | "runId" | "providerTurnId">
  >;
  readonly providerTurns: ReadonlyArray<
    Pick<OrchestrationV2ProviderTurn, "id" | "runAttemptId" | "status" | "turnTokenUsage">
  >;
}

export interface TurnTokens {
  /** Output of the main agent and of its subagents. */
  readonly output: number;
  /** Input, cache reads included, of the main agent and of its subagents. */
  readonly input: number;
  readonly cachedInput: number;
}

type ProviderTurn = TurnTokenProjection["providerTurns"][number];

function providerTurnsOfRuns(
  projection: TurnTokenProjection,
  runIds: ReadonlyArray<RunId>,
): ReadonlyArray<ProviderTurn> {
  const runs = new Set<string>(runIds);
  const attemptIds = new Set<string>();
  const providerTurnIds = new Set<string>();
  for (const attempt of projection.attempts) {
    if (!runs.has(attempt.runId)) continue;
    attemptIds.add(attempt.id);
    if (attempt.providerTurnId !== null) providerTurnIds.add(attempt.providerTurnId);
  }
  return projection.providerTurns.filter(
    (turn) =>
      providerTurnIds.has(turn.id) ||
      (turn.runAttemptId !== null && attemptIds.has(turn.runAttemptId)),
  );
}

function sumTurnTokens(turns: ReadonlyArray<ProviderTurn>): TurnTokens | null {
  let output = 0;
  let input = 0;
  let cachedInput = 0;
  let reported = false;
  for (const turn of turns) {
    const usage = turn.turnTokenUsage;
    // The counts of a local command describe that command, not model work.
    if (usage === undefined || usage.localCommand === true) continue;
    if (usage.outputTokens === undefined) continue;
    reported = true;
    output += usage.outputTokens + (usage.otherUsage?.outputTokens ?? 0);
    input += (usage.inputTokens ?? 0) + (usage.otherUsage?.inputTokens ?? 0);
    cachedInput += usage.cachedInputTokens ?? 0;
  }
  return reported && output > 0 ? { output, input, cachedInput } : null;
}

/**
 * The tokens that the provider reported for the runs of one finished turn (the Claude and Codex
 * adapters of a stock server send `turnTokenUsage`). Null when no provider turn of these runs
 * reported an output count.
 */
export function finishedTurnTokens(
  projection: TurnTokenProjection | null,
  runIds: ReadonlyArray<RunId>,
): TurnTokens | null {
  if (projection === null || runIds.length === 0) return null;
  return sumTurnTokens(providerTurnsOfRuns(projection, runIds));
}

type LiveTurnProjection = TurnTokenProjection & Pick<WorkedTimeProjection, "runs">;
type Run = LiveTurnProjection["runs"][number];

/**
 * The tokens so far of the turn that ends with the run `runId`: the same sum as a finished turn,
 * over the run and the runs it continues. Null while a provider turn of these runs still works:
 * a stock server sends its count only when it ends, so the sum would then be too low.
 */
export function liveTurnTokens(
  projection: LiveTurnProjection | null,
  runId: RunId | null,
): TurnTokens | null {
  if (projection === null || runId === null) return null;
  if (!projection.runs.some((run) => run.id === runId)) return null;
  const turns = providerTurnsOfRuns(projection, continuedRunChain(projection.runs, runId));
  const working = turns.some((turn) => turn.status === "pending" || turn.status === "running");
  return working ? null : sumTurnTokens(turns);
}

/** The run that started last, or the open run that started last: the run of the "Working" row. */
export function latestRunId(runs: ReadonlyArray<Run>, open = false): RunId | null {
  let latest: Run | null = null;
  for (const run of runs) {
    if (open && !isOpenRun(run)) continue;
    if (latest === null || run.ordinal > latest.ordinal) latest = run;
  }
  return latest?.id ?? null;
}

/**
 * The output tokens on the fold line ("Worked for ...") of the latest turn while its thread still
 * works: its run is open, or background work that the stock bar lists still runs. Null for an
 * older turn and once the work ended, because the footer of a finished turn shows the number.
 */
export function liveFoldTokens(
  projection: LiveTurnProjection | null,
  runId: RunId,
  hasBackgroundWork: () => boolean,
): number | null {
  if (projection === null || latestRunId(projection.runs) !== runId) return null;
  const run = projection.runs.find((candidate) => candidate.id === runId);
  if (run === undefined || (!isOpenRun(run) && !hasBackgroundWork())) return null;
  return liveTurnTokens(projection, runId)?.output ?? null;
}

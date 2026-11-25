import { RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  finishedTurnTokens,
  latestRunId,
  liveFoldTokens,
  liveTurnTokens,
  type TurnTokenProjection,
} from "./turnTokens";

type ProviderTurn = TurnTokenProjection["providerTurns"][number];
type Usage = NonNullable<ProviderTurn["turnTokenUsage"]>;

const usage = (fields: Partial<Usage>): Usage =>
  ({
    usageScope: "main_agent",
    hasSubagents: false,
    usageStatus: "complete",
    inputTokens: 0,
    outputTokens: 0,
    ...fields,
  }) as Usage;

const projection: TurnTokenProjection = {
  attempts: [
    { id: "att-a", runId: "run-a", providerTurnId: "pt-a" },
    { id: "att-b", runId: "run-b", providerTurnId: null },
    { id: "att-c", runId: "run-c", providerTurnId: "pt-c" },
  ] as unknown as TurnTokenProjection["attempts"],
  providerTurns: [
    {
      id: "pt-a",
      runAttemptId: null,
      turnTokenUsage: usage({
        inputTokens: 40_000,
        cachedInputTokens: 30_000,
        outputTokens: 1_200,
      }),
    },
    {
      id: "pt-b",
      runAttemptId: "att-b",
      turnTokenUsage: usage({
        inputTokens: 5_000,
        outputTokens: 300,
        otherUsage: { inputTokens: 2_000, outputTokens: 100 },
      }),
    },
    {
      id: "pt-local",
      runAttemptId: "att-b",
      turnTokenUsage: usage({ outputTokens: 999, localCommand: true }),
    },
    { id: "pt-c", runAttemptId: null, turnTokenUsage: usage({ outputTokens: 7 }) },
  ] as unknown as TurnTokenProjection["providerTurns"],
};

it("sums the reports of the runs of one turn, with subagents, without local commands", () => {
  expect(finishedTurnTokens(projection, [RunId.make("run-b"), RunId.make("run-a")])).toEqual({
    output: 1_600,
    input: 47_000,
    cachedInput: 30_000,
  });
  expect(finishedTurnTokens(projection, [RunId.make("run-c")])?.output).toBe(7);
});

it("gives null with no report, no run, or no projection", () => {
  expect(finishedTurnTokens(projection, [RunId.make("run-x")])).toBeNull();
  expect(finishedTurnTokens(projection, [])).toBeNull();
  expect(finishedTurnTokens(null, [RunId.make("run-a")])).toBeNull();
  const noOutput: TurnTokenProjection = {
    attempts: projection.attempts,
    providerTurns: [{ ...projection.providerTurns[0]!, turnTokenUsage: undefined }],
  };
  expect(finishedTurnTokens(noOutput, [RunId.make("run-a")])).toBeNull();
});

type LiveProjection = NonNullable<Parameters<typeof liveTurnTokens>[0]>;
type Run = LiveProjection["runs"][number];

const openRun = (id: string, ordinal: number, fields: Partial<Run> = {}): Run =>
  ({
    id: RunId.make(id),
    ordinal,
    status: "waiting",
    requestedAt: null,
    startedAt: null,
    completedAt: null,
    ...fields,
  }) as unknown as Run;

const live = (
  runs: ReadonlyArray<Run>,
  status: ProviderTurn["status"] = "completed",
): LiveProjection => ({
  runs,
  attempts: [
    { id: "att-1", runId: "run-1", providerTurnId: "pt-1" },
    { id: "att-2", runId: "run-2", providerTurnId: "pt-2" },
  ] as unknown as LiveProjection["attempts"],
  providerTurns: [
    {
      id: "pt-1",
      runAttemptId: "att-1",
      status: "completed",
      turnTokenUsage: usage({ inputTokens: 9_000, outputTokens: 800 }),
    },
    {
      id: "pt-2",
      runAttemptId: "att-2",
      status,
      ...(status === "completed"
        ? { turnTokenUsage: usage({ inputTokens: 3_000, outputTokens: 400 }) }
        : {}),
    },
  ] as unknown as LiveProjection["providerTurns"],
});

const ended = { status: "completed", completedAt: "2026-11-23T10:00:00.000Z" } as never;

it("counts a run and the runs it continues, once their provider turns ended", () => {
  const runs = [
    openRun("run-1", 1, ended),
    openRun("run-2", 2, { usageLimitContinuationOfRunId: RunId.make("run-1") }),
  ];
  expect(liveTurnTokens(live(runs), RunId.make("run-2"))).toEqual({
    output: 1_200,
    input: 12_000,
    cachedInput: 0,
  });
  expect(liveTurnTokens(live(runs), RunId.make("run-1"))?.output).toBe(800);
});

it("gives no number while a provider turn runs, or for an unknown run", () => {
  const runs = [openRun("run-2", 2, { status: "running" })];
  expect(liveTurnTokens(live(runs, "running"), RunId.make("run-2"))).toBeNull();
  expect(liveTurnTokens(live(runs, "pending"), RunId.make("run-2"))).toBeNull();
  expect(liveTurnTokens(live(runs), RunId.make("run-2"))?.output).toBe(400);
  expect(liveTurnTokens(live(runs), RunId.make("run-2:steer:message-1"))).toBeNull();
  expect(liveTurnTokens(null, RunId.make("run-2"))).toBeNull();
});

it("finds the latest run, and the latest open run of the working row", () => {
  const runs = [
    openRun("run-1", 1),
    openRun("run-3", 3, ended),
    openRun("run-2", 2, { status: "running" }),
  ];
  expect(latestRunId(runs)).toBe("run-3");
  expect(latestRunId(runs, true)).toBe("run-2");
  expect(latestRunId([])).toBeNull();
});

describe("liveFoldTokens", () => {
  const runs = [openRun("run-1", 1, ended), openRun("run-2", 2, ended)];
  const run2 = RunId.make("run-2");

  it("shows the latest turn while background work runs, or while its run is open", () => {
    expect(liveFoldTokens(live(runs), run2, () => true)).toBe(400);
    const open = [runs[0]!, openRun("run-2", 2)];
    expect(liveFoldTokens(live(open), run2, () => false)).toBe(400);
  });

  it("shows nothing once the work ended, for an older turn, or while a provider turn runs", () => {
    expect(liveFoldTokens(live(runs), run2, () => false)).toBeNull();
    expect(liveFoldTokens(live(runs), RunId.make("run-1"), () => true)).toBeNull();
    expect(liveFoldTokens(live(runs, "running"), run2, () => true)).toBeNull();
    expect(liveFoldTokens(null, run2, () => true)).toBeNull();
  });
});

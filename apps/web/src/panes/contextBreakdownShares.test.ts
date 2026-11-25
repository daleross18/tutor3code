import { ProviderThreadId, ProviderTurnId, RunAttemptId, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  contextPartRows,
  deriveContextBreakdown,
  type BreakdownProjection,
  type ContextBreakdown,
  type ContextUsage,
} from "./contextBreakdownShares";

const active = ProviderThreadId.make("provider-thread-active");
const retired = ProviderThreadId.make("provider-thread-retired");
const at = "2026-11-20T10:00:00.000Z";

const usage = (usedTokens: number, more: Partial<ContextUsage> = {}): ContextUsage => ({
  usedTokens,
  maxTokens: 200_000,
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
  reasoningOutputTokens: null,
  autoCompactThreshold: null,
  ...more,
});

const turnId = (ordinal: number) => ProviderTurnId.make(`turn-${ordinal}`);
const runId = (ordinal: number) => RunId.make(`run-${ordinal}`);

/** A turn of the active conversation. `usedTokens` null is a turn that sent no report. */
const turn = (ordinal: number, usedTokens: number | null, providerThreadId = active) => ({
  id: turnId(ordinal),
  providerThreadId,
  ordinal,
  runAttemptId: RunAttemptId.make(`attempt-${ordinal}`),
  ...(usedTokens === null ? {} : { tokenUsage: { usedTokens, updatedAt: at } }),
});

const message = (ordinal: number, text: string) => ({
  item: { type: "user_message", runId: runId(ordinal), providerTurnId: null, text },
});
const compaction = (ordinal: number, afterTokenCount?: number) => ({
  item: {
    type: "compaction",
    runId: runId(ordinal),
    providerTurnId: turnId(ordinal),
    ...(afterTokenCount === undefined ? {} : { afterTokenCount }),
  },
});

const thread = (
  providerTurns: BreakdownProjection["providerTurns"],
  visibleTurnItems: BreakdownProjection["visibleTurnItems"] = [],
): BreakdownProjection => ({
  thread: { activeProviderThreadId: active },
  providerTurns,
  attempts: providerTurns.map(({ ordinal }) => ({
    id: RunAttemptId.make(`attempt-${ordinal}`),
    runId: runId(ordinal),
  })),
  visibleTurnItems,
});

const sum = (breakdown: ContextBreakdown) =>
  breakdown.parts.reduce((total, part) => total + part.tokens, 0);

describe("deriveContextBreakdown", () => {
  it("splits the total by the turn that added each share, and the shares give the total", () => {
    const breakdown = deriveContextBreakdown(
      usage(96_000),
      thread(
        [turn(3, 96_000), turn(1, 30_000), turn(2, 71_500), turn(9, 900_000, retired)],
        [message(2, "  fix the\n failing tests "), message(2, "a steering message")],
      ),
    );
    expect(breakdown.parts).toEqual([
      { kind: "turns", firstOrdinal: 1, lastOrdinal: 1, tokens: 30_000, message: null },
      {
        kind: "turns",
        firstOrdinal: 2,
        lastOrdinal: 2,
        tokens: 41_500,
        message: "fix the failing tests",
      },
      { kind: "turns", firstOrdinal: 3, lastOrdinal: 3, tokens: 24_500, message: null },
    ]);
    expect(sum(breakdown)).toBe(breakdown.usedTokens);
    expect(breakdown).toMatchObject({
      usedTokens: 96_000,
      maxTokens: 200_000,
      freeTokens: 104_000,
      usedPercent: 48,
    });
  });

  it("gives the growth of a turn with no report to the next report, and skips a turn that added nothing", () => {
    const breakdown = deriveContextBreakdown(
      usage(80_000),
      thread([turn(1, 30_000), turn(2, null), turn(3, 55_000), turn(4, 55_000), turn(5, 80_000)]),
    );
    expect(breakdown.parts).toEqual([
      { kind: "turns", firstOrdinal: 1, lastOrdinal: 1, tokens: 30_000, message: null },
      { kind: "turns", firstOrdinal: 2, lastOrdinal: 3, tokens: 25_000, message: null },
      { kind: "turns", firstOrdinal: 5, lastOrdinal: 5, tokens: 25_000, message: null },
    ]);
    expect(sum(breakdown)).toBe(80_000);
  });

  it("starts again at a compaction: what it kept, then the growth after it", () => {
    const turns = [turn(1, 60_000), turn(2, 170_000), turn(3, 52_000), turn(4, 75_000)];
    // The compaction ran in turn 3, which then grew from 40k to 52k.
    const reported = deriveContextBreakdown(usage(75_000), thread(turns, [compaction(3, 40_000)]));
    expect(reported.parts).toEqual([
      { kind: "kept", cause: "compaction", throughOrdinal: 3, tokens: 40_000 },
      { kind: "turns", firstOrdinal: 3, lastOrdinal: 3, tokens: 12_000, message: null },
      { kind: "turns", firstOrdinal: 4, lastOrdinal: 4, tokens: 23_000, message: null },
    ]);
    expect(sum(reported)).toBe(75_000);

    // A compaction with no reported size, a revert, or a compaction item that is not loaded:
    // the context got smaller, and the split inside that turn is unknown.
    for (const items of [[compaction(3)], []]) {
      const unknown = deriveContextBreakdown(usage(75_000), thread(turns, items));
      expect(unknown.parts).toEqual([
        { kind: "kept", cause: "smaller", throughOrdinal: 3, tokens: 52_000 },
        { kind: "turns", firstOrdinal: 4, lastOrdinal: 4, tokens: 23_000, message: null },
      ]);
      expect(sum(unknown)).toBe(75_000);
    }
  });

  it("drops the shares before a compaction also when its turn ends larger than the turn before", () => {
    const breakdown = deriveContextBreakdown(
      usage(190_000),
      thread([turn(1, 150_000), turn(2, 190_000)], [compaction(2, 45_000)]),
    );
    expect(breakdown.parts).toEqual([
      { kind: "kept", cause: "compaction", throughOrdinal: 2, tokens: 45_000 },
      { kind: "turns", firstOrdinal: 2, lastOrdinal: 2, tokens: 145_000, message: null },
    ]);
  });

  it("shows no split when the reports of the turns do not give the total of the row", () => {
    const none = { parts: [], request: [], reasoningTokens: null };
    // No thread detail, no report, a total that a handoff carried, no active conversation.
    expect(deriveContextBreakdown(usage(64_000), null)).toMatchObject(none);
    expect(deriveContextBreakdown(usage(64_000), thread([turn(1, null)]))).toMatchObject(none);
    expect(deriveContextBreakdown(usage(64_000), thread([turn(1, 30_000)]))).toMatchObject(none);
    expect(
      deriveContextBreakdown(usage(30_000), {
        ...thread([turn(1, 30_000)]),
        thread: { activeProviderThreadId: null },
      }),
    ).toMatchObject(none);
    expect(deriveContextBreakdown(usage(64_000, { maxTokens: null }), null)).toMatchObject({
      usedTokens: 64_000,
      maxTokens: null,
      freeTokens: null,
      usedPercent: null,
    });
  });

  it("splits the latest request only when its input and output give the total", () => {
    const request = (more: Partial<ContextUsage>) =>
      deriveContextBreakdown(usage(100_000, more), null);
    expect(
      request({ inputTokens: 92_000, cachedInputTokens: 80_000, outputTokens: 8_000 }),
    ).toMatchObject({
      request: [
        { id: "cached", tokens: 80_000 },
        { id: "newInput", tokens: 12_000 },
        { id: "output", tokens: 8_000 },
      ],
      reasoningTokens: null,
    });
    expect(
      request({ inputTokens: 92_000, outputTokens: 8_000, reasoningOutputTokens: 3_000 }),
    ).toMatchObject({
      request: [
        { id: "input", tokens: 92_000 },
        { id: "output", tokens: 8_000 },
      ],
      reasoningTokens: 3_000,
    });
    // Counts of another scope, for example a sum over a conversation, are not this total.
    expect(
      request({ inputTokens: 400_000, cachedInputTokens: 300_000, outputTokens: 9_000 }),
    ).toMatchObject({ request: [], reasoningTokens: null });
    expect(request({ inputTokens: 100_000 })).toMatchObject({ request: [] });
  });
});

describe("contextPartRows", () => {
  it("lists the newest shares and sums the shares before them into one line", () => {
    const { parts } = deriveContextBreakdown(
      usage(90_000),
      thread(
        [turn(1, 10_000), turn(2, 40_000), turn(3, 20_000), turn(4, 50_000), turn(5, 90_000)],
        [message(5, "add a test")],
      ),
    );
    expect(contextPartRows(parts, 6)).toEqual([
      {
        key: "kept:3",
        label: "Up to turn 3",
        detail: "the context got smaller there",
        tokens: 20_000,
      },
      { key: "turns:4", label: "Turn 4", detail: null, tokens: 30_000 },
      { key: "turns:5", label: "Turn 5", detail: "add a test", tokens: 40_000 },
    ]);
    const rows = contextPartRows(parts, 2);
    expect(rows).toEqual([
      { key: "earlier", label: "Earlier turns", detail: null, tokens: 50_000 },
      { key: "turns:5", label: "Turn 5", detail: "add a test", tokens: 40_000 },
    ]);
    expect(rows.reduce((total, row) => total + row.tokens, 0)).toBe(90_000);
  });
});

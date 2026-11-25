import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import type {
  OrchestrationV2ProviderThread,
  OrchestrationV2ProviderTurn,
  OrchestrationV2RunAttempt,
  ProviderTurnId,
  RunId,
} from "@t3tools/contracts";

/** The numbers of the stock "Context" row that the breakdown reads. */
export type ContextUsage = Pick<
  ContextWindowSnapshot,
  | "usedTokens"
  | "maxTokens"
  | "inputTokens"
  | "cachedInputTokens"
  | "outputTokens"
  | "reasoningOutputTokens"
  | "autoCompactThreshold"
>;

/** A timeline item, as far as the breakdown reads it. Each stock item fits this shape. */
interface BreakdownTurnItem {
  readonly type: string;
  readonly runId: RunId | null;
  readonly providerTurnId: ProviderTurnId | null;
  readonly text?: string | undefined;
  readonly afterTokenCount?: number | undefined;
}

/** The part of a thread detail that carries the token reports of a stock server. */
export interface BreakdownProjection {
  readonly thread: {
    readonly activeProviderThreadId: OrchestrationV2ProviderThread["id"] | null;
  };
  readonly providerTurns: ReadonlyArray<
    Pick<
      OrchestrationV2ProviderTurn,
      "id" | "providerThreadId" | "ordinal" | "runAttemptId" | "tokenUsage"
    >
  >;
  readonly attempts: ReadonlyArray<Pick<OrchestrationV2RunAttempt, "id" | "runId">>;
  readonly visibleTurnItems: ReadonlyArray<{ readonly item: BreakdownTurnItem }>;
}

/**
 * One share of the context. `turns` is the growth that one report covers: its own turn, and the
 * turns before it that sent no report. `kept` is what stayed when the context got smaller: after
 * a compaction with a reported size, else the whole context at the end of that turn.
 */
export type ContextPart =
  | {
      readonly kind: "turns";
      readonly firstOrdinal: number;
      readonly lastOrdinal: number;
      readonly tokens: number;
      /** The message of the user that started the last turn of the part, when the client has it. */
      readonly message: string | null;
    }
  | {
      readonly kind: "kept";
      readonly cause: "compaction" | "smaller";
      readonly throughOrdinal: number;
      readonly tokens: number;
    };

/** One line of the latest model request. `input` is all input when the report has no cache count. */
export interface ContextRequestRow {
  readonly id: "cached" | "newInput" | "input" | "output";
  readonly tokens: number;
}

export interface ContextBreakdown {
  readonly usedTokens: number;
  readonly maxTokens: number | null;
  readonly freeTokens: number | null;
  /** From 0 to 100, rounded as the stock row rounds it. */
  readonly usedPercent: number | null;
  readonly autoCompactThreshold: number | null;
  /** Sums to `usedTokens`. Empty when the reports of the turns do not give that total. */
  readonly parts: ReadonlyArray<ContextPart>;
  /** Sums to `usedTokens`. Empty when the report has no input and output count for that total. */
  readonly request: ReadonlyArray<ContextRequestRow>;
  /** A share of the output of the latest request. Null when the provider reports none. */
  readonly reasoningTokens: number | null;
}

const MESSAGE_LENGTH = 80;

function shortMessage(text: string): string | null {
  const line = text.replace(/\s+/g, " ").trim();
  if (line === "") return null;
  return line.length > MESSAGE_LENGTH ? `${line.slice(0, MESSAGE_LENGTH - 1)}…` : line;
}

/**
 * The context of the active provider conversation, split by the turn that added each share. Each
 * turn carries the context size of its last model request, so the growth of a turn is the
 * difference to the report before it. The first share therefore holds the system prompt, the
 * tools and memory files, for which a stock server sends no size.
 */
function contextParts(projection: BreakdownProjection): ContextPart[] {
  const activeId = projection.thread.activeProviderThreadId;
  if (activeId === null) return [];
  const turns = projection.providerTurns
    .filter((turn) => turn.providerThreadId === activeId)
    .toSorted((left, right) => left.ordinal - right.ordinal);

  const runByAttempt = new Map(projection.attempts.map((attempt) => [attempt.id, attempt.runId]));
  const messageByRun = new Map<RunId, string>();
  const compactedTo = new Map<ProviderTurnId, number>();
  for (const { item } of projection.visibleTurnItems) {
    if (item.type === "user_message" && item.runId !== null && item.text !== undefined) {
      if (!messageByRun.has(item.runId)) messageByRun.set(item.runId, item.text);
    } else if (
      item.type === "compaction" &&
      item.providerTurnId !== null &&
      item.afterTokenCount !== undefined
    ) {
      // The last compaction of a turn decides what the turn kept.
      compactedTo.set(item.providerTurnId, item.afterTokenCount);
    }
  }

  let parts: ContextPart[] = [];
  let previous = 0;
  let firstOrdinal = turns[0]?.ordinal ?? 1;
  for (const turn of turns) {
    if (turn.tokenUsage === undefined) continue;
    const used = turn.tokenUsage.usedTokens;
    const runId = turn.runAttemptId === null ? undefined : runByAttempt.get(turn.runAttemptId);
    const text = runId === undefined ? undefined : messageByRun.get(runId);
    const growth = (tokens: number, from: number): ContextPart => ({
      kind: "turns",
      firstOrdinal: from,
      lastOrdinal: turn.ordinal,
      tokens,
      message: text === undefined ? null : shortMessage(text),
    });
    const after = compactedTo.get(turn.id);
    if (after !== undefined) {
      const kept = Math.min(after, used);
      parts = [{ kind: "kept", cause: "compaction", throughOrdinal: turn.ordinal, tokens: kept }];
      if (used > kept) parts.push(growth(used - kept, turn.ordinal));
    } else if (used < previous) {
      parts = [{ kind: "kept", cause: "smaller", throughOrdinal: turn.ordinal, tokens: used }];
    } else if (used > previous) {
      parts.push(growth(used - previous, firstOrdinal));
    }
    previous = used;
    firstOrdinal = turn.ordinal + 1;
  }
  return parts.filter((part) => part.tokens > 0);
}

function requestRows(usage: ContextUsage, usedTokens: number): ContextRequestRow[] {
  const { inputTokens: input, outputTokens: output, cachedInputTokens: cached } = usage;
  // Only a report whose input and output give the total is the split of that total.
  if (input == null || output == null || input + output !== usedTokens) return [];
  const rows: ContextRequestRow[] =
    cached != null && cached <= input
      ? [
          { id: "cached", tokens: cached },
          { id: "newInput", tokens: input - cached },
        ]
      : [{ id: "input", tokens: input }];
  return [...rows, { id: "output", tokens: output }];
}

/**
 * What fills the context of a thread, from the reports of a stock server only. `usage` is the
 * snapshot of the stock "Context" row, so the total is the number that the row shows.
 */
export function deriveContextBreakdown(
  usage: ContextUsage,
  projection: BreakdownProjection | null,
): ContextBreakdown {
  const usedTokens = Math.max(0, usage.usedTokens);
  const maxTokens = usage.maxTokens != null && usage.maxTokens > 0 ? usage.maxTokens : null;
  const parts = projection === null ? [] : contextParts(projection);
  const explained = parts.reduce((sum, part) => sum + part.tokens, 0);
  const request = requestRows(usage, usedTokens);
  const reasoning = usage.reasoningOutputTokens ?? null;
  return {
    usedTokens,
    maxTokens,
    freeTokens: maxTokens === null ? null : Math.max(0, maxTokens - usedTokens),
    usedPercent:
      maxTokens === null
        ? null
        : Math.round(Math.max(0, Math.min(100, (usedTokens / maxTokens) * 100))),
    autoCompactThreshold:
      usage.autoCompactThreshold != null && usage.autoCompactThreshold > 0
        ? usage.autoCompactThreshold
        : null,
    // The total can come from a handoff or a fork source, which no turn of this conversation
    // reported. A split that does not give the total would be an invented number.
    parts: explained === usedTokens ? parts : [],
    request,
    reasoningTokens: request.length > 0 && reasoning !== null && reasoning > 0 ? reasoning : null,
  };
}

/** One line of the list of shares. Oldest first, as the bar reads from left to right. */
export interface ContextPartRow {
  readonly key: string;
  readonly label: string;
  readonly detail: string | null;
  readonly tokens: number;
}

function turnRange(first: number, last: number): string {
  return first === last ? `Turn ${last}` : `Turns ${first} to ${last}`;
}

function partRow(part: ContextPart): ContextPartRow {
  if (part.kind === "turns") {
    return {
      key: `turns:${part.lastOrdinal}`,
      label: turnRange(part.firstOrdinal, part.lastOrdinal),
      detail: part.message,
      tokens: part.tokens,
    };
  }
  return part.cause === "compaction"
    ? {
        key: `kept:${part.throughOrdinal}`,
        label: "Kept by the compaction",
        detail: `in turn ${part.throughOrdinal}`,
        tokens: part.tokens,
      }
    : {
        key: `kept:${part.throughOrdinal}`,
        label: `Up to turn ${part.throughOrdinal}`,
        detail: "the context got smaller there",
        tokens: part.tokens,
      };
}

/** At most `limit` lines: the newest `limit - 1` shares and one line that sums the shares before them. */
export function contextPartRows(
  parts: ReadonlyArray<ContextPart>,
  limit: number,
): ContextPartRow[] {
  if (parts.length <= limit) return parts.map(partRow);
  const earlier = parts.slice(0, parts.length - (limit - 1));
  return [
    {
      key: "earlier",
      label: "Earlier turns",
      detail: null,
      tokens: earlier.reduce((sum, part) => sum + part.tokens, 0),
    },
    ...parts.slice(earlier.length).map(partRow),
  ];
}

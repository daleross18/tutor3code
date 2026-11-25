import {
  deriveLatestContextWindowSnapshot,
  latestProviderTurnTokenUsage,
} from "@t3tools/client-runtime/state/context-window";
import {
  isOrchestrationV2WorkActive,
  type NodeId,
  type OrchestrationV2PendingBackgroundTask,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2ProviderTurn,
  type OrchestrationV2Subagent,
} from "@t3tools/contracts";

/** The part of a thread that carries the token reports of a stock server. */
export interface TokenProjection {
  readonly thread: {
    readonly activeProviderThreadId: OrchestrationV2ProviderThread["id"] | null;
  };
  readonly providerThreads: ReadonlyArray<
    Pick<OrchestrationV2ProviderThread, "id" | "contextUsage" | "updatedAt">
  >;
  readonly providerTurns: ReadonlyArray<
    Pick<OrchestrationV2ProviderTurn, "providerThreadId" | "tokenUsage">
  >;
}

/**
 * The context size that the active provider conversation of a thread last reported, in tokens:
 * the number of the stock "Context" row of the thread details, from the same two stock functions.
 * Null when the server sent no report, and for a report of zero.
 */
export function threadContextTokens(projection: TokenProjection | null): number | null {
  if (projection === null) return null;
  const providerThread = projection.providerThreads.find(
    (thread) => thread.id === projection.thread.activeProviderThreadId,
  );
  const liveUsage = latestProviderTurnTokenUsage(projection.providerTurns, null, providerThread);
  const used = deriveLatestContextWindowSnapshot([], liveUsage, providerThread)?.usedTokens;
  return used !== undefined && used > 0 ? used : null;
}

type TokenSubagent = Pick<OrchestrationV2Subagent, "status" | "workflow" | "childThreadId">;

/**
 * The thread whose detail holds the number of a subagent, or null when the client must not read
 * one: the subagent ended, or it is a workflow with its own total. A task in a linked environment
 * has no child thread here.
 */
export function subagentTokenThreadId(
  subagent: TokenSubagent,
): OrchestrationV2Subagent["childThreadId"] {
  if (!isOrchestrationV2WorkActive(subagent.status) || subagent.workflow !== undefined) return null;
  return subagent.childThreadId;
}

/**
 * The tokens of a subagent that still works. A workflow reports its own total. Any other
 * subagent has a number only through the thread that runs it, so `child` is that thread.
 */
export function subagentWorkTokens(
  subagent: TokenSubagent,
  child: TokenProjection | null,
): number | null {
  if (!isOrchestrationV2WorkActive(subagent.status)) return null;
  const reported = subagent.workflow?.totalTokens;
  if (reported !== undefined) return reported > 0 ? reported : null;
  return subagent.workflow === undefined ? threadContextTokens(child) : null;
}

/**
 * The total of a subagent group: the sum over the members that still work. Null when no member
 * works, and when a working member has no number, because the sum would then be too low.
 */
export function sumWorkTokens(
  members: ReadonlyArray<{
    readonly status: OrchestrationV2Subagent["status"];
    readonly tokens: number | null;
  }>,
): number | null {
  let total = 0;
  let working = 0;
  for (const { status, tokens } of members) {
    if (!isOrchestrationV2WorkActive(status)) continue;
    if (tokens === null) return null;
    working += 1;
    total += tokens;
  }
  return working === 0 ? null : total;
}

interface BackgroundTurnItem {
  readonly id: string;
  readonly type: string;
  readonly nativeItemRef: { readonly nativeId: string | null } | null;
  readonly subagentId?: NodeId;
}

/**
 * The tokens of the work that the stock background work bar lists: the sum over its subagents.
 * A command or a monitor runs no model, so it adds nothing. Null when the list has no subagent,
 * and when a listed subagent has no number, because the sum would then be too low.
 */
export function backgroundWorkTokens(
  tasks: ReadonlyArray<
    Pick<OrchestrationV2PendingBackgroundTask, "taskId" | "kind" | "nativeItemId">
  >,
  turnItems: ReadonlyArray<BackgroundTurnItem>,
  tokens: ReadonlyMap<NodeId, number>,
): number | null {
  let total = 0;
  let subagents = 0;
  for (const task of tasks) {
    // The key that the stock bar uses to find the turn item of a task.
    const key = task.nativeItemId ?? task.taskId;
    const item = turnItems.findLast(
      (candidate) => (candidate.nativeItemRef?.nativeId || candidate.id) === key,
    );
    if (item?.type !== "subagent" || item.subagentId === undefined) {
      if (task.kind === "subagent") return null;
      continue;
    }
    const count = tokens.get(item.subagentId);
    if (count === undefined) return null;
    total += count;
    subagents += 1;
  }
  return subagents === 0 ? null : total;
}

function scaled(value: number, unit: string, digits: number): string {
  return `${value.toFixed(digits).replace(/\.0+$/, "")}${unit}`;
}

/** "512 tokens", "12.4k tokens", "182k tokens", "1.25m tokens". */
export function formatWorkTokens(tokens: number): string {
  const count = Math.max(0, Math.round(tokens));
  if (count < 1_000) return count === 1 ? "1 token" : `${count} tokens`;
  if (count < 99_950) return `${scaled(count / 1_000, "k", 1)} tokens`;
  if (count < 999_500) return `${Math.round(count / 1_000)}k tokens`;
  return `${scaled(count / 1_000_000, "m", 2)} tokens`;
}

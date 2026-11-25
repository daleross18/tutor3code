import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { parseThreadKey, threadKey } from "@t3tools/client-runtime/state/entities";
import type {
  EnvironmentId,
  NodeId,
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2Subagent,
  RunId,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { isPullRequestWatchTask } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import { Atom } from "effect/reactivity";
import { use } from "react";

import { deriveThreadPendingBackgroundTasks } from "../components/ChatView.logic";
import { TimelineRowCtx } from "../components/chat/timelineRowContext";
import { environmentThreadDetails } from "../state/threads";
import { useReadoutSettingsStore } from "./readoutSettings";
import { latestRunId, liveFoldTokens, liveTurnTokens } from "./turnTokens";
import {
  backgroundWorkTokens,
  formatWorkTokens,
  subagentTokenThreadId,
  subagentWorkTokens,
  sumWorkTokens,
  threadContextTokens,
} from "./workTokens";

type SubagentTokens = ReadonlyMap<NodeId, number>;
const NO_SUBAGENT_TOKENS: SubagentTokens = new Map();

function sameTokens(left: SubagentTokens, right: SubagentTokens): boolean {
  if (left.size !== right.size) return false;
  for (const [id, tokens] of right) if (left.get(id) !== tokens) return false;
  return true;
}

// The number of a child thread is in its detail only, so this reads the detail of each child that
// still works, as the stock desktop client does for every running thread. The structure atoms do
// not change while text streams, and an equal result keeps its identity, so nothing repaints.
const workingSubagentTokensAtom = Atom.family((key: string) => {
  const parentRef = parseThreadKey(key);
  let previous = NO_SUBAGENT_TOKENS;
  return Atom.make((get) => {
    const parent = get(environmentThreadDetails.quietThreadAtom(parentRef));
    const next = new Map<NodeId, number>();
    for (const subagent of parent?.projection.subagents ?? []) {
      const childThreadId = subagentTokenThreadId(subagent);
      const child =
        childThreadId === null
          ? null
          : get(
              environmentThreadDetails.quietThreadAtom(
                scopeThreadRef(parentRef.environmentId, childThreadId),
              ),
            );
      const tokens = subagentWorkTokens(subagent, child?.projection ?? null);
      if (tokens !== null) next.set(subagent.id, tokens);
    }
    if (!sameTokens(previous, next)) previous = next;
    return previous;
  }).pipe(Atom.setIdleTTL(0), Atom.withLabel(`fork-working-subagent-tokens:${key}`));
});

function useShowWorkTokens(): boolean {
  return useReadoutSettingsStore((settings) => settings.showWorkTokens);
}

/**
 * Beside the stock "Working for ..." label: the tokens that the turn reported so far, when the
 * provider reported them, and the context size of the thread of this timeline.
 */
export function RunningTurnTokens() {
  const { threadRef } = use(TimelineRowCtx);
  return useShowWorkTokens() && threadRef !== null ? <ThreadTokens threadRef={threadRef} /> : null;
}

function ThreadTokens({ threadRef }: { threadRef: ScopedThreadRef }) {
  // One string, so the label renders again only when one of its numbers changes.
  const key = useAtomValue(environmentThreadDetails.quietThreadAtom(threadRef), (thread) => {
    const projection = thread?.projection ?? null;
    const spent =
      projection === null
        ? null
        : liveTurnTokens(projection, latestRunId(projection.runs, true))?.output;
    return `${spent ?? -1}:${threadContextTokens(projection) ?? -1}`;
  });
  const [spent, context] = key.split(":").map(Number) as [number, number];
  const parts = [
    ...(spent >= 0 ? [formatWorkTokens(spent)] : []),
    ...(context >= 0 ? [`${formatWorkTokens(context)} in context`] : []),
  ];
  if (parts.length === 0) return null;
  return (
    <span data-work-tokens="turn" className="min-w-0 truncate">
      · {parts.join(" · ")}
    </span>
  );
}

/** In the fold line ("Worked for ...") of the latest turn while it still works: its tokens. */
export function LiveTurnTokens({ runId }: { runId: RunId }) {
  const { threadRef } = use(TimelineRowCtx);
  return useShowWorkTokens() && threadRef !== null ? (
    <FoldTokens threadRef={threadRef} runId={runId} />
  ) : null;
}

/** The number of the fold line of `runId`; while it is not null, the footer leaves it out. */
export function foldLineTokens(
  projection: Parameters<typeof deriveThreadPendingBackgroundTasks>[0],
  runId: RunId,
): number | null {
  // The stock list of the background work bar; a pull request watch runs no agent.
  return liveFoldTokens(projection, runId, () =>
    deriveThreadPendingBackgroundTasks(projection).some((task) => !isPullRequestWatchTask(task)),
  );
}

function FoldTokens({ threadRef, runId }: { threadRef: ScopedThreadRef; runId: RunId }) {
  const tokens = useAtomValue(environmentThreadDetails.quietThreadAtom(threadRef), (thread) =>
    foldLineTokens(thread?.projection ?? null, runId),
  );
  if (tokens === null) return null;
  return <span data-work-tokens="fold"> · {formatWorkTokens(tokens)}</span>;
}

/** In the stock background work bar, before its time: the tokens of the work it lists. */
export function BackgroundWorkTokens(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>;
  turnItems: Parameters<typeof backgroundWorkTokens>[1];
}) {
  return useShowWorkTokens() ? <BackgroundTokensLabel {...props} /> : null;
}

function BackgroundTokensLabel({
  environmentId,
  threadId,
  tasks,
  turnItems,
}: Parameters<typeof BackgroundWorkTokens>[0]) {
  const total = useAtomValue(
    workingSubagentTokensAtom(threadKey(scopeThreadRef(environmentId, threadId))),
    (all) => backgroundWorkTokens(tasks, turnItems, all),
  );
  if (total === null) return null;
  return (
    <span data-work-tokens="background" className="tabular-nums">
      {formatWorkTokens(total)}
    </span>
  );
}

/** In the row of one subagent, before its time: its tokens while it works. */
export function SubagentWorkTokens(props: { parentRef: ScopedThreadRef; subagentId: NodeId }) {
  return useShowWorkTokens() ? <SubagentTokensLabel {...props} /> : null;
}

function SubagentTokensLabel({
  parentRef,
  subagentId,
}: {
  parentRef: ScopedThreadRef;
  subagentId: NodeId;
}) {
  const tokens = useAtomValue(
    workingSubagentTokensAtom(threadKey(parentRef)),
    (all) => all.get(subagentId) ?? null,
  );
  if (tokens === null) return null;
  return (
    <span
      data-work-tokens="subagent"
      className="shrink-0 text-xs text-muted-foreground tabular-nums"
    >
      {formatWorkTokens(tokens)}
    </span>
  );
}

interface GroupMember {
  readonly item: { readonly threadId: ThreadId; readonly subagentId: NodeId };
  readonly status: OrchestrationV2Subagent["status"];
}

/** After the status counts of a subagent group: the total of the members that still work. */
export function SubagentGroupWorkTokens(props: {
  environmentId: EnvironmentId;
  agents: ReadonlyArray<GroupMember>;
}) {
  const parentThreadId = props.agents[0]?.item.threadId;
  return useShowWorkTokens() && parentThreadId !== undefined ? (
    <GroupTokensLabel
      parentRef={scopeThreadRef(props.environmentId, parentThreadId)}
      agents={props.agents}
    />
  ) : null;
}

function GroupTokensLabel({
  parentRef,
  agents,
}: {
  parentRef: ScopedThreadRef;
  agents: ReadonlyArray<GroupMember>;
}) {
  const total = useAtomValue(workingSubagentTokensAtom(threadKey(parentRef)), (all) =>
    sumWorkTokens(
      agents.map(({ item, status }) => ({ status, tokens: all.get(item.subagentId) ?? null })),
    ),
  );
  if (total === null) return null;
  return <span data-work-tokens="group"> · {formatWorkTokens(total)}</span>;
}

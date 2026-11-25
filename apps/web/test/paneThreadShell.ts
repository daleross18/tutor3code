import {
  ORCHESTRATION_V2_WS_METHODS,
  type OrchestrationV2ShellStreamItem,
  type OrchestrationV2ThreadShell,
  type ProjectId,
  type ThreadPullRequestLink,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { answerRpc, fakeDriver, type FakeThread } from "./fakeEnvironment";

export const REPOSITORY_KEY = "github.com/tutorintelligence/codebase";
const AT = "2026-11-18T10:00:00.000Z";

export function threadPullRequest(
  number: number,
  headBranch: string,
  state: "open" | "merged",
  baseBranch = "dev",
): ThreadPullRequestLink {
  return {
    host: "github.com",
    repository: "tutorintelligence/codebase",
    number,
    url: `https://github.com/tutorintelligence/codebase/pull/${number}`,
    source: "created",
    linkedAt: AT,
    snapshot: {
      state,
      title: `Pull request ${number}`,
      headBranch,
      baseBranch,
      isDraft: false,
      updatedAt: AT,
      syncedAt: AT,
      ...(state === "merged" ? { mergedAt: AT } : {}),
    },
    stack: null,
  };
}

function stockShellStream() {
  // The fake driver hands out its client only inside this Effect, which has already succeeded.
  const lease = Effect.runSync(Effect.scoped(fakeDriver.connect({ target: null } as never)));
  return (
    lease.session.client as unknown as Record<
      string,
      (input: never) => Stream.Stream<OrchestrationV2ShellStreamItem>
    >
  )[ORCHESTRATION_V2_WS_METHODS.subscribeShell]!;
}

/**
 * The fake environment puts each thread in its one project. This moves the named threads to
 * another project, and leaves the projects as they are, so each one stays a group of its own.
 */
export function serveThreadProjects(projectByThread: ReadonlyMap<FakeThread, ProjectId>) {
  const stockShell = stockShellStream();
  const projects = new Map([...projectByThread].map(([thread, id]) => [String(thread.id), id]));
  return answerRpc(ORCHESTRATION_V2_WS_METHODS.subscribeShell, (input: never) =>
    Stream.map(stockShell(input), (item) =>
      item.kind !== "snapshot"
        ? item
        : {
            ...item,
            snapshot: {
              ...item.snapshot,
              threads: item.snapshot.threads.map((thread) => ({
                ...thread,
                projectId: projects.get(String(thread.id)) ?? thread.projectId,
              })),
            },
          },
    ),
  );
}

type ShellChange = Partial<Pick<OrchestrationV2ThreadShell, "pullRequests" | "settledOverride">>;

/**
 * The fake environment has a project with no repository and threads with no pull request. This
 * gives the project a repository and each named thread its shell fields, and sends a later
 * change of a thread shell, as a server does when a pull request merges and a thread settles.
 */
export function serveThreadShells(initial: ReadonlyMap<FakeThread, ShellChange>) {
  const stockShell = stockShellStream();
  const changes = new Map([...initial].map(([thread, change]) => [String(thread.id), change]));
  const shells = new Map<string, OrchestrationV2ThreadShell>();
  let updates: Queue.Queue<OrchestrationV2ShellStreamItem> | null = null;
  let sequence = 0;
  const answer = answerRpc(ORCHESTRATION_V2_WS_METHODS.subscribeShell, (input: never) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const queue = yield* Queue.unbounded<OrchestrationV2ShellStreamItem>();
        updates = queue;
        const first = Stream.map(stockShell(input), (item) => {
          if (item.kind !== "snapshot") return item;
          sequence = item.snapshot.snapshotSequence;
          const threads = item.snapshot.threads.map((thread) => ({
            ...thread,
            ...changes.get(String(thread.id)),
          }));
          for (const thread of threads) shells.set(String(thread.id), thread);
          const projects = item.snapshot.projects.map((project) => ({
            ...project,
            repositoryIdentity: {
              canonicalKey: REPOSITORY_KEY,
              locator: {
                source: "git-remote" as const,
                remoteName: "origin",
                remoteUrl: "git@github.com:tutorintelligence/codebase.git",
              },
            },
          }));
          return { ...item, snapshot: { ...item.snapshot, threads, projects } };
        });
        return Stream.merge(first, Stream.fromQueue(queue));
      }),
    ),
  );
  return {
    change: (thread: FakeThread, change: ShellChange) => {
      const shell = { ...shells.get(String(thread.id))!, ...change };
      shells.set(String(thread.id), shell);
      sequence += 1;
      Queue.offerUnsafe(updates!, {
        kind: "thread.updated",
        sequence,
        location: "active",
        thread: shell,
      });
    },
    [Symbol.dispose]: () => answer[Symbol.dispose](),
  };
}

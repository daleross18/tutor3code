import type { ScopedThreadRef } from "@t3tools/contracts";

import { useLinkedThreadPullRequest } from "../components/ThreadStatusIndicators";
import { useQuietThreadShell } from "../state/entities";

/**
 * The pull request that stock shows for a thread: the current link of the thread, which is the
 * top open layer of a stack, else the pull request that the server found for its branch.
 */
export function usePaneThreadPullRequest(threadRef: ScopedThreadRef) {
  const thread = useQuietThreadShell(threadRef);
  const linked = useLinkedThreadPullRequest(
    threadRef.environmentId,
    thread?.linkedPullRequest,
    thread !== null,
    thread?.pullRequests,
    thread?.branchPullRequest,
  );
  return { thread, pullRequest: linked?.pr ?? null };
}

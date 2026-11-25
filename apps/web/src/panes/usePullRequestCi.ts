import { selectEnvironmentQueryData } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ProjectId,
  PullRequestChecksState,
  PullRequestRef,
  ThreadPullRequestLink,
} from "@t3tools/contracts";
import { useEffect } from "react";

import { useNowMinute } from "../hooks/useNowMinute";
import { linkedPullRequestDetailAtom, pullRequestEnvironment } from "../state/pullRequests";
import { useEnvironmentQueryRefresh, useEnvironmentQuerySelector } from "../state/query";
import { usePullRequestChecksSupport } from "./pullRequestChecksSupport";
import {
  type CiStatusView,
  createLaneClock,
  createSharedInterval,
  deriveCiStatus,
  laneRunningSince,
  observeRunningLanes,
} from "./ciStatus";

/** While a lane runs, the list of lanes is read again at this interval. */
const RUNNING_REFRESH_MS = 60_000;
const laneClock = createLaneClock();
const shareRunningRefresh = createSharedInterval(RUNNING_REFRESH_MS);

export interface PullRequestCi {
  readonly status: CiStatusView;
  /** Null until the host or the saved link gave a state. */
  readonly checksState: PullRequestChecksState | null;
}

/**
 * The CI lanes and the auto-merge state of one open pull request of a thread. Call it for an
 * open pull request only: it asks for the stock summary, and for the list of lanes while the
 * state is pending or failing. The sidebar row and the chip of the bottom bar both use it, with
 * the stock atoms and the stock input shape, so they share one cached answer for each request.
 */
export function useOpenPullRequestCi(
  thread: { readonly environmentId: EnvironmentId; readonly projectId: ProjectId },
  link: ThreadPullRequestLink,
): PullRequestCi {
  const { environmentId } = thread;
  // The shape of the stock requests, so this view and the stock panels share one cached answer.
  const reference: PullRequestRef = {
    projectId: thread.projectId,
    host: link.host,
    repository: link.repository,
    number: link.number,
  };
  const summary = useEnvironmentQuerySelector(
    linkedPullRequestDetailAtom({ environmentId, input: reference }),
    selectEnvironmentQueryData,
  );
  const checksState = summary?.checksState ?? link.snapshot?.checksState ?? null;
  const supportsChecks = usePullRequestChecksSupport(environmentId);
  // A passing pull request needs no list of lanes, so it costs no request.
  const checksAtom =
    supportsChecks && checksState !== null && checksState !== "passing"
      ? pullRequestEnvironment.checks({ environmentId, input: reference })
      : null;
  const checks =
    useEnvironmentQuerySelector(checksAtom, selectEnvironmentQueryData)?.checks ?? null;
  const { refresh } = useEnvironmentQueryRefresh(checksAtom);
  const running = checksAtom !== null && checksState === "pending";
  const pullKey = `${environmentId}:${link.host}/${link.repository}#${link.number}`;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a timer outside React: the stock checks request has no interval of its own, and a lane that runs changes on the host
  useEffect(
    () => (running ? shareRunningRefresh(pullKey, refresh) : undefined),
    [running, pullKey, refresh],
  );

  // The minute tick is the clock of the view. A lane seen after the tick shows "<1m".
  const nowMinuteMs = Date.parse(useNowMinute());
  const nowMs = Number.isNaN(nowMinuteMs) ? 0 : nowMinuteMs;
  const headSha = summary?.headSha ?? link.watch?.headSha ?? "";
  const runningNames = (checks ?? [])
    .filter((check) => check.status === "pending" && check.placeholder !== true)
    .map((check) => check.name);
  const runningKey = runningNames.join("\n");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records when this client first saw each lane run, in a clock outside React that outlives the view
  useEffect(() => {
    observeRunningLanes(
      laneClock,
      pullKey,
      headSha,
      runningKey === "" ? [] : runningKey.split("\n"),
      Date.now(),
    );
  }, [pullKey, headSha, runningKey]);

  const status = deriveCiStatus({
    checksState,
    checks,
    watchFailedNames: link.watch?.failedChecks ?? [],
    autoMergeEnabled: summary?.autoMergeEnabled,
    autoMergeMethod: summary?.autoMergeMethod,
    runningSince: (name) => laneRunningSince(laneClock, pullKey, name),
    nowMs,
  });
  return { status, checksState };
}

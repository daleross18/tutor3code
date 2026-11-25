import type { PullRequestCheck, PullRequestChecksState } from "@t3tools/contracts";

/** The stock server sends no start time of a check. This is when this client first saw it run. */
export interface LaneClock {
  /** One entry for each pull request: the head commit and the first sight of each running lane. */
  readonly pulls: Map<string, { headSha: string; lanes: Map<string, number> }>;
}

export function createLaneClock(): LaneClock {
  return { pulls: new Map() };
}

/**
 * Records the lanes that run now. A lane that ended leaves, and a new head commit starts
 * every timer again, because each lane runs again for it.
 */
export function observeRunningLanes(
  clock: LaneClock,
  pullKey: string,
  headSha: string,
  runningNames: ReadonlyArray<string>,
  nowMs: number,
): void {
  const known = clock.pulls.get(pullKey);
  const lanes = known !== undefined && known.headSha === headSha ? known.lanes : new Map();
  for (const name of lanes.keys()) {
    if (!runningNames.includes(name)) lanes.delete(name);
  }
  for (const name of runningNames) {
    if (!lanes.has(name)) lanes.set(name, nowMs);
  }
  if (lanes.size === 0) clock.pulls.delete(pullKey);
  else clock.pulls.set(pullKey, { headSha, lanes });
}

export function laneRunningSince(clock: LaneClock, pullKey: string, name: string): number | null {
  return clock.pulls.get(pullKey)?.lanes.get(name) ?? null;
}

/** "<1m", "7m", "1h 05m". */
export function formatLaneElapsed(elapsedMs: number): string {
  const minutes = Math.floor(Math.max(elapsedMs, 0) / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * One timer for each key, however many users ask for it. A sidebar row and the chips of the
 * panes that show the same pull request then refresh its lanes one time for each interval.
 */
export function createSharedInterval(
  intervalMs: number,
): (key: string, run: () => void) => () => void {
  const entries = new Map<string, { users: number; timer: ReturnType<typeof setInterval> }>();
  return (key, run) => {
    const known = entries.get(key);
    if (known === undefined) entries.set(key, { users: 1, timer: setInterval(run, intervalMs) });
    else known.users += 1;
    let left = false;
    return () => {
      const entry = entries.get(key);
      if (left || entry === undefined) return;
      left = true;
      entry.users -= 1;
      if (entry.users > 0) return;
      clearInterval(entry.timer);
      entries.delete(key);
    };
  };
}

export type CiTone = "failed" | "running" | "approval";

export interface CiStatusView {
  /** Null when no lane needs attention: the stock badge already shows a passing state. */
  readonly tone: CiTone | null;
  readonly label: string | null;
  /** The time of the lane that runs for the longest time. Null when the view shows no such lane. */
  readonly elapsed: string | null;
  readonly autoMerge: boolean;
  /** One fact in each line, for the tooltip. */
  readonly details: ReadonlyArray<string>;
}

const FAILED_STATUSES: ReadonlySet<PullRequestCheck["status"]> = new Set(["failure", "cancelled"]);

function firstAndCount(names: ReadonlyArray<string>, suffix = ""): string {
  const more = names.length > 1 ? ` +${names.length - 1}` : "";
  return `${names[0]}${suffix}${more}`;
}

/**
 * What the sidebar row shows for the open pull request of a thread. A failed lane comes before
 * a running one, because it needs an action. `checks` is null until the list of lanes arrived:
 * the state of the whole pull request and the failed names of the server's watch stand in.
 */
export function deriveCiStatus(input: {
  readonly checksState: PullRequestChecksState | null;
  readonly checks: ReadonlyArray<PullRequestCheck> | null;
  readonly watchFailedNames: ReadonlyArray<string>;
  readonly autoMergeEnabled: boolean | undefined;
  readonly autoMergeMethod: string | undefined;
  readonly runningSince: (name: string) => number | null;
  readonly nowMs: number;
}): CiStatusView {
  const lanes = (input.checks ?? []).filter((check) => check.placeholder !== true);
  const failed =
    input.checks === null
      ? input.checksState === "failing"
        ? input.watchFailedNames
        : []
      : lanes.filter((check) => FAILED_STATUSES.has(check.status)).map((check) => check.name);
  const approval = lanes.filter((check) => check.status === "action-required");
  const running = lanes
    .filter((check) => check.status === "pending")
    .map((check) => ({ name: check.name, since: input.runningSince(check.name) ?? input.nowMs }))
    .toSorted((first, second) => first.since - second.since);
  const elapsed = (since: number) => formatLaneElapsed(input.nowMs - since);

  const details = [
    ...(failed.length > 0 ? [`Failed: ${failed.join(", ")}`] : []),
    ...(approval.length > 0
      ? [`Waits for approval: ${approval.map((check) => check.name).join(", ")}`]
      : []),
    ...(running.length > 0
      ? [
          `Running (time since this app saw it): ${running
            .map((lane) => `${lane.name} ${elapsed(lane.since)}`)
            .join(", ")}`,
        ]
      : []),
    ...(input.autoMergeEnabled === true
      ? [
          `Auto-merge is on${input.autoMergeMethod === undefined ? "" : ` (${input.autoMergeMethod})`}`,
        ]
      : input.autoMergeEnabled === false
        ? ["Auto-merge is off"]
        : []),
  ];
  const autoMerge = input.autoMergeEnabled === true;

  if (failed.length > 0) {
    return { tone: "failed", label: firstAndCount(failed), elapsed: null, autoMerge, details };
  }
  if (input.checks === null && input.checksState === "failing") {
    return { tone: "failed", label: "CI failed", elapsed: null, autoMerge, details };
  }
  const longest = running[0];
  if (longest !== undefined) {
    const longestElapsed = elapsed(longest.since);
    const label = firstAndCount(
      running.map((lane) => lane.name),
      ` ${longestElapsed}`,
    );
    return { tone: "running", label, elapsed: longestElapsed, autoMerge, details };
  }
  if (approval.length > 0) {
    const label = firstAndCount(approval.map((check) => check.name));
    return { tone: "approval", label, elapsed: null, autoMerge, details };
  }
  if (input.checksState === "pending") {
    return { tone: "running", label: "CI", elapsed: null, autoMerge, details };
  }
  return { tone: null, label: null, elapsed: null, autoMerge, details };
}

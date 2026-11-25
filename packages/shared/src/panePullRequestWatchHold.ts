// Fork: the Tutor3 client turns the hold off from a client setting. A server never calls the
// setter, so a server keeps the stock rule.
let watchHoldsThread = true;

export function setPullRequestWatchHoldsThread(holds: boolean): void {
  watchHoldsThread = holds;
}

export function pullRequestWatchHoldsThread(): boolean {
  return watchHoldsThread;
}

// The task id prefix of the stock module. The test pins the two to each other.
const PULL_REQUEST_WATCH_TASK_ID = "pull-request-watch:";

/** A stock server sends the awaited mark of a watch, so the client must ignore it while the hold is off. */
export function awaitedTaskHolds(task: {
  readonly awaited?: true | undefined;
  readonly taskId?: string | undefined;
}): boolean {
  if (task.awaited !== true) return false;
  return watchHoldsThread || task.taskId?.startsWith(PULL_REQUEST_WATCH_TASK_ID) !== true;
}

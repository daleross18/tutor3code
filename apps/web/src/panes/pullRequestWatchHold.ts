import { setPullRequestWatchHoldsThread } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";

import { useReadoutSettingsStore } from "./readoutSettings";

/** Gives the setting to the shared hold rule, now and at each change. Call it once at start, before thread data arrives. */
export function startPullRequestWatchHoldSetting(): void {
  const apply = (settings: { readonly releaseWatchedPullRequests: boolean }) =>
    setPullRequestWatchHoldsThread(!settings.releaseWatchedPullRequests);
  apply(useReadoutSettingsStore.getState());
  useReadoutSettingsStore.subscribe(apply);
}

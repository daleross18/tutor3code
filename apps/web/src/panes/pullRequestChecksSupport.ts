import type { EnvironmentId } from "@t3tools/contracts";

import { useServerConfigs } from "../state/entities";

/** The stock gate of the checks request: an environment that cannot list checks gets no request. */
export function usePullRequestChecksSupport(environmentId: EnvironmentId): boolean {
  return useServerConfigs().get(environmentId)?.environment.capabilities.pullRequestChecks === true;
}

import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * The readout's own query on the stock request. The stock `serverEnvironment.hostResources` atom
 * must go idle between automatic drafts: load balancing gets its fresh sample from the mount of
 * that atom, and a reader that holds it mounted leaves a new draft with an old sample.
 */
export const environmentResourcesQuery = createEnvironmentRpcQueryAtomFamily(
  connectionAtomRuntime,
  {
    label: "fork:environment-resources",
    tag: WS_METHODS.serverGetHostResources,
    staleTimeMs: 5_000,
    idleTtlMs: 0,
  },
);

import type { EnvironmentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/reactivity";

import { orchestrationEnvironment } from "../state/orchestration";
import {
  readArtifactPublishOutput,
  type ArtifactFetchCandidate,
  type ArtifactPublishOutput,
} from "./threadArtifacts";

const EMPTY_OUTPUTS: ReadonlyMap<string, ArtifactPublishOutput> = new Map();

interface PublishOutputsKey {
  readonly environmentId: EnvironmentId;
  readonly candidates: ReadonlyArray<
    Pick<ArtifactFetchCandidate, "key" | "threadId" | "itemId" | "revision">
  >;
}

/**
 * A stock 0.1.10 server drops the URL and title from the wire output of a publish, so each first
 * publish needs its full item. A settled answer stays cached by the stock turn item query.
 */
const publishOutputsAtom = Atom.family((key: string) => {
  const { environmentId, candidates } = JSON.parse(key) as PublishOutputsKey;
  return Atom.make((get) => {
    const outputs = new Map<string, ArtifactPublishOutput>();
    for (const candidate of candidates) {
      const result = get(
        orchestrationEnvironment.turnItem({
          environmentId,
          input: {
            threadId: candidate.threadId,
            itemId: candidate.itemId,
            revision: candidate.revision,
          },
        }),
      );
      const item = AsyncResult.getOrElse(result, () => null)?.item;
      if (item?.type !== "dynamic_tool") continue;
      const output = readArtifactPublishOutput(item.output);
      if (output !== null) outputs.set(candidate.key, output);
    }
    return outputs.size === 0 ? EMPTY_OUTPUTS : outputs;
  }).pipe(Atom.setIdleTTL(0), Atom.withLabel("fork:thread-artifact-publish-outputs"));
});

const EMPTY_OUTPUTS_ATOM = Atom.make(EMPTY_OUTPUTS);

/** The URL and title of each first publish, by candidate key. Pending and failed fetches add none. */
export function useArtifactPublishOutputs(
  environmentId: EnvironmentId,
  candidates: ReadonlyArray<ArtifactFetchCandidate>,
): ReadonlyMap<string, ArtifactPublishOutput> {
  const key =
    candidates.length === 0
      ? null
      : JSON.stringify({
          environmentId,
          candidates: candidates.map(({ key, threadId, itemId, revision }) => ({
            key,
            threadId,
            itemId,
            revision,
          })),
        } satisfies PublishOutputsKey);
  return useAtomValue(key === null ? EMPTY_OUTPUTS_ATOM : publishOutputsAtom(key));
}

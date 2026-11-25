import { useAtomValue } from "@effect/atom-react";
import type { RunId, ScopedThreadRef } from "@t3tools/contracts";
import { use } from "react";

import { TimelineRowCtx } from "../components/chat/timelineRowContext";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { environmentThreadDetails } from "../state/threads";
import { formatChatTimestampTooltip } from "../timestampFormat";
import { useReadoutSettingsStore } from "./readoutSettings";
import { finishedTurnTokens } from "./turnTokens";
import { foldLineTokens } from "./WorkTokenLabels";
import { continuedRunChain, finishedTurnWorkedTime, formatWorkedTime } from "./workedTime";
import { formatWorkTokens } from "./workTokens";

import "./workedTime.css";

/** In the stock footer of the last agent message of a finished turn, after the stock time. */
export function WorkedTimeLabel({ message }: { message: { readonly runId?: RunId | null } }) {
  const { threadRef } = use(TimelineRowCtx);
  const shown = useReadoutSettingsStore((settings) => settings.showWorkedTime);
  return shown && threadRef !== null && message.runId != null ? (
    <FinishedTurnLabel threadRef={threadRef} runId={message.runId} />
  ) : null;
}

function FinishedTurnLabel({ threadRef, runId }: { threadRef: ScopedThreadRef; runId: RunId }) {
  const { timestampFormat } = use(TimelineRowCtx);
  const showTokens = useReadoutSettingsStore((settings) => settings.showWorkTokens);
  // One string, so the label renders again only when a number of the turn changes. The number of
  // a finished turn is fixed, so the label has no timer.
  const key = useAtomValue(environmentThreadDetails.quietThreadAtom(threadRef), (thread) => {
    const projection = thread?.projection ?? null;
    const worked = finishedTurnWorkedTime(projection, runId);
    if (worked === null || projection === null) return null;
    // While the fold line of the turn shows the number, the footer leaves it out.
    const tokens =
      showTokens && foldLineTokens(projection, runId) === null
        ? finishedTurnTokens(projection, continuedRunChain(projection.runs, runId))
        : null;
    return [
      worked.durationMs,
      worked.startedAtMs,
      worked.runCount,
      tokens?.output ?? -1,
      tokens?.input ?? -1,
      tokens?.cachedInput ?? -1,
    ].join(":");
  });
  if (key === null) return null;
  const [durationMs, startedAtMs, runCount, output, input, cachedInput] = key
    .split(":")
    .map(Number) as [number, number, number, number, number, number];
  const startedAt = formatChatTimestampTooltip(
    new Date(startedAtMs).toISOString(),
    timestampFormat,
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={<p data-worked-time="" className="text-muted-foreground text-xs tabular-nums" />}
      >
        · worked {formatWorkedTime(durationMs)}
        {output >= 0 ? <span data-worked-tokens=""> · {formatWorkTokens(output)}</span> : null}
      </TooltipTrigger>
      <TooltipPopup>
        Work started {startedAt}
        {runCount > 1 ? `, in ${runCount} runs` : null}
        {output >= 0 ? (
          <>
            <br />
            Output {formatWorkTokens(output)}, input {formatWorkTokens(input)}
            {cachedInput > 0 ? ` (${formatWorkTokens(cachedInput)} from the cache)` : null}
          </>
        ) : null}
      </TooltipPopup>
    </Tooltip>
  );
}

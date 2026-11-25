import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import type { ThreadPullRequestLink } from "@t3tools/contracts";
import { PullRequestGlyph } from "../components/pullRequest/pullRequestIcons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import type { SidebarThreadSummary } from "../types";
import { useReadoutSettingsStore } from "./readoutSettings";
import { CI_TONE_CLASS, CI_TONE_ICON } from "./ciTone";
import { useOpenPullRequestCi } from "./usePullRequestCi";

type CiThread = Pick<SidebarThreadSummary, "environmentId" | "projectId" | "pullRequests">;

/**
 * The CI lanes and the auto-merge state of the open pull request of a thread, in the meta line
 * of its sidebar row. It renders nothing with the setting off, with no open pull request, and
 * when every lane passed and auto-merge is off.
 */
export function ThreadCiStatus({ thread }: { thread: CiThread }) {
  const enabled = useReadoutSettingsStore((settings) => settings.showCiStatus);
  const link = enabled ? resolveThreadCurrentPullRequestLink(thread.pullRequests) : null;
  if (link === null || link.snapshot?.state !== "open") return null;
  return <OpenPullRequestCiStatus thread={thread} link={link} />;
}

function OpenPullRequestCiStatus({
  thread,
  link,
}: {
  thread: CiThread;
  link: ThreadPullRequestLink;
}) {
  const { status } = useOpenPullRequestCi(thread, link);
  if (status.tone === null && !status.autoMerge) return null;
  const Icon = status.tone === null ? null : CI_TONE_ICON[status.tone];
  const MergeIcon = PullRequestGlyph.merged;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            data-thread-ci-status={status.tone ?? "passed"}
            className="inline-flex min-w-0 max-w-32 shrink items-center gap-1"
          />
        }
      >
        {status.tone !== null && Icon !== null ? (
          <span
            className={cn("inline-flex min-w-0 items-center gap-0.5", CI_TONE_CLASS[status.tone])}
          >
            <Icon aria-hidden className="size-3 shrink-0" />
            <span className="truncate tabular-nums">{status.label}</span>
          </span>
        ) : null}
        {status.autoMerge ? (
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <MergeIcon aria-hidden className="size-3 shrink-0" />
            <span>auto</span>
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipPopup>
        <span className="flex flex-col gap-0.5">
          {status.details.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
}

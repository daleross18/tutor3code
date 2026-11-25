import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  resolveThreadCurrentPullRequestLink,
  visibleThreadPullRequests,
} from "@t3tools/client-runtime/thread-pull-requests";
import type { EnvironmentId, ThreadId, ThreadPullRequestLink } from "@t3tools/contracts";
import type { MouseEvent as ReactMouseEvent } from "react";

import { ComposerContextLabel } from "../components/ComposerContextLabel";
import { ComposerControl } from "../components/chat/ComposerControl";
import {
  PULL_REQUEST_STATE_PRESENTATION,
  PullRequestGlyph,
} from "../components/pullRequest/pullRequestIcons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { cn } from "../lib/utils";
import { useQuietThreadShell } from "../state/entities";
import { CI_TONE_CLASS, CI_TONE_ICON } from "./ciTone";
import { paneRefusesPanel } from "./panePanelViews";
import { derivePullRequestChip, type PullRequestChipView } from "./prChipState";
import "./pullRequestChip.css";
import { useReadoutSettingsStore } from "./readoutSettings";
import { type PullRequestCi, useOpenPullRequestCi } from "./usePullRequestCi";

interface ChipProps {
  readonly thread: EnvironmentThreadShell;
  readonly link: ThreadPullRequestLink;
  readonly others: number;
}

/**
 * The pull request of a thread in the strip under the composer, after the stock items: the
 * stock glyph in the color of the state, the number, at most one CI mark, and the auto-merge
 * mark. It renders nothing with the setting off, for a draft thread, and for a thread with no
 * linked pull request. It shows the link that the stock thread details show first.
 */
export function PullRequestChip({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const enabled = useReadoutSettingsStore((settings) => settings.showPullRequestChip);
  const thread = useQuietThreadShell(enabled ? scopeThreadRef(environmentId, threadId) : null);
  const links = thread?.pullRequests ?? [];
  const link = resolveThreadCurrentPullRequestLink(links);
  if (thread === null || link === null) return null;
  const others = visibleThreadPullRequests(links).length - 1;
  // Only an open pull request costs a request, as in the sidebar row.
  return link.snapshot?.state === "open" ? (
    <OpenPullRequestChip thread={thread} link={link} others={others} />
  ) : (
    <PullRequestChipControl thread={thread} link={link} others={others} ci={null} />
  );
}

function OpenPullRequestChip(props: ChipProps) {
  return <PullRequestChipControl {...props} ci={useOpenPullRequestCi(props.thread, props.link)} />;
}

function stateGlyph(state: PullRequestChipView["state"]) {
  return state === "unknown"
    ? { Icon: PullRequestGlyph.pullRequest, toneClassName: "text-muted-foreground" }
    : PULL_REQUEST_STATE_PRESENTATION[state];
}

function PullRequestChipControl({
  thread,
  link,
  others,
  ci,
}: ChipProps & { readonly ci: PullRequestCi | null }) {
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const openPrLink = useOpenPrLink(threadRef);
  const view = derivePullRequestChip({
    link,
    others,
    ci,
    term: (
      sourceControlClients.findByChangeRequestUrl(link.url) ?? sourceControlClients.get(undefined)
    ).changeRequest,
  });
  const glyph = stateGlyph(view.state);
  const MarkIcon = view.mark === null ? null : CI_TONE_ICON[view.mark.tone];
  const AutoMergeIcon = PullRequestGlyph.merged;
  const open = (event: ReactMouseEvent<HTMLElement>) => {
    // A pane with no right panel cannot show the pull request in the app. The click then stays
    // a plain link, which the browser and the desktop app open outside the app.
    if (paneRefusesPanel(threadRef)) return;
    openPrLink(event, link.url);
  };
  return (
    // A group of the strip: stock measures the width of the children of each group.
    <div data-pull-request-chip={view.state} className="flex shrink-0 items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerControl
              size="xs"
              render={<a href={link.url} target="_blank" rel="noopener noreferrer" />}
              aria-label={view.label}
              onClick={open}
            />
          }
        >
          <glyph.Icon aria-hidden className={cn("size-3 shrink-0", glyph.toneClassName)} />
          <ComposerContextLabel>
            <span className="tabular-nums">{view.number}</span>
          </ComposerContextLabel>
          {view.mark !== null && MarkIcon !== null ? (
            <span
              data-pull-request-chip-mark={view.mark.tone}
              className={cn("inline-flex items-center gap-1", CI_TONE_CLASS[view.mark.tone])}
            >
              <MarkIcon aria-hidden className="size-3 shrink-0" />
              {view.mark.elapsed === null ? null : (
                <ComposerContextLabel>
                  <span className="tabular-nums">{view.mark.elapsed}</span>
                </ComposerContextLabel>
              )}
            </span>
          ) : null}
          {view.autoMerge ? (
            <AutoMergeIcon aria-hidden data-pull-request-chip-auto className="size-3 shrink-0" />
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="top">
          <span className="flex flex-col gap-0.5">
            {view.details.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

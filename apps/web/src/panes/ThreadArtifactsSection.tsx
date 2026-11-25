import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { CheckIcon, CopyIcon, FileTextIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { useOpenLink } from "../browser/useOpenLink";
import { useThreadRecentHistory } from "../browserHistoryStore";
import { ThreadDetailsControl } from "../components/chat/ThreadDetailsControl";
import { ThreadDetailsSection } from "../components/chat/ThreadDetailsSection";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS,
} from "../components/chat/threadDetailsPanelStyles";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useTimelineVisibleTurnItems } from "../state/entities";
import { openArtifactLinkInApp } from "./openArtifactLink";
import { useReadoutSettingsStore } from "./readoutSettings";
import {
  collectThreadArtifacts,
  mergeArtifactTitles,
  type ThreadArtifactRow as ArtifactRow,
} from "./threadArtifacts";
import { useArtifactPublishOutputs } from "./threadArtifactsQuery";

const PAGE_COUNT = 5;
const HISTORY_LIMIT = 50;
const HOVER_ACTION_CLASS =
  "pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

/** The claude.ai artifacts that the thread published or changed (setting `showThreadArtifacts`). */
export function ThreadArtifactsSection(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const enabled = useReadoutSettingsStore((settings) => settings.showThreadArtifacts);
  if (!enabled) return null;
  return <ThreadArtifactsList {...props} />;
}

function ThreadArtifactsList(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const threadRef = scopeThreadRef(props.environmentId, props.threadId);
  const items = useTimelineVisibleTurnItems(threadRef);
  const collected = collectThreadArtifacts(items);
  const fetched = useArtifactPublishOutputs(props.environmentId, collected.fetchCandidates);
  const history = useThreadRecentHistory(threadRef, HISTORY_LIMIT);
  const rows = mergeArtifactTitles(collected, fetched, history);
  const [visibleCount, setVisibleCount] = useState(PAGE_COUNT);
  if (rows.length === 0) return null;
  const hiddenCount = Math.max(0, rows.length - visibleCount);
  return (
    <ThreadDetailsSection
      headingId="thread-details-artifacts-heading"
      title="Artifacts"
      data-thread-artifacts-panel
    >
      <div>
        <ul aria-label="Artifacts" className="m-0 max-h-[13.5rem] list-none overflow-y-auto p-0">
          {rows.slice(0, visibleCount).map((row) => (
            <ThreadArtifactRowItem key={row.url} row={row} threadRef={threadRef} />
          ))}
        </ul>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_COUNT)}
            className={`flex h-8 w-full cursor-pointer items-center rounded-lg ${THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS} text-sm font-medium text-muted-foreground/70 hover:bg-black/[0.055] hover:text-foreground/80 dark:hover:bg-white/[0.075]`}
          >
            <PlusIcon aria-hidden className="size-4 shrink-0" />
            Show {Math.min(hiddenCount, PAGE_COUNT)} more
          </button>
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}

function ThreadArtifactRowItem(props: {
  readonly row: ArtifactRow;
  readonly threadRef: ScopedThreadRef;
}) {
  const { row, threadRef } = props;
  const openLink = useOpenLink(threadRef);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  return (
    <li className="group relative flex h-8 items-center rounded-lg">
      <Tooltip>
        <TooltipTrigger
          delay={200}
          render={
            <ThreadDetailsControl
              size="sm"
              variant="ghost"
              part="row"
              onClick={(event) => {
                if (openArtifactLinkInApp(event, row.url, threadRef)) return;
                void openLink(row.url, { event }).catch((cause: unknown) => console.error(cause));
              }}
            />
          }
        >
          <FileTextIcon aria-hidden className={THREAD_DETAILS_PANEL_ICON_CLASS} />
          <span className="block min-w-0 flex-1 truncate text-left text-sm font-medium leading-4 text-foreground/85 group-focus-within:pe-6 group-hover:pe-6">
            {row.title}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="left">
          <span className="block font-medium">{row.title}</span>
          <span className="block text-muted-foreground">{row.url}</span>
          {row.description ? (
            <span className="block max-w-80 text-muted-foreground">{row.description}</span>
          ) : null}
        </TooltipPopup>
      </Tooltip>
      <div className={HOVER_ACTION_CLASS}>
        <Tooltip>
          <TooltipTrigger
            render={
              <ThreadDetailsControl
                size="icon-xs"
                variant="ghost"
                part="icon"
                aria-label={`Copy the link of ${row.title}`}
                onClick={() => copyToClipboard(row.url, undefined)}
              />
            }
          >
            {isCopied ? (
              <CheckIcon aria-hidden className="size-3.5" />
            ) : (
              <CopyIcon aria-hidden className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipPopup side="left">{isCopied ? "Copied" : "Copy link"}</TooltipPopup>
        </Tooltip>
      </div>
    </li>
  );
}

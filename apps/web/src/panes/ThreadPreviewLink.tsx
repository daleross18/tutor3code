import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { MonitorUpIcon } from "lucide-react";

import { ThreadDetailsControl } from "../components/chat/ThreadDetailsControl";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LABEL_CLASS,
} from "../components/chat/threadDetailsPanelStyles";
import { Button } from "../components/ui/button";
import { toastManager } from "../components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { readLocalApi } from "../localApi";
import { useProject, useQuietThreadShell } from "../state/entities";
import { usePaneThreadPullRequest } from "./paneThreadPullRequest";
import { usePaneThreadStore } from "./paneThreadStore";
import { resolvePreviewUrl } from "./threadPreviewUrl";

/** The preview URL template of the thread's repository. Empty when the repository has none. */
function useThreadPreviewTemplate(threadRef: ScopedThreadRef): string {
  const thread = useQuietThreadShell(threadRef);
  const project = useProject(
    thread === null ? null : scopeProjectRef(thread.environmentId, thread.projectId),
  );
  const repositoryKey = project?.repositoryIdentity?.canonicalKey;
  return usePaneThreadStore((settings) =>
    repositoryKey === undefined ? "" : (settings.previewUrlTemplates[repositoryKey] ?? ""),
  );
}

/** Null until the thread has a pull request with a head branch. */
function useThreadPreviewUrl(threadRef: ScopedThreadRef, template: string): string | null {
  const { pullRequest } = usePaneThreadPullRequest(threadRef);
  return resolvePreviewUrl(template, pullRequest?.headRef ?? null);
}

/** The default browser in the desktop app, a new tab in a browser. */
function openPreview(url: string): void {
  const opened = readLocalApi()?.shell.openExternal(url) ?? Promise.reject(new Error("No shell."));
  void opened.catch((error: unknown) => {
    toastManager.add({
      type: "error",
      title: "Could not open the preview",
      description: error instanceof Error ? error.message : url,
    });
  });
}

const hostOf = (url: string) => new URL(url).host;

function PreviewHeaderButton({ threadRef, template }: PreviewLinkProps & { template: string }) {
  const url = useThreadPreviewUrl(threadRef, template);
  if (url === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Open preview"
            data-thread-preview-link="header"
            onClick={() => openPreview(url)}
          />
        }
      >
        <MonitorUpIcon aria-hidden />
      </TooltipTrigger>
      <TooltipPopup side="bottom">Open preview: {hostOf(url)}</TooltipPopup>
    </Tooltip>
  );
}

function PreviewDetailsRow({ threadRef, template }: PreviewLinkProps & { template: string }) {
  const url = useThreadPreviewUrl(threadRef, template);
  if (url === null) return null;
  return (
    <ThreadDetailsControl
      variant="ghost"
      size="sm"
      part="row"
      aria-label={`Open preview: ${hostOf(url)}`}
      data-thread-preview-link="details"
      onClick={() => openPreview(url)}
    >
      <MonitorUpIcon aria-hidden className={THREAD_DETAILS_PANEL_ICON_CLASS} />
      <span className={`min-w-0 flex-1 truncate text-left ${THREAD_DETAILS_PANEL_LABEL_CLASS}`}>
        Preview: {hostOf(url)}
      </span>
    </ThreadDetailsControl>
  );
}

interface PreviewLinkProps {
  readonly threadRef: ScopedThreadRef;
}

/**
 * The preview link of a thread, in the chat header. It renders nothing, and reads no pull
 * request, while the repository of the thread has no preview URL template.
 */
export function ThreadPreviewLinkButton({ threadRef }: PreviewLinkProps) {
  const template = useThreadPreviewTemplate(threadRef);
  return template === "" ? null : <PreviewHeaderButton threadRef={threadRef} template={template} />;
}

/** The same link as a row under the pull request rows of the thread details. */
export function ThreadPreviewLinkRow({ threadRef }: PreviewLinkProps) {
  const template = useThreadPreviewTemplate(threadRef);
  return template === "" ? null : <PreviewDetailsRow threadRef={threadRef} template={template} />;
}

import {
  scopedProjectKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";

import { composerDraftHasUserContent, DraftId, useComposerDraftStore } from "../composerDraftStore";
import { getClientSettings } from "../hooks/useSettings";
import { readThreadPreviewState } from "../previewStateStore";
import { readProjects } from "../state/entities";
import { usePaneStore } from "./paneStore";
import { isMultiLayout, listLeaves, type PaneLayout } from "./paneTree";

// Not a scoped project key (no colon), so the draft store never reads a project out of it.
const PANE_DRAFT_KEY_PREFIX = "fork-pane-draft/";

function shownDraftIds(layout: PaneLayout): Set<string> {
  const draftIds = new Set<string>();
  for (const tab of layout.tabs) {
    for (const leaf of listLeaves(tab.root)) {
      if (leaf.target?.kind === "draft") draftIds.add(leaf.target.draftId);
    }
  }
  return draftIds;
}

/**
 * Stock keeps one reusable empty draft for each project, under the project's key, and opens it
 * again for every new thread. With more than one pane, a draft that a pane shows moves to a key
 * of its own. The stock new-thread flow then makes a fresh draft, and never reopens or resets a
 * draft that another pane shows. A draft under any key is saved across a restart.
 */
function ownShownDrafts(layout: PaneLayout): void {
  if (!isMultiLayout(layout)) return;
  for (const draftId of shownDraftIds(layout)) {
    const drafts = useComposerDraftStore.getState();
    const session = drafts.draftThreadsByThreadKey[draftId];
    // A promoting draft is about to become a server thread, and a new key would end that.
    if (session === undefined || session.promotedTo != null) continue;
    const ownKey = `${PANE_DRAFT_KEY_PREFIX}${draftId}`;
    if (drafts.logicalProjectDraftThreadKeyByLogicalProjectKey[ownKey] === draftId) continue;
    drafts.setLogicalProjectDraftThreadId(
      ownKey,
      scopeProjectRef(session.environmentId, session.projectId),
      DraftId.make(draftId),
    );
  }
}

/**
 * With one tab and one pane the stock rule holds again: the shown draft goes back under its
 * project's key, so the stock new-thread action reuses it and keeps its branch and mode. A
 * project that already has a reusable draft keeps that one.
 */
function releaseShownDraft(layout: PaneLayout): void {
  if (isMultiLayout(layout)) return;
  for (const draftId of shownDraftIds(layout)) {
    const drafts = useComposerDraftStore.getState();
    const keys = drafts.logicalProjectDraftThreadKeyByLogicalProjectKey;
    const session = drafts.draftThreadsByThreadKey[draftId];
    if (keys[`${PANE_DRAFT_KEY_PREFIX}${draftId}`] !== draftId) continue;
    if (session === undefined || session.promotedTo != null) continue;
    const projectRef = scopeProjectRef(session.environmentId, session.projectId);
    // The key that the stock new-thread flow looks its reusable draft up under.
    const project = readProjects().find(
      (candidate) =>
        candidate.id === projectRef.projectId &&
        candidate.environmentId === projectRef.environmentId,
    );
    const projectKey = project
      ? deriveLogicalProjectKeyFromSettings(
          project,
          selectProjectGroupingSettings(getClientSettings()),
        )
      : scopedProjectKey(projectRef);
    if (keys[projectKey] !== undefined) continue;
    drafts.setLogicalProjectDraftThreadId(projectKey, projectRef, DraftId.make(draftId));
  }
}

/** A draft under a pane key that no pane shows is unreachable when it is empty, so it goes. */
function dropUnshownEmptyDrafts(layout: PaneLayout): void {
  const shown = shownDraftIds(layout);
  const drafts = useComposerDraftStore.getState();
  for (const [key, draftId] of Object.entries(
    drafts.logicalProjectDraftThreadKeyByLogicalProjectKey,
  )) {
    if (!key.startsWith(PANE_DRAFT_KEY_PREFIX) || shown.has(draftId)) continue;
    const session = drafts.draftThreadsByThreadKey[draftId];
    if (session === undefined || session.promotedTo != null) continue;
    if (composerDraftHasUserContent(drafts.draftsByThreadKey[draftId])) continue;
    // Stock keeps an empty draft that has an open browser preview.
    const threadRef = scopeThreadRef(session.environmentId, session.threadId);
    if (Object.keys(readThreadPreviewState(threadRef).sessions).length > 0) continue;
    drafts.clearDraftThread(DraftId.make(draftId));
  }
}

function followFinalizedDrafts(): void {
  const drafts = useComposerDraftStore.getState();
  usePaneStore
    .getState()
    .retargetInactiveDrafts((draftId) =>
      drafts.getDraftSession(draftId) === null ? drafts.getPromotedDraftRedirect(draftId) : null,
    );
}

/** Applies the pane draft rules to the current layout. Safe to call at any time. */
export function syncPaneDrafts(): void {
  const { layout } = usePaneStore.getState();
  ownShownDrafts(layout);
  releaseShownDraft(layout);
  dropUnshownEmptyDrafts(layout);
}

/** Keeps the pane draft rules applied while the pane host is mounted. Returns the uninstall. */
export function installPaneDraftSync(): () => void {
  let syncing = false;
  const sync = () => {
    // The sync writes to the draft store, which reports back to this same listener.
    if (syncing) return;
    syncing = true;
    try {
      syncPaneDrafts();
    } finally {
      syncing = false;
    }
  };
  sync();
  followFinalizedDrafts();
  const stopPanes = usePaneStore.subscribe((state, previous) => {
    if (state.layout !== previous.layout) sync();
  });
  const stopDrafts = useComposerDraftStore.subscribe((state, previous) => {
    if (state.promotedDraftRedirects !== previous.promotedDraftRedirects) followFinalizedDrafts();
    // Stock can put a shown draft back under its project's key, for example on a project change.
    if (
      state.logicalProjectDraftThreadKeyByLogicalProjectKey !==
      previous.logicalProjectDraftThreadKeyByLogicalProjectKey
    ) {
      sync();
    }
  });
  return () => {
    stopPanes();
    stopDrafts();
  };
}

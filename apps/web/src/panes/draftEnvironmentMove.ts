import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

import {
  composerDraftHasUserContent,
  type DraftId,
  useComposerDraftStore,
} from "../composerDraftStore";
import type { NewThreadHandler } from "../hooks/useHandleNewThread";
import { seedDraftModelSelection } from "../lib/seedDraftModelSelection";

// The user chose the environment, so the stock "Auto balance" must not move the draft again.
const CHOSEN_ENVIRONMENT = {
  environmentSelection: "manual",
  loadBalancedEnvironmentId: null,
} as const;

/**
 * Moves an unsent draft to a project of another environment with the two stock flows of the
 * project picker: an empty draft opens that project's draft, and a draft with text or
 * attachments keeps them and gets the model of a new thread there.
 */
export async function moveDraftToProject(input: {
  readonly draftId: DraftId;
  readonly project: Pick<EnvironmentProject, "environmentId" | "id">;
  readonly logicalProjectKey: string;
  readonly openProjectDraft: NewThreadHandler;
}): Promise<void> {
  const { draftId, project } = input;
  const store = useComposerDraftStore.getState();
  const session = store.getDraftSession(draftId);
  // A draft that was sent is a thread, and a thread never changes its environment.
  if (!session || session.promotedTo) return;
  const projectRef = scopeProjectRef(project.environmentId, project.id);
  if (!composerDraftHasUserContent(store.getComposerDraft(draftId))) {
    const opened = await input.openProjectDraft(projectRef);
    if (opened) store.setDraftThreadContext(opened.draftId, CHOSEN_ENVIRONMENT);
    return;
  }
  store.setLogicalProjectDraftThreadId(
    input.logicalProjectKey,
    projectRef,
    draftId,
    CHOSEN_ENVIRONMENT,
  );
  seedDraftModelSelection(draftId, projectRef);
}

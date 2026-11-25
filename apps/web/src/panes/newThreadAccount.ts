import type { ModelSelection, ScopedProjectRef, ServerProvider } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";

import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import { resolveProjectDefaultProviderModelSelection } from "../providerInstances";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readProject } from "../state/entities";
import { environmentServerConfigsAtom } from "../state/server";
import {
  accountWithMostQuota,
  QUOTA_DRIVER,
  selectionWithMostQuota,
  type AccountPickContext,
} from "./accountQuota";
import { useReadoutSettingsStore } from "./readoutSettings";

/** A pick needs a choice: two or more Claude accounts on the environment. */
function hasAccountChoice(providers: ReadonlyArray<ServerProvider>): boolean {
  return providers.filter((provider) => provider.driver === QUOTA_DRIVER).length >= 2;
}

const sameAccountAndModel = (left: ModelSelection | null, right: ModelSelection) =>
  left !== null && left.instanceId === right.instanceId && left.model === right.model;

/**
 * What a new thread starts with when "New threads use the account with the most quota left" is
 * on. Null leaves the draft as stock left it.
 */
export function resolveNewThreadAccount(input: {
  /** What stock sets on the draft. Null: stock sets nothing. */
  readonly stockSelection: ModelSelection | null;
  /** The default model of the project, before stock moved it to the fallback model. */
  readonly defaultSelection: ModelSelection | null;
  /** What the draft shows when stock sets nothing: its sticky model, or the first provider. */
  readonly seededSelection: () => ModelSelection | null;
  readonly context: AccountPickContext;
}): ModelSelection | null {
  const { stockSelection, defaultSelection, context } = input;
  // With one Claude account, or none, the stock selection stays.
  if (!hasAccountChoice(context.providers)) return stockSelection;
  const isQuotaAccount = (selection: ModelSelection) =>
    context.providers.find((provider) => provider.instanceId === selection.instanceId)?.driver ===
    QUOTA_DRIVER;
  // Stock moves a default that is out of usage to the fallback model. With this setting, a
  // Claude account that still has quota for the default model comes before that fallback.
  if (
    defaultSelection !== null &&
    !sameAccountAndModel(stockSelection, defaultSelection) &&
    isQuotaAccount(defaultSelection)
  ) {
    const best = accountWithMostQuota(defaultSelection, context);
    if (best !== null && best.headroom > 0) {
      return { ...defaultSelection, instanceId: best.provider.instanceId };
    }
  }
  const base = stockSelection ?? input.seededSelection();
  if (base === null) return stockSelection;
  const picked = selectionWithMostQuota(base, context);
  return picked.instanceId === base.instanceId ? stockSelection : picked;
}

/**
 * Called by the two stock flows that give a draft its first model (hunk set `r3-account-quota`).
 * It reads the accounts, the settings and the default model of the project itself, as the stock
 * `createNewThreadHandler` does, so a hunk names no stock local but the draft and the project.
 */
export function pickNewThreadAccount(
  stockSelection: ModelSelection | null,
  draftId: DraftId,
  projectRef: ScopedProjectRef,
): ModelSelection | null {
  if (!useReadoutSettingsStore.getState().newThreadsUseMostQuota) return stockSelection;
  const config = appAtomRegistry.get(environmentServerConfigsAtom).get(projectRef.environmentId);
  const providers = config?.providers ?? [];
  // Nothing more is read where no pick is possible.
  if (!hasAccountChoice(providers)) return stockSelection;
  const settings = config?.settings;
  const project = readProject(projectRef);
  const { projectId } = projectRef;
  return resolveNewThreadAccount({
    stockSelection,
    defaultSelection: settings
      ? (resolveProjectSettings(settings, projectId, project ?? undefined).settings
          .defaultModelSelection ?? null)
      : (project?.defaultModelSelection ?? null),
    // Both flows apply the sticky state to the draft before they ask for the model.
    seededSelection: () => {
      const draft = useComposerDraftStore.getState().getComposerDraft(draftId);
      const sticky = draft?.activeProvider
        ? (draft.modelSelectionByProvider[draft.activeProvider] ?? null)
        : null;
      return (
        sticky ??
        (settings
          ? resolveProjectDefaultProviderModelSelection(providers, settings, projectId)
          : null)
      );
    },
    context: { providers, settings, projectId, now: Date.now() },
  });
}

import { resolveProviderInstanceDisplayName } from "@t3tools/client-runtime/state/provider-instance-display";
import { isAtomCommandInterrupted, runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { BrowserProfile, ScopedThreadRef } from "@t3tools/contracts";

import { canOpenLinksInApp } from "../browser/browserLinkTarget";
import { openUrlInPreview } from "../browser/openFileInPreview";
import { recordVisitForThread } from "../browserHistoryStore";
import { showPreviewPopup } from "../components/preview/showPreviewPopup";
import {
  ensureClientSettingsHydrated,
  getClientSettings,
  persistClientSettingsUpdate,
} from "../hooks/useSettings";
import { readLocalApi } from "../localApi";
import {
  isPreviewSupportedInRuntime,
  readThreadPreviewState,
  setActivePreviewTab,
  whenPreviewTabKnown,
} from "../previewStateStore";
import { rightPanelHostRef, useRightPanelStore } from "../rightPanelStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readThreadShell } from "../state/entities";
import { previewEnvironment } from "../state/preview";
import { environmentServerConfigsAtom } from "../state/server";
import { QUOTA_DRIVER } from "./accountQuota";
import {
  findArtifactTab,
  resolveArtifactLinkTarget,
  withArtifactProfile,
  type ArtifactAccount,
  type ArtifactLinkTarget,
} from "./artifactLinks";
import { requestLargeFloatingPreview } from "./floatingPreviewSize";
import { browserPanesAvailable } from "./paneBrowserActions";
import { findBrowserLeaf } from "./paneBrowserLayout";
import { paneRefusesPanel } from "./panePanelViews";
import { usePaneStore } from "./paneStore";
import { getActiveTab } from "./paneTree";
import { useReadoutSettingsStore } from "./readoutSettings";

/**
 * What the click path reads from the app. A browser has no desktop bridge, so the feature does
 * nothing there. A test replaces `browserAvailable`, because the stock app takes a
 * `window.desktopBridge` for the whole desktop bridge.
 */
export const artifactLinkHost = {
  browserAvailable: (threadRef: ScopedThreadRef): boolean =>
    isPreviewSupportedInRuntime() && canOpenLinksInApp(threadRef),
};

/** The Claude account that the thread runs on now. Null for a thread of another provider. */
function artifactAccountOf(threadRef: ScopedThreadRef): ArtifactAccount | null {
  const instanceId = readThreadShell(threadRef)?.providerInstanceId;
  if (instanceId === undefined) return null;
  const provider = appAtomRegistry
    .get(environmentServerConfigsAtom)
    .get(threadRef.environmentId)
    ?.providers.find((candidate) => candidate.instanceId === instanceId);
  return provider?.driver === QUOTA_DRIVER
    ? { instanceId, displayName: resolveProviderInstanceDisplayName(provider) }
    : null;
}

/** True when a pane of the current tab shows the browser of the thread. */
function showsInBrowserPane(hostRef: ScopedThreadRef): boolean {
  if (!browserPanesAvailable()) return false;
  return findBrowserLeaf(getActiveTab(usePaneStore.getState().layout), hostRef) !== null;
}

function artifactLinkTargetOf(
  threadRef: ScopedThreadRef | undefined,
  url: string,
  event: Parameters<typeof resolveArtifactLinkTarget>[0]["event"],
): ArtifactLinkTarget | null {
  if (threadRef === undefined) return null;
  const enabled = useReadoutSettingsStore.getState().artifactLinksInApp;
  // Nothing more is read for a link that stock opens.
  if (!enabled || !artifactLinkHost.browserAvailable(threadRef)) return null;
  return resolveArtifactLinkTarget({
    url,
    enabled,
    event,
    browserAvailable: true,
    account: artifactAccountOf(threadRef),
    narrow: paneRefusesPanel(rightPanelHostRef(threadRef)),
    browserPane: showsInBrowserPane(rightPanelHostRef(threadRef)),
  });
}

/** Lists the profile in the stock browser settings, so the tab can show the account name. */
async function rememberArtifactProfile(profile: BrowserProfile): Promise<void> {
  await ensureClientSettingsHydrated();
  const listed = getClientSettings().browserProfiles;
  if (withArtifactProfile(listed, profile) === listed) return;
  await persistClientSettingsUpdate((current) => ({
    ...current,
    browserProfiles: [...withArtifactProfile(current.browserProfiles, profile)],
  }));
}

function showArtifactTab(
  hostRef: ScopedThreadRef,
  tabId: string,
  surface: ArtifactLinkTarget["surface"],
): void {
  // The browser pane of the thread shows the thread's active tab.
  if (surface === "pane") {
    whenPreviewTabKnown(hostRef, tabId, () => setActivePreviewTab(hostRef, tabId));
    return;
  }
  if (surface === "floating") {
    // Setting `largeFloatingPreview`: this floating preview starts large.
    requestLargeFloatingPreview(hostRef, tabId);
    showPreviewPopup(hostRef, tabId, "floating");
    return;
  }
  setActivePreviewTab(hostRef, tabId);
  useRightPanelStore.getState().openBrowser(hostRef, tabId);
}

async function openArtifactLink(
  threadRef: ScopedThreadRef,
  url: string,
  target: ArtifactLinkTarget,
): Promise<void> {
  // Read before any await: a side chat pane that unmounts meanwhile drops its host mapping.
  const hostRef = rightPanelHostRef(threadRef);
  const { profile, surface } = target;
  const openTabId = findArtifactTab(readThreadPreviewState(hostRef).sessions, profile.id, url);
  if (openTabId !== null) {
    showArtifactTab(hostRef, openTabId, surface);
    return;
  }
  // The name is for the tab only. The cookie store depends on the id, so a failed write is no stop.
  await rememberArtifactProfile(profile).catch((cause: unknown) => console.error(cause));
  const opened: { tabId: string | null } = { tabId: null };
  const result = await openUrlInPreview({
    threadRef,
    url,
    profileId: profile.id,
    // A pane with no right panel gets no panel request: its tab shows in the floating preview.
    // A browser pane shows the tab itself.
    background: surface !== "panel",
    openPreview: async (input) => {
      const snapshot = await runAtomCommand(appAtomRegistry, previewEnvironment.open, input, {
        reportFailure: false,
      });
      if (snapshot._tag === "Success") opened.tabId = snapshot.value.tabId;
      return snapshot;
    },
  });
  if (result._tag === "Success") {
    recordVisitForThread(threadRef, url);
    if (surface !== "panel" && opened.tabId !== null) {
      showArtifactTab(hostRef, opened.tabId, surface);
    }
    return;
  }
  if (isAtomCommandInterrupted(result)) return;
  console.error(result.cause);
  // As stock does for a link that its browser cannot open.
  await readLocalApi()?.shell.openExternal(url);
}

/**
 * Called by the click handler of a chat link, before the stock rule (hunk set
 * `r7-artifact-links`). True: the link is a Claude artifact link that the app now opens in its
 * own browser, in the cookie store of the thread's Claude account, and the click is used.
 */
export function openArtifactLinkInApp(
  event: {
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
    readonly altKey: boolean;
    readonly button?: number | undefined;
    readonly preventDefault: () => void;
    readonly stopPropagation: () => void;
  },
  url: string,
  threadRef: ScopedThreadRef | undefined,
): boolean {
  const target = artifactLinkTargetOf(threadRef, url, event);
  if (threadRef === undefined || target === null) return false;
  event.preventDefault();
  event.stopPropagation();
  void openArtifactLink(threadRef, url, target).catch((cause: unknown) => console.error(cause));
  return true;
}

const NO_MODIFIER = { metaKey: false, ctrlKey: false, altKey: false } as const;

/**
 * The profile for a chat link that the stock menu item "Open in browser" opens. Empty for a link
 * that is no artifact link of a Claude thread: the stock default profile then stays.
 */
export function artifactLinkProfile(
  threadRef: ScopedThreadRef | undefined,
  url: string,
): { readonly profileId?: string } {
  const target = artifactLinkTargetOf(threadRef, url, NO_MODIFIER);
  if (target === null) return {};
  void rememberArtifactProfile(target.profile).catch((cause: unknown) => console.error(cause));
  return { profileId: target.profile.id };
}

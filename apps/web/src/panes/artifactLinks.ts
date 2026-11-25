import {
  BROWSER_PROFILE_MAX_COUNT,
  BROWSER_PROFILE_NAME_MAX_LENGTH,
  type BrowserProfile,
  type PreviewSessionSnapshot,
} from "@t3tools/contracts";

const ARTIFACT_HOST = "claude.ai";
const ARTIFACT_PATH = /\/artifact\/[^/]/;

/** `https://claude.ai/artifact/<id>` and `https://claude.ai/code/artifact/<uuid>`. */
export function isClaudeArtifactUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === ARTIFACT_HOST &&
    ARTIFACT_PATH.test(parsed.pathname)
  );
}

/** A Claude provider instance of the thread's environment: one Claude account. */
export interface ArtifactAccount {
  readonly instanceId: string;
  readonly displayName: string;
}

const PROFILE_ID_PREFIX = "claude-account-";
const PROFILE_ID_MAX_LENGTH = 64;
const PROFILE_NAME_SUFFIX = " account";

/**
 * The stock browser profile that holds the claude.ai cookies of one account. The desktop app
 * derives one persistent cookie store from the environment and this id, so the id must not
 * change. An instance id over 49 characters is cut, which no real id reaches.
 */
export function artifactProfileOf(account: ArtifactAccount): BrowserProfile {
  const name = account.displayName
    .trim()
    .slice(0, BROWSER_PROFILE_NAME_MAX_LENGTH - PROFILE_NAME_SUFFIX.length)
    .trim();
  return {
    id: `${PROFILE_ID_PREFIX}${account.instanceId}`.slice(0, PROFILE_ID_MAX_LENGTH),
    name: `${name || account.instanceId}${PROFILE_NAME_SUFFIX}`.slice(
      0,
      BROWSER_PROFILE_NAME_MAX_LENGTH,
    ),
    kind: "persistent",
  };
}

/**
 * The stock profile list with the profile of an account, so the tab shows the account name. A
 * profile that the list already has stays as it is: the user can rename it in Settings > Browser.
 * A full list stays too, and the tab then shows the stock text "Removed profile".
 */
export function withArtifactProfile(
  profiles: ReadonlyArray<BrowserProfile>,
  profile: BrowserProfile,
): ReadonlyArray<BrowserProfile> {
  if (profiles.some((candidate) => candidate.id === profile.id)) return profiles;
  if (profiles.length >= BROWSER_PROFILE_MAX_COUNT) return profiles;
  return [...profiles, profile];
}

export interface ArtifactLinkTarget {
  readonly profile: BrowserProfile;
  /**
   * `floating` is the stock floating preview, for a pane with no right panel. `pane` is the
   * browser pane that the current tab already has for the thread.
   */
  readonly surface: "panel" | "floating" | "pane";
}

/** Where a click on a chat link goes. Null: the stock rule decides. */
export function resolveArtifactLinkTarget(input: {
  readonly url: string;
  /** The setting "Open artifact links in the app". */
  readonly enabled: boolean;
  readonly event: {
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
    readonly altKey: boolean;
    readonly button?: number | undefined;
  };
  /** This is the desktop app, and it may use its browser for the thread. */
  readonly browserAvailable: boolean;
  /** The Claude account of the thread. Null: the thread has another provider. */
  readonly account: ArtifactAccount | null;
  /** Every pane that shows the thread is too narrow for the right panel. */
  readonly narrow: boolean;
  /** A pane of the current tab shows the browser of the thread. */
  readonly browserPane?: boolean;
}): ArtifactLinkTarget | null {
  if (!input.enabled || !input.browserAvailable || input.account === null) return null;
  // Stock sends a click with a modifier key and a middle click to the system browser.
  const { event } = input;
  if (event.metaKey || event.ctrlKey || event.altKey || event.button === 1) return null;
  if (!isClaudeArtifactUrl(input.url)) return null;
  return {
    profile: artifactProfileOf(input.account),
    surface: input.browserPane ? "pane" : input.narrow ? "floating" : "panel",
  };
}

/** The open tab of the thread that already shows this link in this account, else null. */
export function findArtifactTab(
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
  profileId: string,
  url: string,
): string | null {
  for (const session of Object.values(sessions)) {
    if (session.profileId !== profileId) continue;
    if (session.navStatus._tag !== "Idle" && session.navStatus.url === url) return session.tabId;
  }
  return null;
}

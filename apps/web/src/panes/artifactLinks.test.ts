import { BROWSER_PROFILE_MAX_COUNT, type PreviewSessionSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  artifactProfileOf,
  findArtifactTab,
  isClaudeArtifactUrl,
  resolveArtifactLinkTarget,
  withArtifactProfile,
} from "./artifactLinks";

const ARTIFACT = "https://claude.ai/artifact/9f3c1a";
const CODE_ARTIFACT = "https://claude.ai/code/artifact/0b8f6c1e-52c8-4a8e-9d2e-3f1f0a6f7a11";
const SECOND_ACCOUNT = { instanceId: "dale-claude2", displayName: "Claude 2" };
const PLAIN_CLICK = { metaKey: false, ctrlKey: false, altKey: false, button: 0 };

describe("isClaudeArtifactUrl", () => {
  it.each([
    [ARTIFACT, true],
    [CODE_ARTIFACT, true],
    [`${CODE_ARTIFACT}?tab=preview#top`, true],
    ["https://claude.ai/code/artifacts", false],
    ["https://claude.ai/artifact/", false],
    ["https://claude.ai/chat/9f3c1a", false],
    ["https://claude.ai.example.com/artifact/9f3c1a", false],
    ["https://example.com/?next=https://claude.ai/artifact/9f3c1a", false],
    ["https://docs.claude.ai/artifact/9f3c1a", false],
    ["http://claude.ai/artifact/9f3c1a", false],
    ["claude.ai/artifact/9f3c1a", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(isClaudeArtifactUrl(url)).toBe(expected);
  });
});

describe("artifactProfileOf", () => {
  it("gives each account its own profile id, and a name that starts with the account name", () => {
    expect(artifactProfileOf(SECOND_ACCOUNT)).toEqual({
      id: "claude-account-dale-claude2",
      name: "Claude 2 account",
      kind: "persistent",
    });
    expect(artifactProfileOf({ instanceId: "claudeAgent", displayName: "Claude" }).id).toBe(
      "claude-account-claudeAgent",
    );
  });

  it("keeps the id and the name inside the limits of a stock browser profile", () => {
    const profile = artifactProfileOf({
      instanceId: "a".repeat(64),
      displayName: `  ${"N".repeat(80)}`,
    });
    expect(profile.id).toHaveLength(64);
    expect(profile.name).toHaveLength(48);
    expect(profile.name.endsWith(" account")).toBe(true);
    expect(artifactProfileOf({ instanceId: "claudeAgent", displayName: "  " }).name).toBe(
      "claudeAgent account",
    );
  });
});

describe("withArtifactProfile", () => {
  const profile = artifactProfileOf(SECOND_ACCOUNT);

  it("adds the profile of an account one time, and keeps a name that the user changed", () => {
    const added = withArtifactProfile([], profile);
    expect(added).toEqual([profile]);
    const renamed = [{ ...profile, name: "Work" }];
    expect(withArtifactProfile(renamed, profile)).toBe(renamed);
  });

  it("leaves a full profile list as it is", () => {
    const full = Array.from({ length: BROWSER_PROFILE_MAX_COUNT }, (_, index) => ({
      id: `profile-${index}`,
      name: `Profile ${index}`,
      kind: "persistent" as const,
    }));
    expect(withArtifactProfile(full, profile)).toBe(full);
  });
});

describe("resolveArtifactLinkTarget", () => {
  const input = {
    url: CODE_ARTIFACT,
    enabled: true,
    event: PLAIN_CLICK,
    browserAvailable: true,
    account: SECOND_ACCOUNT,
    narrow: false,
  };

  it("opens an artifact link in the right panel, in the profile of the thread's account", () => {
    expect(resolveArtifactLinkTarget(input)).toEqual({
      profile: artifactProfileOf(SECOND_ACCOUNT),
      surface: "panel",
    });
    expect(
      resolveArtifactLinkTarget({
        ...input,
        url: ARTIFACT,
        account: { instanceId: "dale-claude3", displayName: "Claude 3" },
      })?.profile.id,
    ).toBe("claude-account-dale-claude3");
  });

  it("uses the floating preview where every pane of the thread has no right panel", () => {
    expect(resolveArtifactLinkTarget({ ...input, narrow: true })?.surface).toBe("floating");
  });

  it("uses the browser pane of the thread where the current tab has one", () => {
    expect(resolveArtifactLinkTarget({ ...input, browserPane: true })?.surface).toBe("pane");
    expect(resolveArtifactLinkTarget({ ...input, narrow: true, browserPane: true })?.surface).toBe(
      "pane",
    );
  });

  it.each([
    ["the setting is off", { enabled: false }],
    ["the client is a browser, or may not use the app's browser", { browserAvailable: false }],
    ["the thread has no Claude account", { account: null }],
    ["the link is no artifact link", { url: "https://claude.ai/chat/9f3c1a" }],
    ["Cmd is held", { event: { ...PLAIN_CLICK, metaKey: true } }],
    ["Ctrl is held", { event: { ...PLAIN_CLICK, ctrlKey: true } }],
    ["Alt is held", { event: { ...PLAIN_CLICK, altKey: true } }],
    ["the click is a middle click", { event: { ...PLAIN_CLICK, button: 1 } }],
  ])("leaves the link to the stock rule when %s", (_name, change) => {
    expect(resolveArtifactLinkTarget({ ...input, ...change })).toBeNull();
  });
});

describe("findArtifactTab", () => {
  const session = (
    tabId: string,
    profileId: string | undefined,
    navStatus: PreviewSessionSnapshot["navStatus"],
  ): PreviewSessionSnapshot => ({
    threadId: "thread",
    tabId,
    navStatus,
    canGoBack: false,
    canGoForward: false,
    ...(profileId === undefined ? {} : { profileId }),
    updatedAt: "2026-11-19T10:00:00.000Z",
  });
  const profileId = artifactProfileOf(SECOND_ACCOUNT).id;

  it("finds the tab that shows the link in the same account, and no other tab", () => {
    const sessions = {
      default: session("default", undefined, { _tag: "Success", url: ARTIFACT, title: "" }),
      other: session("other", "claude-account-dale-claude3", {
        _tag: "Success",
        url: ARTIFACT,
        title: "",
      }),
      moved: session("moved", profileId, {
        _tag: "Success",
        url: "https://claude.ai/login",
        title: "",
      }),
      idle: session("idle", profileId, { _tag: "Idle" }),
      loading: session("loading", profileId, { _tag: "Loading", url: ARTIFACT, title: "" }),
    };
    expect(findArtifactTab(sessions, profileId, ARTIFACT)).toBe("loading");
    expect(findArtifactTab(sessions, profileId, CODE_ARTIFACT)).toBeNull();
    expect(findArtifactTab({}, profileId, ARTIFACT)).toBeNull();
  });
});

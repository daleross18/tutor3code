import { describe, expect, it } from "vite-plus/test";

import { searchSettings } from "../components/settings/settingsSearch";
import { createMemoryStorage } from "../lib/storage";
import {
  createReadoutSettingsStore,
  DEFAULT_READOUT_SETTINGS,
  READOUT_SETTING_KEYS,
  READOUT_SETTINGS_STORAGE_KEY,
  sanitizeReadoutSettings,
  useReadoutSettingsStore,
} from "./readoutSettings";

describe("readoutSettings", () => {
  it("gives each readout setting its default, under the fork's own storage key", () => {
    expect(DEFAULT_READOUT_SETTINGS).toEqual({
      showEnvironmentResources: true,
      showAccountQuota: true,
      newThreadsUseMostQuota: true,
      showCiStatus: true,
      releaseWatchedPullRequests: true,
      foldPullRequestUpdates: true,
      showWorkTokens: true,
      showPullRequestChip: true,
      draftEnvironmentChoice: true,
      mirrorPanes: true,
      showMusicControl: true,
      hideWorktreeFolder: true,
      paletteFilter: true,
      showWorkedTime: true,
      artifactLinksInApp: true,
      showThreadArtifacts: true,
      styleClaudeKeywords: true,
      largeFloatingPreview: true,
      browserPanes: true,
      dragPanes: true,
      showContextBreakdown: true,
      menuBarUnread: true,
      finishSound: false,
      selectionToInput: true,
      keepPromptHistory: true,
      fadeUnfocusedPanes: true,
    });
    expect(Object.keys(DEFAULT_READOUT_SETTINGS)).toEqual([...READOUT_SETTING_KEYS]);
    expect(useReadoutSettingsStore.getState()).toMatchObject(DEFAULT_READOUT_SETTINGS);
    expect(useReadoutSettingsStore.persist.getOptions()).toMatchObject({
      name: "t3code-fork:readouts:v1",
      version: 1,
    });
  });

  it("restores each value in a new store on the same storage", () => {
    const storage = createMemoryStorage();
    const written = createReadoutSettingsStore(storage);
    written.getState().setReadoutSetting("showEnvironmentResources", false);
    written.getState().setReadoutSetting("newThreadsUseMostQuota", false);
    expect(JSON.parse(storage.getItem(READOUT_SETTINGS_STORAGE_KEY) as string).state).toEqual({
      showEnvironmentResources: false,
      showAccountQuota: true,
      newThreadsUseMostQuota: false,
      showCiStatus: true,
      releaseWatchedPullRequests: true,
      foldPullRequestUpdates: true,
      showWorkTokens: true,
      showPullRequestChip: true,
      draftEnvironmentChoice: true,
      mirrorPanes: true,
      showMusicControl: true,
      hideWorktreeFolder: true,
      paletteFilter: true,
      showWorkedTime: true,
      artifactLinksInApp: true,
      showThreadArtifacts: true,
      styleClaudeKeywords: true,
      largeFloatingPreview: true,
      browserPanes: true,
      dragPanes: true,
      showContextBreakdown: true,
      menuBarUnread: true,
      finishSound: false,
      selectionToInput: true,
      keepPromptHistory: true,
      fadeUnfocusedPanes: true,
    });
    expect(createReadoutSettingsStore(storage).getState()).toMatchObject({
      showEnvironmentResources: false,
      showAccountQuota: true,
      newThreadsUseMostQuota: false,
    });
  });

  it.each([
    ["nothing stored", null, DEFAULT_READOUT_SETTINGS],
    ["a value that is not an object", "off", DEFAULT_READOUT_SETTINGS],
    [
      "a value that is not a boolean, and a missing setting",
      { showEnvironmentResources: "no", showAccountQuota: false },
      {
        showEnvironmentResources: true,
        showAccountQuota: false,
        newThreadsUseMostQuota: true,
        showCiStatus: true,
        releaseWatchedPullRequests: true,
        foldPullRequestUpdates: true,
        showWorkTokens: true,
        showPullRequestChip: true,
        draftEnvironmentChoice: true,
        mirrorPanes: true,
        showMusicControl: true,
        hideWorktreeFolder: true,
        paletteFilter: true,
        showWorkedTime: true,
        artifactLinksInApp: true,
        showThreadArtifacts: true,
        styleClaudeKeywords: true,
        largeFloatingPreview: true,
        browserPanes: true,
        dragPanes: true,
        showContextBreakdown: true,
        menuBarUnread: true,
        finishSound: false,
        selectionToInput: true,
        keepPromptHistory: true,
        fadeUnfocusedPanes: true,
      },
    ],
  ])("falls back to the default of each setting for %s", (_name, stored, expected) => {
    expect(sanitizeReadoutSettings(stored)).toEqual(expected);
  });

  it("is found by the settings search, on the Appearance page", () => {
    for (const [query, id] of [
      ["environment resources", "environment-resources"],
      ["account quota", "account-quota"],
      ["most quota left", "new-threads-most-quota"],
      ["watched pull requests", "pr-watch-hold"],
      ["fold pull request updates", "pr-update-fold"],
      ["token use", "work-tokens"],
      ["pull request in the bottom bar", "pr-chip"],
      ["choose the environment", "draft-environment"],
      ["current pane when another pane shows", "mirror-panes"],
      ["music control", "music-control"],
      ["working time of a finished turn", "worked-time"],
      ["artifact links", "artifact-links"],
      ["thread artifacts", "thread-artifacts"],
      ["style claude keywords", "claude-keywords"],
      ["context breakdown", "context-breakdown"],
      ["menu bar", "menu-bar-unread"],
      ["sound when a thread finishes", "finish-sound"],
      ["fade panes without focus", "fade-unfocused-panes"],
    ] as const) {
      expect(searchSettings(query)[0]).toMatchObject({ id, to: "/settings/appearance" });
    }
  });
});

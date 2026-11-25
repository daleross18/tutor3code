import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "../lib/storage";
import { followOtherWindows } from "./forkStorageSync";

export interface ReadoutSettings {
  /** The sidebar footer shows free disk space and memory of each connected environment. */
  readonly showEnvironmentResources: boolean;
  /** The model picker shows the quota of each Claude account. */
  readonly showAccountQuota: boolean;
  /** A new thread starts on the Claude account with the most quota left. */
  readonly newThreadsUseMostQuota: boolean;
  /** A sidebar row shows the CI lanes and the auto-merge state of its open pull request. */
  readonly showCiStatus: boolean;
  /** A pull request watch does not hold its thread while the checks run. */
  readonly releaseWatchedPullRequests: boolean;
  /** The chat shows the quiet update turns of a pull request watch as one line. */
  readonly foldPullRequestUpdates: boolean;
  /** The timeline shows the tokens of the running turn and of each subagent that works. */
  readonly showWorkTokens: boolean;
  /** The strip under the composer shows the pull request of the thread with its CI state. */
  readonly showPullRequestChip: boolean;
  /** The new thread screen has an environment control, and the project follows the choice. */
  readonly draftEnvironmentChoice: boolean;
  /** A thread that another pane of the tab shows opens in the focused pane too. */
  readonly mirrorPanes: boolean;
  /** The bottom bar of a pane has a music button for the Spotify app. Mac app only. */
  readonly showMusicControl: boolean;
  /** The bottom bar shows no folder item for a worktree that the server named. */
  readonly hideWorktreeFolder: boolean;
  /** The command palette has a filter by environment and project, on the find key. */
  readonly paletteFilter: boolean;
  /** The footer of the last agent message of a finished turn shows the working time. */
  readonly showWorkedTime: boolean;
  /** A Claude artifact link in a chat opens in the app's browser, signed in to its account. */
  readonly artifactLinksInApp: boolean;
  /** The thread details list the claude.ai artifacts that the thread published or edited. */
  readonly showThreadArtifacts: boolean;
  /** The composer of a Claude provider styles the words "ultracode" and "ultrathink". */
  readonly styleClaudeKeywords: boolean;
  /** The floating preview of an artifact link starts large and shows a grip to change its size. */
  readonly largeFloatingPreview: boolean;
  /** A pane can show the browser of a thread: by a drag or a button of the floating preview. */
  readonly browserPanes: boolean;
  /** The header of a pane moves it: to a side of a pane, to a tab, or to a new tab. */
  readonly dragPanes: boolean;
  /** The stock "Context" row of the thread details opens a breakdown of the context. */
  readonly showContextBreakdown: boolean;
  /** The Mac menu bar shows an item with the count of unread finished threads. Mac app only. */
  readonly menuBarUnread: boolean;
  /** One short sound plays when a thread finishes. */
  readonly finishSound: boolean;
  /** Text that you select in a chat shows in its empty input. Tab or the context menu uses it. */
  readonly selectionToInput: boolean;
  /** The Up key recalls sent messages that a reconnect removed from the loaded timeline. */
  readonly keepPromptHistory: boolean;
  /** In a tab of two or more panes, each pane without focus shows behind a light veil. */
  readonly fadeUnfocusedPanes: boolean;
}

export const READOUT_SETTING_KEYS = [
  "showEnvironmentResources",
  "showAccountQuota",
  "newThreadsUseMostQuota",
  "showCiStatus",
  "releaseWatchedPullRequests",
  "foldPullRequestUpdates",
  "showWorkTokens",
  "showPullRequestChip",
  "draftEnvironmentChoice",
  "mirrorPanes",
  "showMusicControl",
  "hideWorktreeFolder",
  "paletteFilter",
  "showWorkedTime",
  "artifactLinksInApp",
  "showThreadArtifacts",
  "styleClaudeKeywords",
  "largeFloatingPreview",
  "browserPanes",
  "dragPanes",
  "showContextBreakdown",
  "menuBarUnread",
  "finishSound",
  "selectionToInput",
  "keepPromptHistory",
  "fadeUnfocusedPanes",
] as const satisfies ReadonlyArray<keyof ReadoutSettings>;

export const DEFAULT_READOUT_SETTINGS: ReadoutSettings = {
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
};

// A stock server knows none of these keys, so they stay in the fork's own browser storage.
export const READOUT_SETTINGS_STORAGE_KEY = "t3code-fork:readouts:v1";
const READOUT_SETTINGS_STORAGE_VERSION = 1;

/** A stored value that is not a boolean falls back to the default of its own setting. */
export function sanitizeReadoutSettings(stored: unknown): ReadoutSettings {
  const read = (key: keyof ReadoutSettings) => {
    const value = typeof stored === "object" && stored !== null ? Reflect.get(stored, key) : null;
    return typeof value === "boolean" ? value : DEFAULT_READOUT_SETTINGS[key];
  };
  return {
    showEnvironmentResources: read("showEnvironmentResources"),
    showAccountQuota: read("showAccountQuota"),
    newThreadsUseMostQuota: read("newThreadsUseMostQuota"),
    showCiStatus: read("showCiStatus"),
    releaseWatchedPullRequests: read("releaseWatchedPullRequests"),
    foldPullRequestUpdates: read("foldPullRequestUpdates"),
    showWorkTokens: read("showWorkTokens"),
    showPullRequestChip: read("showPullRequestChip"),
    draftEnvironmentChoice: read("draftEnvironmentChoice"),
    mirrorPanes: read("mirrorPanes"),
    showMusicControl: read("showMusicControl"),
    hideWorktreeFolder: read("hideWorktreeFolder"),
    paletteFilter: read("paletteFilter"),
    showWorkedTime: read("showWorkedTime"),
    artifactLinksInApp: read("artifactLinksInApp"),
    showThreadArtifacts: read("showThreadArtifacts"),
    styleClaudeKeywords: read("styleClaudeKeywords"),
    largeFloatingPreview: read("largeFloatingPreview"),
    browserPanes: read("browserPanes"),
    dragPanes: read("dragPanes"),
    showContextBreakdown: read("showContextBreakdown"),
    menuBarUnread: read("menuBarUnread"),
    finishSound: read("finishSound"),
    selectionToInput: read("selectionToInput"),
    keepPromptHistory: read("keepPromptHistory"),
    fadeUnfocusedPanes: read("fadeUnfocusedPanes"),
  };
}

export interface ReadoutSettingsStoreState extends ReadoutSettings {
  setReadoutSetting: (key: keyof ReadoutSettings, enabled: boolean) => void;
}

/** The storage is a parameter so a test can open a second store on the same stored value. */
export function createReadoutSettingsStore(storage: StateStorage) {
  return create<ReadoutSettingsStoreState>()(
    persist(
      (set) => ({
        ...DEFAULT_READOUT_SETTINGS,
        setReadoutSetting: (key, enabled) => {
          set((state) => (state[key] === enabled ? state : { [key]: enabled }));
        },
      }),
      {
        name: READOUT_SETTINGS_STORAGE_KEY,
        version: READOUT_SETTINGS_STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: (state) => sanitizeReadoutSettings(state),
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...sanitizeReadoutSettings(persistedState),
        }),
      },
    ),
  );
}

export const useReadoutSettingsStore = createReadoutSettingsStore(
  resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
);
followOtherWindows(useReadoutSettingsStore);

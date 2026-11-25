import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import { useSearchableSetting } from "../components/settings/settingsSearch";
import { Switch } from "../components/ui/switch";
import {
  DEFAULT_READOUT_SETTINGS,
  useReadoutSettingsStore,
  type ReadoutSettings,
} from "./readoutSettings";
import type { READOUT_SETTINGS_SEARCH_ITEMS } from "./readoutSettingsSearch";

function ReadoutSwitchRow({
  settingKey,
  searchId,
  description,
}: {
  settingKey: keyof ReadoutSettings;
  searchId: (typeof READOUT_SETTINGS_SEARCH_ITEMS)[number]["id"];
  description: string;
}) {
  const enabled = useReadoutSettingsStore((settings) => settings[settingKey]);
  const setReadoutSetting = useReadoutSettingsStore((settings) => settings.setReadoutSetting);
  const defaultEnabled = DEFAULT_READOUT_SETTINGS[settingKey];
  const search = useSearchableSetting()(searchId);
  return (
    <SettingsRow
      {...search}
      description={description}
      resetAction={
        enabled !== defaultEnabled ? (
          <SettingResetButton
            ariaLabel={`Reset ${search.title.toLowerCase()} to default`}
            onClick={() => setReadoutSetting(settingKey, defaultEnabled)}
          />
        ) : null
      }
      control={
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => setReadoutSetting(settingKey, Boolean(checked))}
          aria-label={search.title}
        />
      }
    />
  );
}

/** The environment and account rows of the fork section in Settings > Appearance. */
export function ReadoutSettingsRows() {
  return (
    <>
      <ReadoutSwitchRow
        settingKey="showEnvironmentResources"
        searchId="environment-resources"
        description="Show the free memory of each connected environment at the bottom of the sidebar. The desktop app adds the free disk space of its own machine. A remote environment shows memory only, because the stock server reports no disk space."
      />
      <ReadoutSwitchRow
        settingKey="showAccountQuota"
        searchId="account-quota"
        description="Show the 5-hour, 7-day and model weekly quota of each Claude account in the model picker."
      />
      <ReadoutSwitchRow
        settingKey="newThreadsUseMostQuota"
        searchId="new-threads-most-quota"
        description="A new thread starts on the Claude account that has the most quota left for its model. You can still change the account in the thread."
      />
      <ReadoutSwitchRow
        settingKey="showCiStatus"
        searchId="ci-status"
        description="Show the CI lanes of the open pull request in each sidebar row: the failed lanes, or the lane that runs and for how long, and a mark when auto-merge is on. The time counts from the moment this app first saw the lane run, because the server sends no start time."
      />
      <ReadoutSwitchRow
        settingKey="releaseWatchedPullRequests"
        searchId="pr-watch-hold"
        description="A thread that watches a pull request does not show as waiting while the checks run. The watch stays on and still wakes the thread. This changes the display of this app only. Reload the window to apply a change to threads that are already shown."
      />
      <ReadoutSwitchRow
        settingKey="foldPullRequestUpdates"
        searchId="pr-update-fold"
        description="Show the earlier update turns of a watched pull request as one line in the chat, when the agent only read and answered. The newest update stays on the screen, and a click on the line shows the others."
      />
      <ReadoutSwitchRow
        settingKey="showWorkTokens"
        searchId="work-tokens"
        description={
          'Show tokens in the chat while work runs: the context size of the thread beside "Working for", and the tokens of each subagent that still works, with a total on the group line. A number changes when the agent reports a model request, not with each word. Work for which the server sends no number shows none: a command, a monitor, and a subagent that Claude starts with its own Agent tool.'
        }
      />
      <ReadoutSwitchRow
        settingKey="showPullRequestChip"
        searchId="pr-chip"
        description="Show the pull request of a thread in the bar under the composer: its state, its number, a mark for failed or running checks, and a mark when auto-merge is on. It takes the place of the stock pull request badge of that bar. Hover for the detail, click to open the pull request."
      />
      <ReadoutSwitchRow
        settingKey="draftEnvironmentChoice"
        searchId="draft-environment"
        description="With two or more connected environments, the new thread screen has an environment control under its headline. A choice moves the unsent thread to that environment and to a project there: the same repository, else the project used last, else the first. The project picker then lists the projects of that environment only."
      />
      <ReadoutSwitchRow
        settingKey="fadeUnfocusedPanes"
        searchId="fade-unfocused-panes"
        description="In a tab with two or more panes, each pane without focus shows a little faded, so the pane with focus stands out. A click on a faded pane still acts there and gives it focus. Off: every pane looks the same."
      />
      <ReadoutSwitchRow
        settingKey="mirrorPanes"
        searchId="mirror-panes"
        description="A thread that another pane of the tab already shows opens in the pane that has focus, so two panes can show one thread. Off: the pane that shows the thread takes focus."
      />
      <ReadoutSwitchRow
        settingKey="showMusicControl"
        searchId="music-control"
        description="Show a music button in the sidebar footer, after the Usage button. Its popup controls the Spotify app on this Mac: play, pause, next, previous and volume. It shows only in the Mac app, and macOS asks one time for the permission to control Spotify."
      />
      <ReadoutSwitchRow
        settingKey="hideWorktreeFolder"
        searchId="hide-worktree-folder"
        description="A thread in a worktree that the server named shows no folder item in the bottom bar: the branch beside it carries the name. A local checkout and a folder with a name of your own still show. A change shows when the bar next updates."
      />
      <ReadoutSwitchRow
        settingKey="paletteFilter"
        searchId="palette-filter"
        description="The command palette has a filter by environment and project: a button in its search field, and the find key while the palette is open. Off: the palette and the find key are stock."
      />
      <ReadoutSwitchRow
        settingKey="showWorkedTime"
        searchId="worked-time"
        description={
          'Show how long a finished turn worked, under its last agent message, after the time: "4:49 PM · worked 32m 16s". The number is the last value of "Working for". It also shows for a turn that was stopped or that failed. A turn of less than 10 seconds shows none. The footer of such a message stays visible without the pointer.'
        }
      />
      <ReadoutSwitchRow
        settingKey="artifactLinksInApp"
        searchId="artifact-links"
        description="A click on a claude.ai artifact link in a chat opens the link in the browser of this app, in a browser profile of the Claude account of that thread. Sign in to claude.ai one time in each profile. A pane with no right panel shows the floating preview. Desktop app only. Off: the link opens as each other link does."
      />
      <ReadoutSwitchRow
        settingKey="showThreadArtifacts"
        searchId="thread-artifacts"
        description="The thread details list the claude.ai artifacts that the agent of the thread published or changed, newest first. A click opens one as a chat link does. A button copies its link. Only the loaded part of the thread counts. Off: the thread details are stock."
      />
      <ReadoutSwitchRow
        settingKey="styleClaudeKeywords"
        searchId="claude-keywords"
        description={
          'The composer shows the words "ultracode" and "ultrathink" in the action color while the provider is Claude, which reads them in a prompt. The text itself does not change. Off: the composer is stock.'
        }
      />
      <ReadoutSwitchRow
        settingKey="largeFloatingPreview"
        searchId="large-floating-preview"
        description="The floating preview that an artifact link opens starts at about 70% of the width of its pane, with a page at its real size. Each floating preview shows a grip in its bottom corner, and its edges show a line under the pointer. Drag them to change the size. A bar on its top edge moves it. Off: the floating preview is stock."
      />
      <ReadoutSwitchRow
        settingKey="browserPanes"
        searchId="browser-panes"
        description="A pane can show the browser of a thread. Drag the floating preview out of its pane and drop it on a side of a pane, on a tab or on the new-tab zone, or use its two buttons. A browser tab or a side chat tab of the right panel drags out the same way. A drop on the empty end of the tab strip opens a new tab. With 'Drag panes to move them' on, the header of a browser pane moves it the same way. The header also leads back to the floating preview. A browser pane and a browser tab drag need the desktop app. A side chat tab drags out in every client. Off: the floating preview is stock, and a browser pane shows the chat of its thread."
      />
      <ReadoutSwitchRow
        settingKey="dragPanes"
        searchId="drag-panes"
        description="Drag the free area of a pane header to move the pane: drop it on a side of another pane, on a tab, or on the new-tab zone. Drag a tab of the tab bar left or right to reorder the tabs. Escape cancels. One tab with one pane has nothing to move. Off: a pane header and a tab do not drag."
      />
      <ReadoutSwitchRow
        settingKey="showContextBreakdown"
        searchId="context-breakdown"
        description={
          'Hover or click the "Context" row of the thread details to see what fills the context: the used and the free share, the growth of each turn, and the input, cached and output tokens of the latest model request. Each number is a report of the provider. The row shows when "Context window" is on in the thread details items. Off: the row has its stock tooltip.'
        }
      />
      <ReadoutSwitchRow
        settingKey="menuBarUnread"
        searchId="menu-bar-unread"
        description="The Mac menu bar shows an item with the number of threads that finished and that you did not open yet: the rows that the sidebar marks Done. A click lists them, and a pick opens the thread. With none, the item shows no number and a click shows the app. Mac app only. Off: no menu bar item."
      />
      <ReadoutSwitchRow
        settingKey="finishSound"
        searchId="finish-sound"
        description="Play one short, soft sound when a thread finishes. No sound for the thread of the focused pane while the window has focus, and none while the stock notification sound is on. Threads that finish in the same moment share one sound."
      />
      <ReadoutSwitchRow
        settingKey="selectionToInput"
        searchId="selection-to-input"
        description="Text that you select in a chat shows in the empty input of its pane. Tab puts it in the input. A right click on the selection gives Fill input and Append to input. Off: the stock input and the stock context menu."
      />
      <ReadoutSwitchRow
        settingKey="keepPromptHistory"
        searchId="keep-prompt-history"
        description="The Up key in an empty input recalls your sent messages of the thread. After a reconnect (sleep, a dropped connection) the app loads only the latest part of a thread, so stock loses older messages from this list. This keeps the ones that the window saw, and a recalled message that stays in the input continues the recall. Off: stock."
      />
    </>
  );
}

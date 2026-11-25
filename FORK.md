# Tutor3 (fork notes)

This fork is the stock T3 Code app plus top-level tabs. Each tab holds a grid of split panes. Each pane is one full, live chat thread. One tab with one pane renders the stock DOM, with no tab bar. The fork also adds the settings of the section "Fork settings". With each of them off, the app looks and works as stock.

- Branch: `main` of the fork, based on the upstream stable tag `v0.1.11`. The base was `v0.1.10` before the rebase of 2026-11-23. Until that day the branch was `panes`, and older notes below use that name. The upstream main is not kept on the fork: use `origin/main`.
- Remotes: `origin` is upstream `pingdotgg/t3code`. Never push there. `fork` is `github.com/daleross18/tutor3code`.
- Never push a tag. A pushed tag starts the upstream release workflow.
- Keep GitHub Actions off on the fork.

## Identity

| Value                  | Stock                | Fork                                                                                                                                             | Site                                                        |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Product name           | `T3 Code (Beta)`     | `Tutor3`                                                                                                                                         | `apps/desktop/package.json` (`productName`)                 |
| Bundle id              | `com.t3tools.t3code` | `com.daleross.tutor3`                                                                                                                            | `scripts/build-desktop-artifact.ts` (`DESKTOP_APP_ID`)      |
| Mac icon               | production icon      | Tutor icon: the T3 mark in ink `#202020` on Tutor yellow `#ffd24c` (`assets/tutor/tutor-macos-1024.png`, drawn from `assets/tutor/app-icon.svg`) | `scripts/build-desktop-artifact.ts` (`macIconPng`)          |
| URL scheme             | `t3code`             | `tutor3`                                                                                                                                         | `scripts/build-desktop-artifact.ts` (`schemes`)             |
| Staged package name    | `t3code`             | `tutor3`                                                                                                                                         | `scripts/build-desktop-artifact.ts` (staged `name`)         |
| Electron userData name | `t3code-v2`          | `tutor3`                                                                                                                                         | `apps/desktop/src/app/DesktopUserData.ts`                   |
| T3 home                | `~/.t3`              | `~/.tutor3`                                                                                                                                      | `apps/desktop/src/app/DesktopStatePaths.ts`                 |
| Layout storage key     | none                 | `t3code-fork:panes:v1`                                                                                                                           | `apps/web/src/panes/paneStore.ts` (localStorage)            |
| Density storage key    | none                 | `t3code-fork:density:v1`                                                                                                                         | `apps/web/src/panes/paneDensity.ts` (localStorage)          |
| Thread storage key     | none                 | `t3code-fork:thread:v1`                                                                                                                          | `apps/web/src/panes/paneThreadStore.ts` (localStorage)      |
| Armed threads key      | none                 | `t3code-fork:armed-threads:v1`                                                                                                                   | `apps/web/src/panes/paneArmedThreadStore.ts` (localStorage) |
| Readout storage key    | none                 | `t3code-fork:readouts:v1`                                                                                                                        | `apps/web/src/panes/readoutSettings.ts` (localStorage)      |
| Paste storage keys     | none                 | `t3code-fork:paste-collapse:v1`, `t3code-fork:paste-chips:v1`                                                                                    | `apps/web/src/panes/pasteCollapseStore.ts` (localStorage)   |
| Arcade storage keys    | none                 | `t3code-fork:arcade:v1`, `t3code-fork:arcade-scores:v1`                                                                                          | `apps/web/src/panes/arcadeStore.ts` (localStorage)          |

The fork app has its own Electron profile, its own single-instance lock and its own T3 home. It never opens the stock app's database.

Not changed on purpose: `apps/desktop/src/electron/ElectronProtocol.ts`. A remote T3 server trusts only the `t3code://app` origin.

The Mac icon is a 1024 x 1024 PNG with an 824 x 824 body, as `assets/README.md` asks. It was rendered from `assets/tutor/app-icon.svg` in headless Chromium with a transparent page, not with Icon Composer. The glyph is the path of `assets/prod/app-icon.icon/Assets/text.svg`. The icons of the web client, of Linux and of Windows are the stock icons. The first builds of the fork used the nightly icon.

The artifact file names are still `T3-Code-<version>-arm64.dmg` and `.zip`. Only the app inside carries the fork name: `Tutor3.app`.

The product name is a display name only. The first builds of the fork were named `T3 Code Panes`. The rename to `Tutor3` changed `productName` and nothing else, so the Electron profile, the T3 home, the pairing data and the stored pane layouts of the earlier builds stay in use. The macOS Keychain entry of the app is `tutor3 Safe Storage`. Its name comes from the staged package name, not from the product name.

On 2026-11-23 Dale asked to "change internal name to tutor3". Until then the bundle id was `com.daleross.t3code-panes`, the URL scheme, the staged package name and the Electron userData name were `t3code-panes`, the T3 home was `~/.t3-panes`, and the Keychain entry was `t3code-panes Safe Storage`. The install script (`scripts/fork/install-tutor3.sh`) moves the old data one time: it quits the old app by its old bundle id, renames `~/.t3-panes` to `~/.tutor3` and `~/Library/Application Support/t3code-panes` to `~/Library/Application Support/tutor3` when the new name is free, and copies the Keychain password of `t3code-panes Safe Storage` into `tutor3 Safe Storage`, so the cookies of the browser profiles (claude.ai sign-ins) still decrypt. A hand install does not move anything: `.github/README.md` gives the commands.

## Where the fork code lives

| Location                                                                                            | Content                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/panes/`                                                                               | All pane code and its tests                                                                                                                                        |
| `apps/web/test/panes.renders.tsx`                                                                   | Render counts of a tab of 12 panes                                                                                                                                 |
| `scripts/fork/apply-pane-hunks.ts`                                                                  | Codemod that applies every pane edit to an upstream file                                                                                                           |
| `packages/contracts/src/paneKeybindings.ts`                                                         | The pane and tab command ids                                                                                                                                       |
| `packages/shared/src/paneKeybindings.ts`                                                            | The default keys of the fork                                                                                                                                       |
| `packages/shared/src/panePullRequestWatchHold.ts` and its test                                      | The switch for the hold of a pull request watch                                                                                                                    |
| `apps/web/test/paneThreadShell.ts`                                                                  | Test helper: thread shells with pull requests                                                                                                                      |
| `apps/desktop/src/ipc/forkChannels.ts`, `apps/desktop/src/ipc/methods/forkHostDisk.ts` and its test | The desktop bridge method for the free disk space of the app's own machine                                                                                         |
| `packages/contracts/src/forkSpotify.ts`, `apps/desktop/src/ipc/methods/forkSpotify.ts` and its test | The desktop bridge methods that control the Spotify app on the Mac (section "Music control")                                                                       |
| `TUTOR3.md`                                                                                         | The page for a user of the app: how to install the Mac build, how to connect it, and one line for each difference from stock. Keep its list in step with this file |

The `main` branch, squashed, is three commits on top of the base tag:

1. `fork: app identity (Tutor3)`: 7 one-line edits in 4 upstream files.
2. `fork: split panes with top-level tabs (new files)`: fork-owned files only. New files cannot conflict in a rebase.
3. `fork: generated upstream hunks (scripts/fork/apply-pane-hunks.ts)`: the output of the codemod, and nothing else.

Later work adds commits of kind 2 and kind 3, and a round of parallel work can add merge commits. Squash the branch to three commits again before a push and before a rebase (rebase step 0). `git rebase` drops a merge commit and the conflict resolution in it, so a branch that is not squashed stops a rebase with conflicts in fork-owned files, and the hourly job on `fork-infra` then aborts. `git log --oneline <base tag>..main | wc -l` must print 3 before a push. A push of `main` is a force push: `git push --force-with-lease=main:<old remote tip> fork main`.

Rule for new work: put code in a new file under `apps/web/src/panes/`. An edit to an upstream file must be a hunk in the codemod, in a generated-hunks commit of its own. A fork file outside the locations of the table above also needs a place in the path list of rebase step 0.

## Upstream edits (hunk list)

`node scripts/fork/apply-pane-hunks.ts` applies all sets. `--sets A,B` applies a subset. The codemod is idempotent. It exits with code 1 when an anchor is missing or occurs more than once, and then it writes nothing.

`--check` reports and writes nothing. It exits with code 2 when a hunk is `pending`, so the check fails on a tree that does not carry every edit.

| Set                          | File                                                                                                                                                                                                   | Hunks | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A                            | `apps/web/src/routes/_chat.tsx`                                                                                                                                                                        | 2     | `PaneHost` takes the place of the one `ThreadRouteView`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B                            | `apps/web/src/components/ThreadRouteView.tsx`                                                                                                                                                          | 6     | Pane-aware `Navigate` and `useNavigate`, `PaneCellInset`, a passive pane is a background thread                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| C                            | `apps/web/src/components/ChatView.tsx`                                                                                                                                                                 | 17    | C1 to C8: six window-level sites also stop for `backgroundThread`. C9 to C12 and C15: a pane too narrow for the right panel has no panel, no toggle and no panel keys. C4 to C6 also stop the preview key and the desktop menu action there. C13, C14: a new thread asked for by a pane without focus opens in that pane. C16: only the focused pane reads the window location. C17: `/side` in a narrow pane gives a reason and starts no side chat On `v0.1.11` stock gates the desktop menu listener on `backgroundThread` itself, so C5 and C6 add only `paneNarrow`. |
| D                            | `apps/web/src/components/DiffPanel.tsx`                                                                                                                                                                | 2     | The diff panel of a pane reads that pane's thread, not the route's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| E                            | `apps/web/src/components/chat/timelineViewport.ts`                                                                                                                                                     | 2     | A scroll key with focus on the body scrolls the focused pane only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F                            | `apps/web/src/components/RightPanelTabs.tsx`                                                                                                                                                           | 3     | The `rightPanel.new` key and the launcher's letter keys act in the focused pane only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| G                            | `apps/web/src/state/server.ts`                                                                                                                                                                         | 2     | `withPaneKeybindings` on the merged keybinding list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| H                            | `packages/contracts/src/keybindings.ts`                                                                                                                                                                | 2     | Import and spread of the pane command ids                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| I                            | `packages/shared/src/keybindings.ts`                                                                                                                                                                   | 2     | Import and spread of the pane defaults, as the last defaults                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| J                            | `apps/web/src/keybindings.test.ts`                                                                                                                                                                     | 1     | Upstream test of the defaults: `mod+shift+d` is now `layout.splitDown`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| J                            | `apps/web/src/speech/useDictationShortcut.browser.test.tsx`                                                                                                                                            | 2     | Upstream test presses the moved dictation key (`mod+shift+u`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| K                            | `apps/web/src/components/chat/composerFocusRedirect.ts`                                                                                                                                                | 3     | Type-to-focus ignores the launcher and the maximized panel of a passive pane                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| L                            | `apps/web/src/components/preview/PreviewView.tsx`                                                                                                                                                      | 2     | A preview action and a desktop preview menu action run in the focused pane only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| L                            | `apps/web/src/components/files/FileBrowserPanel.tsx`                                                                                                                                                   | 2     | The panel find action runs in the focused pane only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M                            | `apps/web/src/components/settings/KeybindingsSettings.tsx`                                                                                                                                             | 4     | Settings lists the keys that work, and sends a pane key only to a server that knows it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| N                            | `apps/web/src/components/chat/DraftHeroHeadline.tsx`                                                                                                                                                   | 1     | "or start without a project" focuses the project picker of its own pane                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| O                            | `apps/web/src/components/chat/RightPanelSurfaceContent.tsx`                                                                                                                                            | 3     | The pull request copy-number key acts in the focused pane only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `r2-density-settings`        | `apps/web/src/components/settings/AppearanceSettingsPanel.tsx`                                                                                                                                         | 2     | The two density rows after "Chat width" (section "Chat density")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `r2-density-settings`        | `apps/web/src/components/settings/settingsSearch.ts`                                                                                                                                                   | 2     | The settings search lists every fork setting (`PANE_SETTINGS_SEARCH_ITEMS`) On `v0.1.11` hunk 4 anchors on the `msg(...)` search terms of "Chat width".                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `r2-bottombar-context-strip` | `apps/web/src/components/ChatView.tsx`                                                                                                                                                                 | 2     | The strip of a started thread stays when its pane asks for that (section "Bottom bar in panes")                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `r3-thread`                  | `apps/web/src/components/chat/ChatHeader.tsx`                                                                                                                                                          | 2     | The preview button of the chat header                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `r3-thread`                  | `apps/web/src/components/chat/ThreadDetailsPrRows.tsx`                                                                                                                                                 | 2     | The preview row under the pull request row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `r3-paste-collapse`          | `apps/web/src/components/chat/ChatComposer.tsx`                                                                                                                                                        | 1     | The composer mounts the fork wrapper of the stock editor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `r3-paste-collapse`          | `apps/web/src/components/composerContextPresentation.tsx`                                                                                                                                              | 2     | The chip registry fallback renders the chip of a collapsed paste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `r3-environment-resources`   | `apps/web/src/components/sidebar/SidebarChrome.tsx`                                                                                                                                                    | 2     | The fork footer (`ForkSidebarFooter`) in the sidebar footer: the arcade and the resources readout                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `r3-environment-resources`   | `packages/contracts/src/ipc.ts`                                                                                                                                                                        | 1     | `getHostDiskSpace` on the desktop bridge type, optional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `r3-environment-resources`   | `apps/desktop/src/preload.ts`                                                                                                                                                                          | 2     | The bridge method                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `r3-environment-resources`   | `apps/desktop/src/ipc/DesktopIpcHandlers.ts`                                                                                                                                                           | 2     | The handler of the main process                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `r3-account-quota`           | `apps/web/src/components/chat/ModelPickerContent.tsx`                                                                                                                                                  | 2     | The quota list under the model list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `r3-account-quota`           | `apps/web/src/hooks/useHandleNewThread.ts`                                                                                                                                                             | 3     | A new thread asks the fork for its account. The hunks name one stock local, `projectRef`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `r3-account-quota`           | `apps/web/src/lib/seedDraftModelSelection.ts`                                                                                                                                                          | 2     | A draft that moves to another project or machine asks the same                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `r3-settings`                | `apps/web/src/components/settings/AppearanceSettingsPanel.tsx`                                                                                                                                         | 2     | The fork section "Tutor3" after the stock "Interface" section (section "Fork settings")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `r3-scroll-to-end`           | `apps/web/src/components/ChatView.tsx`                                                                                                                                                                 | 1     | The chat view gives its stock `scrollToEnd` to the fork's key handler (section "Keys"). The import is part of hunk C9                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `r4-stop-turn`               | `apps/web/src/components/ChatView.tsx`                                                                                                                                                                 | 2     | The chat view gives its stock stop and its stock "Revert and keep changes" to the fork's key handler (section "Keys"). The call names stock locals only                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `r5-tutor-theme`             | `apps/web/src/appInit.tsx`                                                                                                                                                                             | 2     | The start sequence installs and selects the Tutor theme on a client that never chose a theme (section "Tutor theme"). The call is directly before the stock `startDefaultThemeAdoption`                                                                                                                                                                                                                                                                                                                                                                                   |
| `r5-message-jump`            | `apps/web/src/components/ChatView.tsx`                                                                                                                                                                 | 3     | The chat view gives its timeline list, its stock "Load earlier turns" and its stock viewport callback to the fork's key handler (section "Keys"). The call names stock locals only                                                                                                                                                                                                                                                                                                                                                                                        |
| `r6-ci-status`               | `apps/web/src/components/sidebar/SidebarThreadRow.tsx`                                                                                                                                                 | 2     | The meta line of a sidebar row shows the CI lanes and the auto-merge state of its open pull request, after the stock pull request badge (section "CI status in the sidebar")                                                                                                                                                                                                                                                                                                                                                                                              |
| `r7-pr-watch-hold`           | `packages/shared/src/orchestrationV2PendingBackgroundWork.ts`, `apps/web/src/appInit.tsx`                                                                                                              | 5     | A pull request watch does not hold its thread in this client: 3 hunks in the shared hold rule read a switch, and 2 hunks in the start sequence give the client setting to that switch (section "Pull request watch") On `v0.1.11` hunk 3 wraps the new stock condition (a merged watch, and a watch `until: "merged"`, also hold in stock).                                                                                                                                                                                                                               |
| `r7-pr-watch-fold`           | `apps/web/src/components/chat/MessagesTimeline.tsx`                                                                                                                                                    | 2     | The chat shows the earlier quiet update turns of a pull request watch as one line: the import, and one call of `usePullRequestUpdateFold` around the stock `useStableRows` (section "Pull request watch")                                                                                                                                                                                                                                                                                                                                                                 |
| `r7-work-tokens`             | `apps/web/src/components/chat/TimelineWorkGroupRows.tsx`, `V2LifecycleRow.tsx`, `TimelineV2EventRow.tsx`                                                                                               | 6     | The timeline shows the tokens of running work: beside the stock "Working for" label, in the row of a subagent, and as a sum on a subagent group line. Each file gets one import and one element (section "Token use of running work")                                                                                                                                                                                                                                                                                                                                     |
| `r7-pane-pr-chip`            | `apps/web/src/components/BranchToolbar.tsx`                                                                                                                                                            | 2     | The strip under the composer shows the pull request of its thread with its CI state, after the stock `{trailing}` item (section "Pull request chip in the bottom bar")                                                                                                                                                                                                                                                                                                                                                                                                    |
| `r7-draft-environment`       | `apps/web/src/components/chat/DraftHeroHeadline.tsx`                                                                                                                                                   | 3     | The new thread screen gets the environment control under its headline, and its project picker lists the projects of the draft's environment (section "Environment of a new thread")                                                                                                                                                                                                                                                                                                                                                                                       |
| `r7-palette-filter`          | `apps/web/src/components/CommandPalette.tsx`                                                                                                                                                           | 5     | The filter by environment and project of the command palette: the hook around the stock thread rows, the narrowing of the project rows, the filter control in the search field, and the key rule before the stock key handler (section "Command palette filter") On `v0.1.11` hunk 2 anchors on the new stock field `isSearchFailed`.                                                                                                                                                                                                                                     |
| `r7-music-control`           | `apps/web/src/components/sidebar/SidebarChrome.tsx`, `packages/contracts/src/ipc.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc/DesktopIpcHandlers.ts`, `scripts/build-desktop-artifact.ts` | 8     | The music button after the Usage button of the sidebar footer, two desktop bridge methods for the Spotify app (contract, preload, handlers), and the Apple events usage text of the Mac app (section "Music control")                                                                                                                                                                                                                                                                                                                                                     |
| `r7-worktree-label`          | `apps/web/src/components/BranchToolbarEnvModeSelector.tsx`                                                                                                                                             | 2     | The folder item of the bottom bar gets its label from the fork, which gives none for a worktree that the server named (section "Bottom bar in panes") On `v0.1.11` the stock call takes the message resolver `m`.                                                                                                                                                                                                                                                                                                                                                         |
| `r7-worked-time`             | `apps/web/src/components/chat/TimelineAssistantRows.tsx`                                                                                                                                               | 2     | The footer of the last agent message of a finished turn shows the working time of the turn after the stock time: the import, and `<WorkedTimeLabel message={message} />` in `AssistantMessageMeta` (section "Working time of a finished turn") On `v0.1.11` the stock tooltip call takes `m`.                                                                                                                                                                                                                                                                             |
| `r7-artifact-links`          | `apps/web/src/components/ChatMarkdown.tsx`                                                                                                                                                             | 3     | A Claude artifact link of a chat opens in the app's browser, in the browser profile of the thread's Claude account: the import, one call in the click handler of a link directly before the stock `resolveLinkTarget` test, and the profile in the one `openUrlInPreview` call of the stock "open in preview" function (section "Artifact links")                                                                                                                                                                                                                         |
| `r7-ultracode-style`         | `apps/web/src/components/chat/ChatComposer.tsx`                                                                                                                                                        | 1     | The composer gives its selected provider to the fork's editor wrapper, which styles the words "ultracode" and "ultrathink" for a Claude provider: the line `keywordProvider={selectedProvider}` after the stock `literalText` prop. Needs the import hunk of `r3-paste-collapse` (section "Claude keywords in the input")                                                                                                                                                                                                                                                 |
| `r8-browser-pane`            | `apps/web/src/components/preview/ThreadPreviewMiniPlayer.tsx`                                                                                                                                          | 2     | The stock floating preview mounts one fork element after its stock `{pillActions}`: the larger first size, the page size that follows the frame, the drag grip, the two buttons and the drop zones that open a browser pane (section "Browser pane")                                                                                                                                                                                                                                                                                                                      |
| `r9-menubar-sound`           | `apps/web/src/appInit.tsx`, `packages/contracts/src/ipc.ts`, `apps/desktop/src/preload.ts`, `apps/desktop/src/ipc/DesktopIpcHandlers.ts`                                                               | 6     | The renderer watch of unread finished threads and the finish sound (`startFinishedThreadSignals`), and the optional bridge method `setMenuBarUnread` with its handler (section "Menu bar count and finish sound")                                                                                                                                                                                                                                                                                                                                                         |
| `r9-context-breakdown`       | `apps/web/src/components/chat/ThreadDetailsUsage.tsx`                                                                                                                                                  | 2     | The stock "Context" row of the thread details opens the fork's breakdown popover on hover and click (section "Context breakdown") On `v0.1.11` the stock label is `gt("Context", ...)`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `r10-selection-input`        | `apps/web/src/components/chat/ChatComposer.tsx`                                                                                                                                                        | 4     | Text selected in a chat shows as the placeholder of its empty input, with a Tab key hint. Tab and a right click put it in the input: the import, one hook call after the stock prompt suggestion, and the placeholder and hint expressions (section "Selection to input") On `v0.1.11` the stock placeholder is `m(DEFAULT_COMPOSER_PLACEHOLDER)`.                                                                                                                                                                                                                        |
| `r11-prompt-history`         | `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/components/chat/composerCommandKey.ts`                                                                                                  | 5     | The Up key reads the input history from the fork memory of sent messages, and a recalled message left in the input continues the recall: two imports, one hook call, the history argument of the key handler, and the start position of a recall (section "Input history after a reconnect")                                                                                                                                                                                                                                                                              |
| `r12-panel-tab-drag`         | `apps/web/src/components/RightPanelTabs.tsx`                                                                                                                                                           | 4     | A browser tab or a side chat tab of the stock right panel drags out of the panel to the drop zones of the panes: the import, one hook call that gives the tab its `data-right-panel-surface` id while "Browser panes" is on, that attribute on the tab, and a test at the start of the stock reorder that skips a release outside the panel (section "Drag right-panel tabs")                                                                                                                                                                                             |
| `r13-english-copy`           | `vite.config.ts`                                                                                                                                                                                       | 1     | The v0.1.11 lint rule `t3code/no-untranslated-copy` skips `apps/web/src/panes/**`: one line in the `excludeFiles` list of that rule. The fork's own copy is English only, and translated copy would need keys in every locale (section "Rebase to a new stable tag")                                                                                                                                                                                                                                                                                                      |
| `r14-old-server`             | `apps/web/src/browser/previewRuntime.ts`                                                                                                                                                               | 2     | A stock v0.1.10 server (`dale-nix`) has no preview tunnel route, and the v0.1.11 schema decodes its missing `enablePreviewTunnel` as on. The desktop loads another environment's localhost itself only when the server also reports `capabilities.previewTunnelSetting` (`panes/previewTunnelRoute.ts`). Otherwise the tab streams from the server, as for a server with the tunnel switched off.                                                                                                                                                                         |
| `r14-old-server`             | `apps/web/src/state/portForwards.ts`                                                                                                                                                                   | 2     | The same check for port forwards: the forward actions show only for a server that has the tunnel route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `r14-old-server`             | `apps/web/src/components/settings/SourceControlSettings.tsx`                                                                                                                                           | 1     | The issue tracker section shows only for a server with `capabilities.issues`, as the other issue surfaces of v0.1.11 do. A v0.1.10 server has no `issueTrackers` RPC, and the section showed a load error that Retry could not clear.                                                                                                                                                                                                                                                                                                                                     |
| `r15-live-tokens`            | `apps/web/src/components/chat/ThreadActivityBanners.tsx`, `MessagesTimeline.tsx`                                                                                                                       | 4     | The stock background work bar shows the tokens of the work it lists, before its time, and the fold line of the latest turn shows the turn's tokens while background work runs: one import and one element in each file (section "Live token use")                                                                                                                                                                                                                                                                                                                         |
| `r16-browser-tab-keys`       | `apps/web/src/components/ReopenClosedViewShortcut.tsx`                                                                                                                                                 | 4     | With 2+ tabs, the next, previous and jump tab keys join the stock list of keys that a focused browser page sends back to the app (`panes/previewPaneKeys.ts`). The pane key scope runs them as menu actions.                                                                                                                                                                                                                                                                                                                                                              |
| `r16-browser-tab-keys`       | `apps/desktop/src/preview/Manager.ts`                                                                                                                                                                  | 1     | A forwarded `layout.*` key gives the keyboard back to the app window, as the stock focus keys do.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `r17-thread-artifacts`       | `apps/web/src/components/chat/ThreadDetailsPanel.tsx`                                                                                                                                                  | 2     | Imports and mounts `ThreadArtifactsSection` (`panes/ThreadArtifactsSection.tsx`) after Lineage, at the same density and draft gate. The section renders nothing with its setting off or with no artifact.                                                                                                                                                                                                                                                                                                                                                                 |
| `r17-thread-artifacts`       | `apps/web/src/components/chat/ThreadDetailsCard.tsx`                                                                                                                                                   | 1     | The density measure leaves out `[data-thread-artifacts-panel]`, as it does the other lists, so a long artifact list does not make the card compact.                                                                                                                                                                                                                                                                                                                                                                                                                       |

Total: 175 hunks in 55 upstream files, on `v0.1.11`. Two tracks of one round must not use the same anchor: the second hunk then splits the replacement of the first, and the codemod reports the first as pending. A new setting therefore gets a row in a fork-owned settings component and a search item in the fork-owned list, not a hunk of its own.

The plan set a budget of 7 web files and about 25 changed lines. The real carried diff is larger, for two reasons. In the sets A to O, each review fix for more than one live chat view needs a gate at a stock window-level site, and each hunk beyond the plan's sets maps to one such fix. The sets `r2-*`, `r3-*`, `r4-*`, `r5-*`, `r6-*` and `r7-*` are not review fixes: each of their hunks is the mount point of a feature of a later round (a settings row, a button, a readout, a call of a fork function). To lower the count later, offer the `backgroundThread` gates (C1 to C8) and the passive-pane guards (F, K, L, N, O) to upstream.

Set D is at the one caller of `useThreadRouteRef`, not in `apps/web/src/hooks/useThreadRouteTarget.ts`. That hook file must stay free of pane imports: the upstream test `apps/web/src/hooks/useHandleNewThread.test.ts` mocks `react` with two functions only and loads the hook file.

Carried diff against `v0.1.11` (counted on 2026-11-23 with `git diff --numstat v0.1.11` over the 55 hunk files):

| Scope                                                                                                                 | Files | Insertions | Deletions |
| --------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | --------- |
| Web source (sets A to G, K to O, `r2-*` to `r12-*`, `r14-old-server`, `r15-live-tokens`, `r16-*`, `r17-*`)            | 44    | 284        | 62        |
| Upstream web tests (set J)                                                                                            | 2     | 5          | 5         |
| `packages/contracts` and `packages/shared` (H, I, `r3-*`, `r7-pr-watch-hold`, `r7-music-control`, `r9-menubar-sound`) | 4     | 24         | 4         |
| `apps/desktop` (`r3-environment-resources`, `r7-music-control`, `r9-menubar-sound`, `r16-*`)                          | 3     | 17         | 1         |
| Identity                                                                                                              | 4     | 7          | 7         |
| `vite.config.ts` (`r13-english-copy`)                                                                                 | 1     | 1          | 0         |
| `scripts/build-desktop-artifact.ts` (`r7-music-control`, a file of the identity row)                                  | 0     | 2          | 0         |

Not edited: `apps/server`, `apps/web/src/index.css`, `Sidebar.tsx`, `settings/SettingsPanels.tsx`.

## Fork settings

Every setting of the fork is on one page, Settings > Appearance.

| Setting                                                      | Place                             | Default | Storage key and field                                   | Section of this file                      |
| ------------------------------------------------------------ | --------------------------------- | ------- | ------------------------------------------------------- | ----------------------------------------- |
| Chat density                                                 | "Interface", after "Chat width"   | Normal  | `t3code-fork:density:v1`, `chatDensity`                 | Chat density                              |
| Split pane density                                           | "Interface", after "Chat density" | Compact | `t3code-fork:density:v1`, `splitPaneDensity`            | Chat density                              |
| Collapse long pastes                                         | "Tutor3"                          | Off     | `t3code-fork:paste-collapse:v1`, `collapseLongPastes`   | Collapse long pastes                      |
| Show environment resources                                   | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showEnvironmentResources`   | Environment resources and account quota   |
| Show account quota                                           | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showAccountQuota`           | Environment resources and account quota   |
| New threads use the account with the most quota left         | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `newThreadsUseMostQuota`     | Environment resources and account quota   |
| Show CI status in the sidebar                                | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showCiStatus`               | CI status in the sidebar                  |
| Watched pull requests do not hold a thread                   | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `releaseWatchedPullRequests` | Pull request watch                        |
| Fold pull request updates in the chat                        | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `foldPullRequestUpdates`     | Pull request watch                        |
| Show token use of running work                               | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showWorkTokens`             | Token use of running work, Live token use |
| Show the pull request in the bottom bar                      | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showPullRequestChip`        | Pull request chip in the bottom bar       |
| Choose the environment on a new thread                       | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `draftEnvironmentChoice`     | Environment of a new thread               |
| Open a thread in the current pane when another pane shows it | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `mirrorPanes`                | Mirror panes                              |
| Show the music control                                       | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showMusicControl`           | Music control                             |
| Hide the worktree folder in the bottom bar                   | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `hideWorktreeFolder`         | Bottom bar in panes                       |
| Filter in the command palette                                | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `paletteFilter`              | Command palette filter                    |
| Show the working time of a finished turn                     | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showWorkedTime`             | Working time of a finished turn           |
| Open artifact links in the app                               | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `artifactLinksInApp`         | Artifact links                            |
| List artifacts in the thread details                         | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showThreadArtifacts`        | Thread artifacts                          |
| Style Claude keywords in the input                           | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `styleClaudeKeywords`        | Claude keywords in the input              |
| Larger floating preview with a resize grip                   | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `largeFloatingPreview`       | Browser pane                              |
| Browser panes                                                | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `browserPanes`               | Browser pane                              |
| Drag panes to move them                                      | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `dragPanes`                  | Drag a chat pane                          |
| Show unread finished threads in the menu bar                 | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `menuBarUnread`              | Menu bar count and finish sound           |
| Play a sound when a thread finishes                          | "Tutor3"                          | Off     | `t3code-fork:readouts:v1`, `finishSound`                | Menu bar count and finish sound           |
| Show a context breakdown                                     | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `showContextBreakdown`       | Context breakdown                         |
| Offer selected text to the input                             | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `selectionToInput`           | Selection to input                        |
| Keep input history after a reconnect                         | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `keepPromptHistory`          | Input history after a reconnect           |
| Free a pane when its thread settles                          | "Tutor3"                          | On      | `t3code-fork:thread:v1`, `releasePaneOnMergeSettle`     | Settle on merge and preview links         |
| Preview links, one URL template for each repository          | "Tutor3"                          | Empty   | `t3code-fork:thread:v1`, `previewUrlTemplates`          | Settle on merge and preview links         |
| Fade panes without focus                                     | "Tutor3"                          | On      | `t3code-fork:readouts:v1`, `fadeUnfocusedPanes`         | Faded panes                               |
| Show the arcade                                              | "Tutor3"                          | Off     | `t3code-fork:arcade:v1`, `showArcade`                   | Arcade                                    |

- "Tutor3" is a section of the fork (`apps/web/src/panes/ForkSettingsSection.tsx`). It comes directly after the stock "Interface" section, which holds the two density rows, and before "Typography". The set `r3-settings` mounts it with 2 hunks. A new fork setting is a new row in that component and needs no hunk.
- Each key is in the browser storage of the client, the same storage as the pane layout. A server never receives a fork setting, so each setting works when the server is a stock server. The values belong to one browser profile and one origin. The desktop app keeps them in its Electron profile.
- The "Restore defaults" action of the settings page does not reset a fork setting. Each row has its own reset button.
- The settings search finds each row. The search items are in the fork-owned list `PANE_SETTINGS_SEARCH_ITEMS` (`apps/web/src/panes/paneSettingsSearch.ts`), which `settingsSearch.ts` spreads through the set `r2-density-settings`.
- Four more keys hold state that is not a setting: the armed threads of the settle watch in `t3code-fork:armed-threads:v1`, the chip places of each draft in `t3code-fork:paste-chips:v1`, the closed state of the resources readout in `t3code-fork:resources-collapsed:v1`, and the best snake score in `t3code-fork:arcade-scores:v1`. A key of settings holds settings only, so a write that the app makes by itself never carries a setting.
- A second window of the client on the same origin: each of the four settings stores reads its key again when another window writes it (`followOtherWindows` in `apps/web/src/panes/forkStorageSync.ts`, on the `storage` event, as the stock `useLocalStorage` does). Without that, a window with an old copy put the old settings back at its next write. The pane layout (`t3code-fork:panes:v1`) and the armed threads are not shared this way: two windows that both show panes still write one layout key. Checked on 2026-11-18 in a dev stack with two pages of one browser profile: one page turned "Free a pane when its thread settles" off, the other page then split its pane, and the switch was still off after a reload of the first page.

Stock look: with the theme "T3 Code" (section "Tutor theme"), "Chat density" at Normal, each switch of "Tutor3" off, no preview template, and one tab with one pane, the app renders the stock DOM. "Free a pane when its thread settles" renders nothing and acts only with 2+ panes or 2+ tabs. Each setting that the table lists as On changes a new profile against stock, and the section of each setting says where. The last check of the stock DOM (below) is older than the settings of 2026-11-19 and was not run again with them.

Checked on 2026-11-18 in headless Chromium at 1440 x 900: the fork client, with each switch of "Tutor3" off and no template, against a stock `v0.1.10` web client. Both clients used the same dev server with an isolated home. The DOM of the whole page was equal in five views: two started threads, the open model picker, a composer with typed text, and the new-thread screen. The only differences are the three of the pane host, which are older than these settings:

- `<main>` has the attributes `data-splitpane-root`, `data-multi="false"` and `data-chat-density="normal"`.
- Two wrappers with `display: contents` are around the chat view: `[data-splitpane-grid]` and `[data-splitpane-cell]`.
- On the new-thread screen, one attribute holds the id of the draft, which each client makes for itself.

In the same stack, each switch changed its key in the browser storage, and each feature showed with its switch on: the footer line, the quota line of the one Claude account in the picker, and the chip of a paste of 14 lines, also in the second pane of a split. Not checked in that stack: a pull request (the scratch project had no forge, so no preview link and no settle after a merge), two Claude accounts, a remote environment, and the packaged app.

## Tutor theme

The default colors of the fork are the Tutor colors. Dale asked for this on 2026-11-19. It changes the earlier rule that the look stays the stock look: each client now starts with the theme "Tutor" in its dark palette, and the theme "T3 Code" gives the stock colors.

- The theme is `TUTOR_THEME` in `apps/web/src/panes/tutorTheme.ts`. It has a light palette and a dark palette, and the stock "Color scheme" setting (System, Light, Dark) selects between them. The values are from the Tutor design tokens (`frontends/ui-kit/styles/tokens.css` of the Tutor codebase): ink `#202020`, yellow `#ffd24c`, hover yellow `#ffaa00`, dark yellow `#5d4400`, pale yellow `#fff1c4`, and the grey steps.
- Light: a white canvas, a `#f5f5f5` sidebar and ink text. Dark: an ink canvas, a `#1b1b1b` sidebar and `#f5f5f5` text. In both, the action color is Tutor yellow with ink text: the send button, solid buttons, switches and the line of the selected tab. The open thread row of the sidebar, the selected settings row and the message of the user have a pale yellow fill (`#fff1c4` light, `#3d3725` dark). The focus ring is ink in the light palette and yellow in the dark palette.
- The stock markup also uses the action color as a text color (`text-primary`, about 24 places). Tutor yellow on white has a contrast of 1.4. The theme therefore carries one style rule (the stock `css` field of a theme) that shows that text in the dark yellow, in the light palette only.
- The theme is not built in. `adoptTutorTheme` writes it to the stock theme library of the client (`t3code:themes:v1`), as an imported theme file would be, so no server and no stock file knows it. Settings > Appearance > Themes lists it as "Tutor", and the stock boot script of `index.html` paints it before the app loads.
- Adoption runs once for each browser profile. The key `tutor3:default-theme-adopted:v2` holds the adopted palette version. On a client with no key, the theme is installed and selected, and the stock "Color scheme" is set to Dark. Dale asked for the dark palette as the default of every user on 2026-11-19. This first run also replaces a theme and a color scheme that the user chose before. After that the choice of the user wins: another theme or color scheme stays, and a removed "Tutor" theme stays removed. The key was `...:v1` in the first build of the theme, which followed the system color scheme and kept a chosen theme. A client of that build runs the adoption once more.
- A palette change needs a higher `TUTOR_THEME_VERSION`. A client with an older version then replaces its stored copy and keeps its selected theme. An edit that the user made to the "Tutor" theme is lost at that moment. Duplicate the theme to keep an edit.
- A default theme that an environment publishes (stock `startDefaultThemeAdoption`) runs after the fork call and wins.
- The phone app and a stock client do not show the theme. It is in the storage of each fork client only.
- Upstream edit: set `r5-tutor-theme`, 2 hunks in `appInit.tsx`: the import and the call.
- Checks: `tutorTheme.test.ts` (the adoption steps, and the stock theme parser keeps both palettes and the style rule).

Checked on 2026-11-19 in a dev stack with an isolated home, in headless Chromium at 1440 x 900, with a light system color scheme: a new profile started with the theme "Tutor" in the dark palette, and the stored color scheme was Dark. A profile with the stock theme and the Light color scheme, and no adoption key, also started in the dark Tutor palette. The send button was yellow in both palettes. A `text-primary` element was `#5d4400` in the light palette and yellow in the dark palette. After a change to the stock theme, a reload kept the stock colors. After the removal of "Tutor" from the library, a reload did not install it again.

## Panes and drafts

Stock keeps one reusable empty draft for each project. It opens that draft again for every new thread, and it resets the draft's branch and mode when it does. With panes, each pane owns its draft:

- Every new pane (split right, split down) and every new tab opens its own new draft thread, in the project of the pane the user came from. The pane stays empty ("No thread in this pane") only when no project exists.
- `apps/web/src/panes/paneDrafts.ts` gives each draft that a pane shows a mapping key of its own in the stock draft store: `fork-pane-draft/<draft id>`. The stock new-thread flow then finds no reusable draft and makes a fresh one. This rule applies only with 2+ panes or 2+ tabs. One tab with one pane keeps the stock rule.
- A draft under such a key is saved across a restart, because stock saves each draft that a key maps to. An empty draft under such a key that no pane shows is removed.
- `fillWithNewThread` in `apps/web/src/panes/paneActions.ts` calls the stock `createNewThreadHandler` with a stand-in router. The stand-in names the source pane's thread as the route, never changes its URL, and gives the draft to the pane. The stock flow reads only `router.state.matches`, `router.state.location.href` and `router.navigate`.
- New threads for panes open one at a time, in the order asked (`queueNewThread`). Stock picks the project's reusable empty draft before it waits for the project file, so two requests that overlap would pick the same draft.
- A pane that a stored layout left empty takes its own draft when its tab mounts (`fillEmptyPane`, called by `PaneHost`). A layout can hold such a pane after a quit during a fill.
- A draft belongs to one pane. A layout load keeps a draft in the first pane that shows it. A pane of a later tab that shows the same draft becomes empty and takes its own draft when its tab mounts (`sanitizeLayout`). The same server thread in two tabs is still allowed, and since 2026-11-19 also in two panes of one tab (section "Mirror panes").
- When the layout returns to one tab with one pane, the shown draft goes back under its project's key, if the project has no other reusable draft. The stock new-thread action then reuses that draft and keeps its branch and mode.
- A draft that the user sends while its tab is not mounted becomes a server thread in the layout when the send is final.
- "Send and new thread" from a pane opens its follow-up draft in that pane, also when the pane lost focus before the server accepted the turn (`usePaneNewThreadHandler`, hunks C13 and C14).

A pane whose thread goes away:

- Stock does not remove or archive a thread when its pull request merges. With `storageCleanup.worktreeOnMerge`, the server removes the worktree directory only (`apps/server/src/storageCleanup.ts`, "Preserve branch/path so ProviderTurnStartService can recreate the checkout on resume"). With `sidebarAutoSettleOnMerge` (default on), the thread moves to the Settled shelf. The thread stays open and readable in the stock app. A pane keeps a merged thread when the setting "Free a pane when its thread settles" is off. With the setting on, which is the default, the pane takes a new draft (section "Settle on merge and preview links").
- A pane changes only when stock can no longer show its thread. Those cases are in `ThreadRouteView.tsx`: a deleted thread, an archived thread that the shell no longer lists, a thread that a tag filter hides, and a draft that is gone. Stock then goes to the home route.
- With 2+ panes or 2+ tabs, the pane takes its own new draft thread in place of the home route (`replacePaneThread`). It uses the project of the thread that went away, if that project still exists. The pane keeps its place and size. No other pane remounts or loses focus. This applies to a passive pane and to the focused pane.
- User actions on the focused pane's thread stay stock. Archive opens a new draft in that pane. Delete opens the next thread of the sidebar in that pane, or a new draft when no thread is left.

## Bottom bar in panes

The bottom bar is the stock strip under the composer: checkout mode, branch and, for a new thread, the access mode (`BranchToolbar`, `[data-slot="composer-context-strip"]`).

Cause of the report "the bottom bar is missing in split panes": stock removes the strip when a thread starts. The stock setting Settings > Appearance > Advanced > "composer context" (`persistComposerContextStrip`) keeps it, and its default is off. The same started thread has no strip in one pane either. No pane rule, pane size or `backgroundThread` gate hides it. In a wide stock window the thread panel beside the chat names the checkout. That panel was not open in the 607 px panes of a 2x2 grid.

What the fork does:

- Wherever more than one pane or tab exists, each pane keeps the strip for a started thread, focused or passive, whatever the setting says (`usePaneKeepsContextStrip` in `apps/web/src/panes/paneContextStrip.ts`). One tab with one pane follows the stock setting.
- The other stock rules stay: a folder that is no repository on the one environment shows no strip, and a side chat shows none.
- The controls are the stock controls of that pane's thread. A press on the branch control of a passive pane focuses the pane and opens the ref list of that thread's checkout.
- Stock collapses every label of the strip to its icon when the labels do not fit. In a pane the branch keeps its name and truncates it in the middle. The other labels collapse as in stock (`apps/web/src/panes/paneContextStrip.css`).

| Set                          | File                                   | Hunks | Purpose                                                              |
| ---------------------------- | -------------------------------------- | ----- | -------------------------------------------------------------------- |
| `r2-bottombar-context-strip` | `apps/web/src/components/ChatView.tsx` | 2     | The strip of a started thread also stays when its pane asks for that |

Sizes, measured in headless Chromium after the merge with the small panes and the chat density:

| Pane                                            | Normal | Compact | Very compact |
| ----------------------------------------------- | ------ | ------- | ------------ |
| Strip, pane of 320 px or more                   | 32 px  | 28 px   | 24 px        |
| Strip, short pane                               | 26 px  | 23 px   | 20 px        |
| Header, composer, strip and gap in a short pane | 137 px | 127 px  | 119 px       |

- The strip is inside the composer overlay, so it takes the chat density.
- Under the strip of a docked composer, stock leaves 1rem to 1.25rem of bare space, and the strip is glass at 80%. A chat that is not at its end shows through both, under the composer. Dale reported that on 2026-11-20 ("the chat appears under bottom of input element", "move the input down a bit"). With 2+ panes or 2+ tabs the space is 0.375rem, and the space and the strip have the page color (`panes.css`). The composer is therefore 10 px to 14 px lower in Normal density. A short pane keeps its 4 px. The new-thread screen and one tab with one pane are stock.
- A short pane (below 320 px) moves the strip to 2 px under the composer and leaves 4 px under the strip (`panes.css`). So a pane of the minimum size, 200 x 140 px, shows the whole header, the whole composer and the whole strip in each density. The browser test of 12 minimum panes checks this for each density.
- Before these rules, the composer of a started thread covered 18 px of the header in a 140 px pane in Normal density, and 6 px in Compact.
- These sizes hold for the default font sizes. A larger Interface font size or prompt font size makes the composer taller, and a pane of the minimum height can then be too short for the three parts.

Checks:

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/paneContextStrip.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/paneContextStrip.browser.test.tsx)
```

Rebase check: `paneContextStrip.css` selects stock markup. The strip is `[data-slot="composer-context-strip"]` with `data-compact` (`BranchToolbar.tsx`), a label is `[data-composer-label]` with `[data-composer-label-motion]` inside and a 240 px limit (`ComposerContextLabel.tsx`), and the branch control is the one `[role="combobox"][aria-haspopup="dialog"]` of the strip (`BranchToolbarBranchSelector.tsx`). The browser test fails when the branch name of a 200 px pane has no width.

Packaged-app check, by hand: make a 2x2 grid of started threads on different branches. Each pane shows the bar with its own branch. Change the branch from a passive pane.

Not verified: the packaged Electron app, a thread on a remote environment (the strip then also names the machine), and the access-mode control of a new thread, which was seen in the strip and not used.

Folder item (2026-11-19, Dale: "we also don't need both of these worktree things in the bottom bar. I know one is pwd but it's redundant in most cases"):

- The stock strip shows the folder of the worktree (`t3-cdb6aca1-78d165d24cc028c8`) and the branch (`t3/fix-human-detection-exclusion-zones`). The stock server names the folder when the thread starts, from a temporary branch, and later renames the branch only. So the folder name repeats the branch or is a temporary id.
- With the setting "Hide the worktree folder in the bottom bar" on (default), a thread in a worktree that the server named shows no folder item and no separator before it. A server-named folder ends with `-` and 16 hex digits (`isServerNamedWorktree` in `apps/web/src/panes/worktreeLabel.ts`). A local checkout ("Local checkout") and a folder with another name still show.
- How: set `r7-worktree-label`, 2 hunks in `BranchToolbarEnvModeSelector.tsx`. The locked folder row takes its label through `paneWorktreeLabel`, which returns no text for such a folder. `worktreeLabel.css` then hides a strip item whose label is empty, and the separator before it. The thread details panel and the stock logic function `resolveLockedWorkspaceLabel` are not changed, so the panel still names the folder.
- Limits: the full path no longer shows in a tooltip of the strip for such a thread. The setting is read when the strip renders, so a change shows when the bar next updates. With one connected environment the strip has no environment item, and the folder shows through another stock control that this rule does not reach: not checked.
- Checks: `worktreeLabel.test.ts`. Not verified: the look in a browser (the style rule ran in no test), and the Mac app.

## Keys

`mod` is Cmd on macOS and Ctrl on Windows and Linux. `ctrl` is the Control key on each of them. Every action of this table is a keybinding command (`layout.*`). The user can rebind it in Settings > Keybindings, or in the `keybindings.json` of the server that supplies keybindings. In the desktop app that server is the app's own bundled server.

| Action                                                            | Default key                                | Active when                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Split right / split down                                          | `mod+d` / `mod+shift+d`                    | no terminal focus                                                                                                                                                                                |
| Close pane, innermost thing first                                 | `mod+w`                                    | 2+ panes or 2+ tabs                                                                                                                                                                              |
| Close pane now                                                    | `mod+shift+w`                              | 2+ panes or 2+ tabs                                                                                                                                                                              |
| Focus pane left / right / up / down                               | `ctrl+alt+arrow`                           | 2+ panes                                                                                                                                                                                         |
| New tab                                                           | `mod+t`                                    | always on a thread route                                                                                                                                                                         |
| Close tab                                                         | `mod+alt+w`                                | 2+ tabs                                                                                                                                                                                          |
| Previous tab / next tab                                           | `mod+alt+arrowleft` / `mod+alt+arrowright` | 2+ tabs                                                                                                                                                                                          |
| Previous tab / next tab, second key                               | `ctrl+shift+tab` / `ctrl+tab`              | 2+ tabs                                                                                                                                                                                          |
| Tab 1 to 8, last tab                                              | `mod+1` to `mod+8`, `mod+9`                | 2+ tabs and model picker closed                                                                                                                                                                  |
| Scroll the chat to its end                                        | `mod+arrowdown`                            | no terminal focus, and no caret before the end of a text field (see below). Also with one pane                                                                                                   |
| Stop the turn, and take back a message that was sent a moment ago | `ctrl+c`                                   | a turn can stop in the focused pane, no terminal focus, no selected text, and no focus in the right panel, in the floating preview or in a dialog (see below). Also with one pane                |
| Open or close the music popup                                     | `mod+alt+m`                                | the sidebar shows the music button (Mac app, setting on, sidebar open), no terminal focus. Also with one pane (section "Music control")                                                          |
| Put the caret in the chat input of the focused pane               | `mod+l`                                    | the focused pane shows a composer that does not hold the caret, no focus in a browser preview, no open dialog or menu, and no terminal focus where `mod` is Ctrl (see below). Also with one pane |
| Previous / next user message in the chat                          | `mod+pageup` / `mod+pagedown`              | the focused pane shows a chat, and no terminal focus (see below). Also with one pane                                                                                                             |

A key outside its condition is not consumed. The stock rule on that key then runs.

With terminal focus, `mod+d`, `mod+shift+d`, `mod+n` and `mod+w` are the stock terminal keys of the focused pane's terminal. They split or close no pane.

In a pane narrower than 720 px the stock right-panel keys do nothing: `rightPanel.toggle`, `rightPanel.toggleMaximized`, `diff.toggle` and `preview.toggle`. `rightPanel.close` (`mod+w`) finds no surface there, so the key closes the pane. See "Small panes".

Scroll the chat to its end (`layout.scrollToEnd`, round 3 request R6):

- Stock `v0.1.10` has no key for this. It has the "Scroll to end" button of the chat view, and the terminal has its own "Jump to latest".
- The key does what the button does (`scrollToEnd(true)`), for the chat of the focused pane only. It also works with one tab and one pane.
- In a text field the browser uses `mod+arrowdown` to move the caret to the end of the text. The fork leaves the key to the browser while the caret is before the end of the text, or while a range is selected. With the caret at the end, with an empty field, or with focus outside a text field, the key scrolls the chat. So in a composer with text, the first press moves the caret and the second press scrolls. A chip or one more line behind the caret counts as text.
- With terminal focus the key is not taken. The terminal keeps its keys.
- The command id starts with `layout.` although it is no pane action. That prefix is what the fork's key handler resolves, what Settings > Keybindings lists as a fork command, and what set M keeps away from a stock server.
- Code: `apps/web/src/panes/paneScrollToEnd.ts` (the caret rule and the registry), `usePaneScrollToEnd` in `paneContext.tsx`, the case in `paneKeys.ts`. The caret is read only for a key press that resolves to this command, because the answer needs a DOM range.
- Upstream edit: set `r3-scroll-to-end`, 1 hunk in `ChatView.tsx` (`usePaneScrollToEnd(scrollToEnd, !embedded && !backgroundThread)`). Hunk C9 imports the hook with the two names it already imported.
- Checks: `paneScrollToEnd.test.ts` (the caret rule), `paneKeys.test.ts` (the key, one pane, terminal focus), two tests in `panes.browser.test.tsx` (the timeline reaches its end, the native caret move comes first, the passive pane does not scroll).
- Rebase check: `scrollToEnd` of `useTimelineFollow` must still take `animated` as its one argument, and `ScrollToEndButton` must still call `scrollToEnd(true)`. The caret rule reads the class `ProseMirror-trailingBreak` of the composer editor for the line break that is no text.
- Not verified: the packaged Electron app (macOS can take a `mod+arrow` key first), a composer with a chip behind the caret, and Firefox or Safari. The browser tests run with reduced motion, because the animated scroll of the stock action ends later than a test waits.
- Checked on 2026-11-18 in a dev stack with an isolated home, in headless Chromium, on a Replay thread with the animation on: with focus on the page the key scrolled the chat to its end. With a caret three characters before the end of a prompt, the first press moved the caret to the end and the chat stayed, and the second press scrolled. The bundled server wrote the rule `mod+arrowdown` to its `keybindings.json`.

Stop the turn (`layout.stopTurn`, round 4 request S1):

- Stock `v0.1.10` has the command `thread.stop` with no default key, and the "Edit from here" button under a sent message, which asks "Revert and keep changes" or "Revert files too". The fork key does both steps with the stock code of each.
- The key stops the running turn of the focused pane's chat. It calls the stock stop of that chat view, which is what `thread.stop` and the stop button call. No other thread stops. It also works with one tab and one pane.
- Take back: if the message of the stopped turn was sent less than 15 seconds ago (`TAKE_BACK_WINDOW_MS`) and the agent did nothing but write text, the key also takes the message back. The text returns to the composer at the key press, with no wait for the server (`returnToComposer`, changed on 2026-11-19: Dale saw a delay). It goes behind a draft that the composer already holds, as stock puts it, and the caret goes to the end. When the server settled the stopped run, the conversation rewinds with the stock "Revert and keep changes", and the attachments of the message return then. The key never restores files and never opens the "Edit from here?" dialog.
- Between the key press and the rewind, the message shows in the timeline and in the composer. When the take back is dropped (see below), the turn is stopped, the message stays in the timeline, and the composer keeps the returned text. A send in that time drops the take back, so the first message stays in the conversation.
- In every other case the key stops only, and the message stays in the timeline.
- The key is taken only while all of these hold. In each other case it is not consumed, so the browser copies as before:
  1. No terminal has focus. The terminal keeps its own keys.
  2. No text is selected, in the focused text field or on the page.
  3. Focus is not in the right panel, not in the floating preview (the mini player) and not in a dialog. The spreadsheet viewer, the browser page and the source preview read the key themselves, and their selection is no selection of the document. Stock shows them in each of these places. The rule is the stock reader `isPreviewFocused` plus the stock selectors `[data-preview-mini-player]`, `[data-server-browser-surface]` and `[role="dialog"]`.
  4. The chat view of the focused pane can stop a turn now (the stock `canInterruptRunningThread`).
- The default is a literal `ctrl+c`, so Cmd+C stays copy on macOS. On Windows and Linux the chord is the copy key: with selected text it copies, and with no selected text and a running turn it stops the turn.
- A held key stops one time.
- The take back is decided at the key press by `deriveStopSignal`. Each of these gives "stop only":
  - The message is 15 seconds old or older. The age is read on the clock of the server (`toServerClock`), because the server stamps the message. A time that cannot be read, or a message that is more than 15 seconds in the future, also gives "stop only".
  - The user did not send the message (`createdBy` is not `user`), or the run is a continuation (manual, restart, usage limit) or a delegated task.
  - Stock shows the message with a sender label (`resolveUserMessagePresentation`). A scheduled task and a guest send with `createdBy` `user`, and the user typed neither message.
  - The run holds a second user message, which is a steer.
  - The run holds an item that is no text of the agent. The allowed item types are `user_message`, `assistant_message`, `reasoning`, the workspace setup that the server runs (`turnItemIsWorkspacePreparation`), and the records `checkpoint`, `system_notice`, `notification`, `run_interrupt_request` and `run_interrupt_result`. Each other type stops only: a command, a file change, a file or web search, a tool, a sub-agent, a new thread, a handoff, a fork, an approval, a question, a secret or link request, a todo list, a plan, a compaction, an error. An item with collapsed work and a type that this client does not know also stop only.
- The stock rewind refuses while a turn runs, and the stop settles the run in a later server event. So the key press only records the take back, and a later render of the chat view starts the stock rewind one time (`resolveTakeBack`). It starts when the run has the status `interrupted`, the chat view shows no running turn and no busy send, the environment is connected, and stock has a rewind target for the message (`deriveRevertTurnCountByUserMessageId`). The timeline asks that function with entries that hold the messages of the agent. The entries of the chat view do not hold them, so `withAssistantMessageEntries` adds them first. Without them, a message after a turn that is longer than the loaded history gets no target.
- The take back is dropped, with no message, when the run ends in another status, when a later run exists (the user sent again), when a later send is on its way and the server does not show it yet (`laterSendIsPending`: an optimistic message other than the message of the take back, or the stock `sendInFlight` flag), when the chat view shows another thread, when the provider has no rollback (Antigravity, Cursor, Grok), when an item that is no text shows in the run after the key press, or when 10 seconds pass (`TAKE_BACK_SETTLE_TIMEOUT_MS`). The turn is then stopped and the message stays. A first turn that was stopped before its provider started has no rewind target, so it ends this way.
- The rewind is the stock function `rewindToMessage` (`components/chat/chatViewSend.ts`), which the fork calls as the stock `onRevertToTurnCount` of `useTimelineRewind` calls it, with the same guards and the same `rewindingThreadKeys` mark. The fork gives it the message with an empty text, because the text is already in the composer: the stock function then adds the attachments only. The fork leaves out the last step of stock, which sets the caret and the focus. So the caret of a user who already edits the returned text stays. Its errors are the stock errors of "Edit from here", shown in the stock place.
- A pane that loses focus before its run settles still finishes its take back. The rewind makes no focus call, so the keyboard stays in the pane the user is in. A tab switch unmounts the chat view, and its pending take back is then dropped.
- A second press on the same run keeps a pending take back. With no pending take back, the press decides again.
- Limit: the stock busy state of a send (`isSendBusy`) clears when the stopped run settles, also while a later send is on its way. So the take back reads the later send itself. The stock `sendInFlight` flag is also true for the short time until the server answers the send of the message that the key takes back. A press in that time stops only.
- Limit: a rule of the user on `mod+c` for another command does not take the chord from `ctrl+c` on Windows and Linux, because the fork compares the two rules by their written modifiers (`sameShortcut` in `apps/web/src/panes/paneKeybindings.ts`).
- Code: `apps/web/src/panes/paneStopTurn.ts` (the pure functions, the selection reader and the registry), `apps/web/src/panes/usePaneStopTurn.ts` (the hook of the chat view), the case in `paneKeys.ts`. The three readers of the key state (turn, selection, focus) run only for a key press that resolves to this command. The focus reader is in `paneKeyScopes.ts`.
- Upstream edit: set `r4-stop-turn`, 2 hunks in `ChatView.tsx`: the import, and one call of `usePaneStopTurn` after `useTimelineRewind` with 24 stock locals and `!embedded && !backgroundThread`.
- Checks: `paneStopTurn.test.ts` (the tables of `deriveStopSignal`, `resolveTakeBack` and `laterSendIsPending`, and `withAssistantMessageEntries` with the stock function), `paneKeys.test.ts` (the key, one pane, terminal focus, a selection, no turn, `meta+c`, a held key, a user rule), two tests in `panes.browser.test.tsx`. Test 1: the key stops the focused pane only, stays the copy key with a selection and with focus in a dialog or in the floating preview, and a take back whose run does not settle in 10 seconds is dropped. Test 2: a message of 2 seconds on a server clock that is one hour ahead is taken back with one `checkpoint.rollback` that has `restoreFiles: false`, no dialog, the text in the composer of its pane, and the keyboard in the other pane.
- Rebase check:
  - `turnItemAllowsTakeBack` in `paneStopTurn.ts` has one case for each turn item type of `packages/contracts/src/orchestrationV2.ts`. A new type fails the type check there until it has a case.
  - `unsettledRunIdOf` is a copy of the stock `deriveUnsettledRunId` (`apps/web/src/components/chat/MessagesTimeline.logic.ts`), which is not exported. Compare the two.
  - `rewindToMessage` must still take the input that `usePaneStopTurn` gives it, must still add no text for a message with an empty text, and the stock `onRevertToTurnCount` of `useTimelineRewind` must still do nothing more around it than the guards, the `rewindingThreadKeys` mark, the error and the caret step. Compare the two after each rebase.
  - The right panel is `[data-preview-panel-mode]` (`preview/PreviewPanelShell.tsx`), read through the stock `isPreviewFocused` (`apps/web/src/lib/previewFocus.ts`). The floating preview is `[data-preview-mini-player]` (`preview/ThreadPreviewMiniPlayer.tsx`), the browser page is `[data-server-browser-surface]` (`browser/ServerBrowserSurface.tsx`), and a stock dialog popup has the role `dialog`.
  - `withAssistantMessageEntries` adds what `ThreadTimeline.tsx` has and `ChatView.tsx` does not: the `assistant_message` rows, as `message` entries with their run. Compare it with the `assistant_message` branch of `deriveTimelineEntries` in `session-logic.ts`.
  - `sendInFlightRef` in `ChatView.tsx` must still be the `sendInFlight` flag of `draftSendState`, true from the start of a send to the answer of the server.
- Not verified: see "Untested assumptions", item 24.
- Checked on 2026-11-18 on `dale-nix` (Linux, where `mod` is Ctrl), in a dev stack with an isolated home, in headless Chromium, with the stock server of this checkout and the Replay provider:
  - Second turn of a thread, key pressed from the composer directly after the send: the turn stopped, and the message was in the composer 0.96 s later and not in the timeline. The first turn stayed.
  - First turn of a new thread, key pressed 1.5 s after the stop button showed, before the agent wrote text: the message was in the composer 0.96 s later, and the timeline was empty. For this run only, the replay agent was slowed with a local edit that was not committed, because a Replay turn writes its first output after 30 to 250 ms.
  - A turn with a pending question, and a turn with a plan item: the turn stopped, the message stayed in the timeline, and the composer stayed empty.
  - No running turn: the key was not taken. A running turn with selected text in the timeline: the key was not taken and the turn went on.

Focus the input (`layout.focusInput`, round 4b):

- Stock `v0.1.10` has no key that puts the caret in the composer from any focus. It has type-to-focus: a typed letter goes to the composer while focus is on the page, and not while focus is in a field or on a button.
- The key puts the caret at the end of the prompt, in the composer of the focused pane. It also works with one tab and one pane. Selected text makes no difference to this key.
- It calls `focusAtEnd()` on the app-wide composer handle (`apps/web/src/composerHandleContext.ts`). The stock command palette calls the same function when it closes. `PaneCell` points that handle at the composer of the focused pane, so the fork needs no upstream edit for this key.
- The key is not taken in each of these cases. The stock key or the native key then runs:
  1. Focus is in a browser preview. Stock has `preview.focusUrl` on `mod+l` with the condition `previewFocus`, and that key still focuses the URL field. The stock reader `isPreviewFocused` cannot be the test here. It is true for every surface of the right panel, because `[data-preview-panel-mode]` is the shell of the whole right panel (`preview/PreviewPanelShell.tsx`, rendered by `RightPanelTabs.tsx`). The fork test is narrower (`isBrowserPreviewFocused`): the focused element is a `webview` (the page of a desktop preview), or the right panel shell that holds focus also holds the URL field `[data-preview-url-input]`. The right panel mounts one surface at a time, only the browser preview has that field, and it is the field that the stock key focuses. So the fork key works from the file browser, the diff panel, a pull request surface and a side chat.
  2. Another surface owns the keyboard. The command palette, a key recorder and an `alertdialog` stop every pane key (`suspended`). This key is also not taken while a modal dialog, sheet, menu, select, popover or combobox is open. The test is the stock selector `TYPE_TO_FOCUS_FLOATING_LAYER_SELECTOR`, which the stock type-to-focus uses. The open model picker is one such popup.
  3. The focused pane shows no composer that can take the caret: an empty pane, a chat column that the maximized right panel hides, a composer that stock made inert (during a rewind), a prompt editor that stock disabled, and a pane below 320 px of height whose open terminal drawer covers the composer. Stock disables the editor in four states (the `disabled` prop in `chat/ChatComposer.tsx`): a question that allows only its fixed answers, an answer that the client sends at that moment, a draft that still needs a project, and speech input that holds the text. A disabled editor stays on the page with `contenteditable="false"` and takes no focus, so the fork reads that attribute. In that short pane the key is not taken and the drawer stays open. To close the drawer first would need more code. On a page with no thread (Settings, the pull request pages) no pane key is registered.
  4. The caret is already in that composer. On the web a second press is therefore the key of the browser (its address bar). A repeat of a held key is consumed with no action, so a long first press does not reach the browser.
  5. A terminal has focus on Windows or Linux. `mod` is Ctrl there, and Ctrl+L is "clear screen" in a shell. On macOS the key is taken with terminal focus, because Cmd+L means nothing to a shell. The rule reads the platform (`isMacPlatform`), not the chord: on Windows and Linux a rebound key is also not taken with terminal focus.
- The default rule is `{ key: "mod+l", command: "layout.focusInput", when: "!previewFocus" }`. Its condition is the opposite of the condition of the stock rule on the same chord. Four results:
  - `withPaneKeybindings` (set G) keeps the stock rule. It removes a stock rule only when a pane rule has the same chord and the same condition, or no condition.
  - A stock handler resolves `mod+l` to `preview.focusUrl` while `previewFocus` is true. So does the list of keys that the desktop app forwards from a preview page (`ReopenClosedViewShortcut.tsx`).
  - Settings > Keybindings lists both rules with no conflict mark. The stock conflict rule marks two rules on one chord only when their conditions are equal or one is empty.
  - `packages/shared/src/paneKeybindings.test.ts` passes with no change to its rule: the pane rule takes the chord and not the condition of the stock command.
- The fork's key handler does not supply `previewFocus`, so the condition of the default rule is always true there, and rule 1 decides. With focus in the file browser or in the diff panel the stock condition is true, and the fork still takes the key. Stock resolves `preview.focusUrl` there and finds no URL field.
- A user rule moves the key, and the five rules above still hold for it.
- Limit: a user rule on `mod+l` for this command with no condition removes `preview.focusUrl` from the merged list, as for every pane rule with no condition. The URL key of the preview then does nothing until the user gives it another key.
- Code: `apps/web/src/panes/paneFocusInput.ts` (the registry of the composer handle and the four DOM readers), `focusInputKeyIsFree` in `paneKeys.ts`, the readers in `paneKeyScopes.ts`, the case in `paneActions.ts`, and one effect in `PaneHost.tsx` that registers the handle. The four readers run only for a key press that resolves to this command.
- Upstream edit: none.
- Checks: `paneKeys.test.ts` (the key, one pane, a browser preview, a floating layer, no composer, the caret in the composer, terminal focus on macOS and on Linux, a held key, a user rule), `apps/web/src/panes/paneKeybindings.test.ts` (the merged list resolves both rules, both have the label, Settings lists both with no conflict), `packages/shared/src/paneKeybindings.test.ts` (the rule, and the one stock rule on the key), one test in `panes.browser.test.tsx`: with two panes and focus on a button of the tab bar, the key puts the caret at the end of the prompt of the focused pane, the typed text shows in that composer only, a second press is not consumed, after a pane focus move the key goes to the other composer, and with a question that allows only its fixed answers the key is not consumed and focus stays on the button.
- Rebase check:
  - `preview.focusUrl` must still be the one stock rule on `mod+l`, with the condition `previewFocus`. The shared test fails when that changes.
  - The URL field of the preview is `[data-preview-url-input]` (`preview/PreviewChromeRow.tsx`). The right panel must still mount one surface at a time (`chat/RightPanelSurfaceContent.tsx`). No test fails when one of the two changes: the fork key would then take `mod+l` in a preview, or leave it alone in the file browser.
  - The prompt editor is `[data-testid="composer-editor"]` (`ComposerPromptEditorTiptap.tsx`), as the stock `composerFocus` condition of `ChatView.tsx` reads it. A disabled editor must still have `contenteditable="false"`: ProseMirror writes the attribute, and stock sets the state with `setEditable(!disabled)`. The browser test fails when that changes. A side chat is `[data-side-chat-pane]`, read through the stock `isInSideChatPane`.
  - The chat column that the maximized panel hides has `inert` and `data-chat-column-maximized-away="true"` (`ChatView.tsx`).
  - `TYPE_TO_FOCUS_FLOATING_LAYER_SELECTOR` must still be an export of `chat/composerFocusRedirect.ts`.
- Not verified: see "Untested assumptions", item 25.
- Checked on 2026-11-18 in the same dev stack: with focus on a sidebar button ("Filter threads by project"), the key put the caret in the composer, and typed text went there. A second press with the caret in the composer was not taken. With two panes and focus on the same sidebar button, the caret went to the composer of the focused pane, and the composer of the other pane kept its own text.

Previous and next user message (`layout.previousMessage`, `layout.nextMessage`):

- Stock `v0.1.10` has the two actions as the buttons "Previous turn" and "Next turn" of the timeline minimap, with no key. It has the "Load earlier turns" line at the start of a long thread: a page load holds the newest 10 user turns, and each load adds 20.
- `mod+pageup` scrolls the chat of the focused pane to the last user message that starts above the target line. The target line is 24 px under the top of the list, the offset of the minimap. A message whose start already shows lower on the screen is therefore skipped, and from inside a long answer the first press goes to the message of that answer.
- `mod+pagedown` scrolls to the first user message that starts under the target line. After the last user message it runs the stock "scroll to end". At the end of the chat it does nothing.
- Older turns: when no earlier user message is loaded and the thread has more history, `mod+pageup` runs the stock "Load earlier turns", scrolls to the start of the list, and remembers the rows that the list had. When the page is in the list, the jump continues by itself to the last user message before those rows. A page with no user message asks for one more page. The user presses the key once.
- A jump that waits ends with no scroll in each of these cases: the load fails, the thread has no more history, the pane shows another thread, the user scrolls (wheel, touch, scrollbar or a scroll key), or the user presses one of the two keys again.
- Each jump releases the follow mode of the chat, as a click in the minimap does, so a running turn does not pull the chat to its end. `mod+pagedown` at the last message arms it again through the stock "scroll to end".
- The scroll has no animation. The next press reads the scroll position, and an animated scroll would give it a position on the way.
- After each jump the fork watches the message for 90 animation frames, and scrolls again while its top is more than 1 px off the target line (`alignmentCorrection`, at most 6 times). The list scrolls to a row from estimated sizes, and the "Load earlier turns" line can leave after the scroll. Without the watch, the press that loaded older turns stopped 38 px short in the Mac app (checklist item 40, 2026-11-19), so the next older message needed two more presses. A scroll by the user or a new key press ends the watch.
- A held key acts once. The plain `pageup` and `pagedown` keys stay the stock page scroll. With terminal focus the keys are not taken. In a pane with no chat (an empty pane, a settings page) they are not taken.
- On a MacBook keyboard Page Up is `fn+arrowup`, so the default is `cmd+fn+arrowup`. In a web browser on Windows or Linux, `ctrl+pageup` is the tab key of the browser and does not reach the page. Rebind the two commands there.
- Code: `apps/web/src/panes/paneMessageJump.ts` (the two decisions and the registry), `usePaneMessageJump.ts` (the list, the history request, the continuation), the cases in `paneKeys.ts` and `paneActions.ts`.
- Upstream edit: set `r5-message-jump`, 3 hunks in `ChatView.tsx`: the import, one call of `usePaneMessageJump` with 5 stock locals and `!embedded && !backgroundThread`, and the `onViewportAttach` prop of the timeline. The hook returns the stock `attachTimelineViewport` with one more listener, because the stock hook keeps the viewport to itself and the jump needs its `navigate`.
- Checks: `paneMessageJump.test.ts` (both decisions as tables), `paneKeys.test.ts` (the keys, one pane, terminal focus, a pane with no chat). No browser test: the fake test environment has no history pages.
- Rebase check: the timeline list must still be a LegendList whose `getState().data` is the row list of `MessagesTimeline.tsx`, with `positionAtIndex`, `startBuffered` and `elementAtIndex`. A user message row is `kind: "message"` with `message.role === "user"`. `readListScroll` copies the scroll measure of `refreshMinimap` in `MessagesTimeline.tsx`. `TIMELINE_MINIMAP_TARGET_OFFSET` must still be exported from `MessagesTimeline.logic.ts`. `TimelineViewport` must still have `navigate` and `subscribe`, and `MessagesTimelineHistoryControls` must still have `hasMoreHistory`, `loading`, `error` and `onLoadEarlier`.
- Not verified: the packaged Electron app, macOS, a real provider, a thread with long turns (tool rows, diffs, images), a page of older turns with no user message, a load that fails, and a press while a turn streams.
- Checked on 2026-11-19 in a dev stack with an isolated home, in headless Chromium on Linux (`ctrl+pageup`), on a Replay thread with 35 user turns after a page load:
  - 32 presses of the key went from the end of the chat to the first message of the thread. Each press put the next older message on the target line. No message was skipped and none repeated.
  - Press 7 reached the oldest loaded message. Press 8 loaded older turns: the list grew from 1856 px to 5136 px, and the same press ended on the next older message.
  - One more press at the first message did nothing. Four presses of `ctrl+pagedown` went to the next four messages, and later presses ended at the end of the chat.
  - The key worked with the caret in the composer. With two panes, a press in a new empty pane did not scroll the other pane, and a press in the first pane scrolled it.

Stock keys that moved:

| Stock command        | Stock key     | Key in the fork                                 |
| -------------------- | ------------- | ----------------------------------------------- |
| `diff.toggle`        | `mod+d`       | `mod+alt+g`                                     |
| `composer.dictation` | `mod+shift+d` | `mod+shift+u`                                   |
| `rightPanel.new`     | `mod+t`       | `mod+alt+t`                                     |
| `thread.jump.N`      | `mod+N`       | Stock key with 1 tab. `mod+alt+N` always works. |

One stock key shares its chord with a fork key and did not move: `preview.focusUrl` on `mod+l`. It runs while focus is in a browser preview, and `layout.focusInput` runs in every other place (see "Focus the input").

How a key resolves:

- `apps/web/src/panes/paneKeys.ts` reads only the `layout.*` rules of the merged keybinding list that own their chord (`livePaneRules`). It then applies the condition of each command. It does not depend on where the pane defaults are among the stock defaults.
- The pane keys run in a capture scope of the stock key dispatcher, before the stock handlers. `mod+w` runs in a bubble scope, after them. Order for `mod+w`: a focused terminal, then the open right-panel surface of the focused pane, then the pane.
- `paneMultiPane` and `paneMultiTab` are fork-only `when` identifiers. Stock handlers do not supply them, so a rule that carries one is false there.
- `withPaneKeybindings` (set G) removes a stock rule that shares a chord and a condition with a pane rule. It also adds the `mod+alt+N` thread jumps on the client. Those jumps do not show in Settings > Keybindings.
- The bundled server writes every default to `keybindings.json`, the three dead stock chords included (`diff.toggle` on `mod+d`, `composer.dictation` on `mod+shift+d`, `rightPanel.new` on `mod+t`). Settings > Keybindings removes the dead rules from its list (set M, `withoutDeadPaneChords`), so it lists one working key for each moved command and shows no conflict for the pane keys. The file still holds the dead rules.
- A later rule wins a chord, as in stock: a rule that the user added after the pane rule, for another command on the same chord and condition (or with no condition), takes the chord. The pane key then does nothing on that chord, and Settings lists both rules.
- Limit: a rule that is equal to a stock default does not take a pane chord, whatever its place in the list. A stock server and an older `keybindings.json` list the stock defaults after the pane defaults, so the place cannot tell a user's choice from an old file. To put `diff.toggle` back on `mod+d`, move `layout.splitRight` off that chord first. Without that, Settings saves the rule and does not list it.
- Limit: a user rule with a narrower condition than the pane rule (for example `mod+t` with `rightPanelOpen`) does not take the chord.
- Settings saves a key to every connected environment in its scope. A stock server rejects a `layout.*` command, so set M sends a pane key only to an environment whose server lists a pane rule (`paneKeybindingTargets`). With only stock servers in scope, the change is sent nowhere and Settings shows no error.
- With a stock server as the keybinding source (browser use against a remote server), the fork defaults work, and a `layout.*` rule cannot be saved.

## Small panes

Limits, in `apps/web/src/panes/paneTree.ts`:

| Limit               | Value  | Reason                                                                                                                                                                                             |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panes for each tab  | 12     | A focus move commits a render of two chat views. The chat view function of each other pane still runs, and no task was over 30 ms in a production build (see "Render cost")                        |
| Minimum pane width  | 200 px | The header still shows the project mark, the start of the title and two controls. The composer shows the model, the microphone and send. Below 280 px the model button shows no effort word        |
| Minimum pane height | 140 px | The small header (40 px), the one-line composer (67 px), the strip under it (26 px) and the gap under the strip (4 px) take 137 px in Normal density, 127 px in Compact and 119 px in Very compact |

A split is refused when a half would be below a minimum. The toast gives both sizes: "Each half would be 138 px wide. The minimum is 200 px." A divider drag stops at the same minimums.

`PaneCell` measures its box and sets a size class as a data attribute. `apps/web/src/panes/paneSize.ts` holds the limits, and `panes.css` holds the rules. One tab with one pane never has a size class.

| Attribute           | Condition       | Effect                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-pane-narrow`  | width < 720 px  | The pane has no right panel (see below). The header reserves room for two controls                                                                                                                                                                                                          |
| `data-pane-compact` | width < 640 px  | The stock phone gutters, and the stock phone size of the new-thread headline                                                                                                                                                                                                                |
| `data-pane-short`   | height < 320 px | The header is 40 px high. The composer starts at one line, with small paddings, and the strip under it sits 2 px below it. The new-thread screen shows the project picker and not the question above it. An open terminal drawer takes the pane below the header (see "Terminal in a pane") |

A pane of 320 px or more keeps the stock header (52 px) and the stock composer (two lines, 140 px).

Each pane is also a CSS size container named `tutor-pane` (`panes.css`), so a rule can read the pane's own width and height. These rules use it, or apply to every pane of a split:

- A prompt of many lines: the stock editor grows to 13rem whatever the height of its window. In a pane it stops where the composer would reach the pane header, and then scrolls inside itself. Measured in a dev stack with a prompt of 12 lines: in a pane of 200 x 140 px the composer is at 43 to 110 px under a header that ends at 40 px, and in a pane of 304 x 216 px at 44 to 186 px. The send button and the strip stay in view. Before, the composer of the 304 x 216 px pane was at 32 to 247 px.
- The new-thread screen: the headline and the composer are one block, centered in the pane. Where the block does not fit, it sits at the bottom, so the composer and the strip show, and the headline with the project picker scrolls into view from above (wheel or touch). The top edge fades. No scroll bar shows. A short pane hides the question ("What should we build") as stock does in a window of 28rem or less, so a pane of 216 px shows the project picker, "or start without a project" and the composer whole.
- The model button of the composer: below 280 px of pane width it shows no effort word ("Medium"), and its content stops at its own edge. Measured with the label "6 Astra Medium" at 200 to 304 px in the three densities: the label ends 13 px or more before the microphone. Before, "Medium" was painted over the microphone below about 240 px.
- The stock launcher of the right panel ("Open a surface") starts its list at the top where the pane is too short for it. Before, the first rows of a pane 216 px high were above the top edge, where no scroll reached them.
- The text of a thread with no message ("Send a message to start the conversation.") stays in its own box, with a 12 px gutter. A pane below 200 px of height does not show it.

Limit: the limit of the editor is the pane height less the header and a fixed size for the rest of the composer (7.125rem, and 4.375rem in a short pane), measured in Normal density with the strip. An attachment row, a pending approval or a banner above the composer adds height that the limit does not know.

### Right panel in a narrow pane

720 px is the sum of two stock minimums in `apps/web/src/hooks/usePreviewPanelInlineSize.ts`: 360 px for the panel and 360 px for the chat column beside it.

- The right-panel toggle is absent from the pane header (hunk C12).
- The chat view reads the panel as closed (hunk C10). The stored panel state of the thread does not change. The panel shows again, as it was, when the pane is 720 px or wider.
- The right-panel keys do nothing (hunks C15, C4, C5): `rightPanel.toggle`, `rightPanel.toggleMaximized`, `diff.toggle`, `preview.toggle`, and the same actions from the desktop menu (on `v0.1.11` that includes the menu action `rightPanel.close`). The key `rightPanel.close` passes on, so `mod+w` closes the pane.
- Stock does not open a panel by itself in a narrow pane (hunk C11).
- A request for a panel surface is refused: a file link, "Changes" in the thread details, the diff of a turn, a link in a terminal. A toast says "This pane is too narrow for the right panel", and the stored panel state does not change, so no panel opens later by itself. `installPaneNarrowPanelGuard` in `apps/web/src/panes/paneNarrowPanel.ts` puts a guard in front of the opening actions of the stock panel store while 2+ panes or 2+ tabs exist. The about 50 call sites read an action from the store at call time, so none needs a hunk. The guard refuses only for a thread that every mounted chat view shows in a narrow pane (`usePaneNarrow` records them, hunk C10).
- `/side` in a narrow pane starts no side chat (hunk C17). The stock message "Side chat not started" gives the reason and the text stays in the composer. Stock starts the side chat thread and its first turn before it opens the tab, so the store guard is too late for it.
- What an agent opens with no user action passes the guard and shows when the pane is wide: `openProactive`, `revealSurface` and an automatic `openDevice`.
- Limit: a link in a terminal still makes its preview tab on the server before the guard refuses the surface.
- Stock has a sheet form of the right panel for a window of 980 px or less (`apps/web/src/components/RightPanelSheet.tsx`). It is a modal dialog in a portal, with a width from the viewport (`w-[min(42vw,28rem)]`). It covers the window, not one pane, so a narrow pane does not use it. A pane of 720 px or more in such a window uses the sheet as stock does.

### Terminal in a pane

Each pane has its own terminal drawer and its own right-panel terminal surfaces, for its own thread. The stock terminal keys act on the focused pane: `terminal.toggle` (`mod+j`), and with terminal focus `terminal.split` (`mod+d`), `terminal.splitVertical`, `terminal.new` and `terminal.close` (`mod+w`). No hunk was added for the terminal. The rules are in `panes.css`, `paneFocusMemory.ts` and `paneTerminalReveal.ts`.

Three causes made the terminal fail in a pane. Each was reproduced in a dev stack on 2026-11-17:

1. A pane narrower than 720 px showed the right panel in the place of the chat column. The drawer is a child of the chat column, so it had no width while its toggle showed as on. This was the user's report. The rule for a narrow pane (hunk C10) fixed it: the pane has no right panel, so the chat column and the drawer keep the width of the pane.
2. Stock gives the drawer the height that the header and the composer leave (`resolveTerminalDrawerMaxHeight` in `apps/web/src/components/ThreadTerminalDrawer.tsx`). In a pane of 140 px that is 5 px. A short pane (below 320 px) now shows one thing at a time: an open drawer takes the pane below the header, and the drawer toggle or `mod+j` brings the chat back. A pane of 140 px gives a drawer of 100 px, which is 5 rows of text.
3. A maximized right panel gives the chat column no width, in stock too. The drawer then opened where it did not show. With 2+ panes or 2+ tabs, a drawer that opens restores the maximized panel of its thread to its place beside the chat column (`installPaneTerminalReveal`). One tab with one pane keeps the stock behavior.

Details:

- Height: a pane of 320 px or more keeps the stock layout (header, composer, drawer). Measured before the strip and the density came in: the drawer is 128 px high (6 rows) in a pane of 320 px, and reaches the stock minimum of 180 px (9 rows) in a pane of 372 px. A pane of 319 px is short, so its drawer is 279 px high (15 rows). With the strip of a started thread, the drawer of a 320 px pane is 96 px high in Normal density, 127 px in Compact (the default for a split) and 147 px in Very compact. In a 372 px pane it is 148 px, 179 px and 199 px.
- In a short pane the drawer's drag handle is not shown, because the drawer has the height of the pane. The stored drawer height does not change.
- The timeline and the composer under the drawer of a short pane take no focus (`visibility: hidden`). Without that, stock would send typed text to a composer that does not show. The keyboard goes to the terminal: after a focus key into the pane, and after a press on the pane that leaves focus on the body, such as a press on its header (`coveringTerminalInput` in `paneFocusMemory.ts`).
- Width: the stock list of a drawer with two or more terminals is 9rem wide. In a drawer narrower than 400 px the list is 5.5rem wide. Measured in a pane of 200 px: one terminal has 24 columns. Two terminals side by side have 5 columns each (2 columns each with the stock list).
- A pane mounts a hidden drawer only for a thread that it showed before (stock `reconcileMountedTerminalThreadIds`). Four panes with four open drawers mount four drawers.

### Render cost

Measured on 2026-11-17 with a scratch copy of the "renders" harness (`apps/web/test/renderCounter.ts`): the React development build, headless Chromium, a viewport of 1728 x 1000, 12 panes on 12 threads of 20 turns each. The Mac ran other jobs at the same time, so each time is a range. A production build was not measured.

| Action                | Panes | State         | Chat view renders | Component renders | React render time |
| --------------------- | ----- | ------------- | ----------------- | ----------------- | ----------------- |
| Type one character    | 1     | before, after | 0                 | 20                | 3 to 5 ms         |
| Type one character    | 12    | before, after | 0                 | 31                | 3 to 9 ms         |
| Focus move by key     | 4     | before        | 8                 | 433               | 39 to 58 ms       |
| Focus move by key     | 12    | before        | 24                | 945               | 94 to 116 ms      |
| Focus move by key     | 4     | after         | 2                 | 273               | 27 to 28 ms       |
| Focus move by key     | 12    | after         | 2                 | 361               | 17 to 40 ms       |
| Focus move by a click | 12    | before        | 24                | 889               | 86 to 92 ms       |
| Focus move by a click | 12    | after         | 2                 | 308               | 15 to 38 ms       |

- Typing did not need a change. Each typed character renders the `ChatComposer` of every pane one time (a stock subscription), and no chat view.
- A focus move is a URL change. Before, it rendered every chat view of the tab two times, for two stock reasons. Both are fixed for panes:
  1. Stock turns panel animations off for two frames after each URL change, through a React context that every chat view reads (`usePanelNavigationSuppression` in `apps/web/src/panelAnimations.ts`, provided by `AppSidebarLayout.tsx`). `PaneCell` now provides that context for its pane, and the value follows the pane's own thread. No upstream edit.
  2. The chat view reads the window location for citation links. Hunk C16 gives it the `useLocation` of `apps/web/src/panes/paneNavigation.tsx`. A pane without focus reads a fixed location there.
- After the change, React commits a render of the two chat views whose focus changed, and of no other pane. `apps/web/test/panes.renders.tsx` asserts both counts. Its counter counts a component that did work.
- Not fixed: the chat view function of every pane still runs two times for each focus move, finds no change and stops. A review measured it on 2026-11-18 with function coverage in a dev stack: 48 calls with 12 panes and 8 with 2 panes (StrictMode doubles each call). Cause: the outer `PanelAnimationSuppressionProvider` of `AppSidebarLayout.tsx` changes its value two times for each URL change, and React runs each reader of that context, also below the provider of `PaneCell` whose value did not change. Cost of a focus move with 12 panes against 2 panes: 222 ms against 83 ms in the development build, and 53 ms against 32 ms in a production build, where no task was over 30 ms. The fix is a hunk in `AppSidebarLayout.tsx` that gives `usePanelNavigationSuppression` a key that a pane focus move does not change. That file also writes `data-panel-animations`, which the stock transitions of every pane read, so the hunk was left for a round that can check those transitions.
- The task of the key itself, with 12 panes, was 60 to 83 ms before. After, it was 52 to 75 ms in the two quietest runs and up to 137 ms in a run under load. With 4 panes it was 46 to 49 ms after. Most of it is the route change of the two panes, which stock also pays for a thread switch.
- Each press or release of a modifier key renders `ComposerPrimaryActions` of every pane one time (stock `useShortcutModifierState`). The cost is small and was left as it is.

## Chat density

Settings > Appearance has two rows after "Chat width". Each row has the values Normal, Compact and Very compact.

| Setting            | Used when                                              | Default                 |
| ------------------ | ------------------------------------------------------ | ----------------------- |
| Chat density       | The active tab shows one pane                          | Normal (the stock look) |
| Split pane density | The active tab shows two or more panes, for every pane | Compact                 |

Upstream edits (hunk set `r2-density-settings`, 4 hunks in 2 files):

| Hunk                                             | File                                                           | Purpose                                           |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------- |
| `r2-density-settings-1`, `r2-density-settings-2` | `apps/web/src/components/settings/AppearanceSettingsPanel.tsx` | The import and the two rows after "Chat width"    |
| `r2-density-settings-3`, `r2-density-settings-4` | `apps/web/src/components/settings/settingsSearch.ts`           | The import and the spread of the two search items |

The two search items ("Chat density", "Split pane density") are in the fork-owned `apps/web/src/panes/paneSettingsSearch.ts`.

How the density resolves:

- `PaneHost` writes `data-chat-density` on the pane host root (`[data-splitpane-root]`). The value is `resolveChatDensity(settings, pane count of the active tab)` in `apps/web/src/panes/paneDensity.ts`.
- The first split changes one attribute, so every pane becomes Compact with no remount. The return to one pane restores the single-pane density.
- Tabs do not count. Two tabs of one pane each use "Chat density".

Where the two values are saved:

- Key `t3code-fork:density:v1` in the browser storage of the client, the same storage as the pane layout.
- Stock saves "Chat width" in `ClientSettings` (`packages/contracts/src/settings.ts`). A client saves those settings in its own browser storage, or through the desktop bridge. A server never receives them. So both places work when the settings source is a stock server.
- The fork key was chosen because a key in `ClientSettings` needs hunks in the contract schema, in the patch schema and in the stock reset lists of `SettingsPanels.tsx`. The fork key needs no hunk outside the Appearance panel.
- Result: the values belong to one browser profile and one origin. The desktop app keeps them in its Electron profile. The "Restore defaults" action of the settings page does not reset them. Each row has its own reset button.

How the styling works (`apps/web/src/panes/paneDensity.css`):

- No rule matches `normal`. Normal is the stock look.
- Compact and Very compact act inside the timeline scroller (`.messages-timeline-scroll`) and the composer overlay (`[data-chat-composer-overlay="true"]`) only. The pane header, the right panel, the terminal drawer, the thread details card and menus in a portal keep the stock sizes.
- The rules replace the Tailwind theme variables that the stock markup reads: `--spacing`, `--text-xs` to `--text-3xl`, `--leading-relaxed`, `--leading-normal`. They also replace `--font-size-prompt`, `--font-size-code` and `--diffs-font-size`.
- Each new value is the stock value times a multiplier. The stock values are multiples of `rem` or the sizes of Settings > Appearance > Typography, so the Interface font size and the prompt and code sizes still scale the text.
- The stock markdown rules of `index.css` and four stock class names hold `rem` literals. `paneDensity.css` repeats those rules with the multipliers.

| Multiplier                              | Compact | Very compact |
| --------------------------------------- | ------- | ------------ |
| Text size                               | 0.93    | 0.86         |
| Tailwind spacing unit (also icon sizes) | 0.875   | 0.75         |
| Gaps between rows and markdown blocks   | 0.5     | 0.35         |
| Line height of prose (stock 1.625)      | 1.45    | 1.38         |

With the default 16 px Interface font size, timeline prose is 14 px in Normal, 13 px in Compact and 12 px in Very compact. No text goes below 0.625rem, the smallest stock text size.

Measured in headless Chromium on the dev stack, with threads of the Replay provider (user messages, reasoning, task and read rows, markdown text, a code block, a table). "More content" is the Normal height of the timeline rows divided by the height in that density.

| Thread and window                                                                              | Compact | Very compact |
| ---------------------------------------------------------------------------------------------- | ------- | ------------ |
| `showcase`, 3 turns with expanded work rows, 1470 px wide                                      | +25.6%  | +47.5%       |
| `command-output`, 2 turns                                                                      | +22.3%  | +44.0%       |
| `todo-list`, 1 turn                                                                            | +22.0%  | +42.2%       |
| Prose test thread of the browser test, 1280 px wide                                            | +27.5%  | +48.8%       |
| The same thread, 420 px wide                                                                   | +32.9%  | +54.6%       |
| The same thread, 300 px wide                                                                   | +30.6%  | +54.2%       |
| Composer height with no strip (stock 132 px)                                                   | 106 px  | 90 px        |
| Visible timeline height in a 607 x 432 px pane, no strip (stock 249 px)                        | 274 px  | 290 px       |
| Visible timeline height in a 380 x 284 px pane, no strip (stock 101 px)                        | 126 px  | 142 px       |
| Composer and strip of a started thread in a pane (Normal 164 px)                               | 134 px  | 114 px       |
| Visible timeline height in a 607 x 432 px pane with the strip (Normal 217 px)                  | 246 px  | 266 px       |
| Visible timeline height in a 380 x 284 px pane, which is short, with the strip (Normal 147 px) | 157 px  | 165 px       |

The three rows with "no strip" were measured on the density branch, where a pane of a started thread had no strip. The last three rows were measured after the merge, on the dev stack, in a 2x2 grid of four started Replay threads in a 1470 x 900 px and a 760 x 620 px window. There a pane keeps the strip (see "Bottom bar in panes"), which takes 32 px, 28 px or 24 px of the height.

The prose test thread has three turns with long paragraphs, a list, a code block, a table and tool rows (`denseThread` in `apps/web/src/panes/paneDensity.browser.test.tsx`). A narrow pane gains more, because smaller text also needs fewer lines.

Normal against stock: with the density sheet disabled and the attribute removed, 740 elements of the pane host had equal boxes and equal sizing styles, and the two screenshots were equal byte for byte. The browser test repeats the box and style comparison.

Rebase checks for density (drift that causes no git conflict):

1. `grep -n "0.65rem\|1.25rem 0 0.5rem\|0.8rem 0.9rem\|0.45rem 0.75rem" apps/web/src/index.css`. `paneDensity.css` repeats the block margins, heading sizes, `pre` padding and table cell padding of `.chat-markdown`. A changed stock value needs the same change there.
2. `paneDensity.css` selects stock markup by class: the row gap `[data-timeline-row-kind].pb-4` and `.pb-2` (`MessagesTimeline.tsx`), the work row icon `align-[calc(0.5cap_-_0.75rem)]` (`chat/WorkLog.tsx`), `text-2xs` (an inline theme size), and the spacer under the composer (`ChatView.tsx`, the last child of the composer stack, `1rem` and `1.25rem`). The short-pane rule of `panes.css` for the same spacer adds `[aria-hidden]` to its selector, so it is more specific than the density rule and wins whatever the order of the two style sheets.
3. `grep -n "@theme inline" -A 12 apps/web/src/index.css`. A new inline text size holds a literal in its utility, as `text-2xs` does, and needs a rule.
4. The Appearance hunks anchor on `<ThreadDetailsItemsRow />`, on the search terms of "Chat width" and on the last import of `settingsSearch.ts`. The two hunks of set `r3-settings` anchor on the import of `TypographySection` and on `<TypographySection />` after the end of the "Interface" section.

Limits and items not verified:

1. The send button eases its size for 150 ms after a density change. The stock button has `transition: all`.
2. A list, a quote or a heading typed in the composer keeps the stock `rem` margins. Only the timeline repeats the markdown rules.
3. Arbitrary pixel values in stock class names do not scale. Three `text-[13px]` uses exist in the chat components.
4. A pane of the minimum height (140 px) shows the header, the one-line composer and the strip in each density, and no timeline row. The one-line composer is the short-pane rule of `panes.css` (see "Small panes"). The sizes of that rule are `rem` literals, so the density does not shrink them a second time. The stock parts of the composer still take the density.
5. Not run in the packaged Electron app or with a touch pointer. The light theme was looked at in one screenshot of a split in Compact. One streaming turn was run in Very compact, in a thread shorter than the pane. A streaming turn in a thread longer than the pane was not run.
6. The math, mermaid, diff and MCP app blocks of a timeline were not looked at in the two compact densities.

## Settle on merge and preview links

Round 3 requests R1 and R2. The code is in `apps/web/src/panes/`: `paneSettleWatch.ts`, `PaneSettleRelease.tsx`, `paneThreadPullRequest.ts`, `threadPreviewUrl.ts`, `ThreadPreviewLink.tsx`, `paneThreadStore.ts`, `paneArmedThreadStore.ts`, `PaneThreadSettings.tsx` and `paneThreadSettingsSearch.ts`. The test helper is `apps/web/test/paneThreadShell.ts`.

### What stock v0.1.10 already does

The fork adds no settle rule and no cleanup switch, because stock has both on the server:

- Settle on merge: `apps/server/src/orchestration-v2/ThreadSettlementService.ts` settles a thread when its pull request merges. The setting is `sidebarAutoSettleOnMerge`, a server setting with the default `true`, at Settings > Threads > Auto-settle > "Auto-settle merged threads". A project can override it, and a thread can opt out (thread menu).
- The server does not settle a thread that is pinned, that runs, that waits for an approval or an answer, that the user kept active, or that got a user message after the merge. A closed pull request settles the thread whatever the setting says.
- The server learns of a merge from its own merge action, from the pull request sync, and from a sweep each minute that reads the pull request of each thread branch with the host CLI.
- Cleanup after a settle: a project action with "Run in the thread's worktree when the thread settles" (`runOnSettle`, Settings > Projects > Actions, or `t3.json`). The server runs it one time for each settle, in a terminal of the thread, with the worktree as the working directory. It skips a thread with no worktree of its own.
- Pull request data of a thread: `pullRequests` (links with state, head branch and base branch), `branchPullRequest` and `linkedPullRequest` on the thread shell. A pull request that an agent opens from a shell is linked by the server. `resolveThreadCurrentPullRequestLink` gives the top open layer of a stack.
- Opening a URL: `readLocalApi().shell.openExternal` opens the default browser in the desktop app and a new tab in a browser.

Read on 2026-11-18 over ssh, with no write: the box `dale-nix` runs `t3 v0.1.10`, and its `settings.json` has no `sidebarAutoSettleOnMerge` entry, so the default `true` applies there.

### What the fork adds

| Setting                                              | Default | Where                          | Storage                                               |
| ---------------------------------------------------- | ------- | ------------------------------ | ----------------------------------------------------- |
| Free a pane when its thread settles                  | On      | Settings > Appearance > Tutor3 | `releasePaneOnMergeSettle` in `t3code-fork:thread:v1` |
| Preview links (one URL template for each repository) | Empty   | Settings > Appearance > Tutor3 | `previewUrlTemplates` in `t3code-fork:thread:v1`      |

See "Fork settings" for the storage rules. The armed threads are state and not a setting, and have their own key, `t3code-fork:armed-threads:v1`. The stock switch that settles a thread stays where it is: Settings > Threads > Auto-settle > "Auto-settle merged threads". The "Preview links" row has one row under it for each repository of the settings scope.

Free a pane when its thread settles:

- It applies with 2+ panes or 2+ tabs. One tab with one pane keeps a settled thread open, as stock does.
- `PaneSettleRelease` (mounted by `PaneHost`) watches each server thread of the layout, also in the tabs that are not mounted.
- A thread is armed when a pane shows it while it is not settled. When an armed thread is settled and its pull request is merged, each pane that shows it takes its own new draft thread (`replacePaneThread`, the existing rule for a thread that went away). The draft is in the project of that thread.
- A thread that the user opens when it is already settled is not armed. Its pane keeps it.
- A settle with no merged pull request (a manual settle, a settle for inactivity, a closed pull request) keeps the pane. If the merge is seen later, the pane becomes free then.
- A pane that had focus at the instant its thread settled has the focus again when its draft is ready. This matters for a settle by hand of the focused pane's thread: the stock settle action moves the route to the next thread, and that thread can be in another pane. `PaneSettleRelease` reads the focused pane in a listener on the thread shell, which runs before the stock action goes on, and `replacePaneThread` focuses the pane after the fill (`keepFocus`).
- A thread with unsent text in its composer keeps its panes.
- The armed marks are saved, so a merge that happens while the app is closed frees the pane at the next start.
- With the setting off, no thread is watched and the armed marks are removed.

Preview link:

- A thread shows the link when its repository has a URL template and the thread has a pull request with a head branch. `{slug}` in the template is the branch slug. For the Tutor codebase: `https://{slug}.preview.tutorintelligence.com`.
- The template belongs to a repository (`repositoryIdentity.canonicalKey` of the project), so it applies to that repository on each environment. A project with no repository identity has no row and no link.
- Places: a button in the chat header, before the stock header controls, and a row under the pull request row of the stock thread details.
- The slug rule is the rule of `~/.claude/bin/pr-url.sh` (`previewBranchSlug`): lowercase, each run of characters outside `[a-z0-9]` is one dash, no dash at either end, then the first 50 characters. `threadPreviewUrl.test.ts` holds 15 branches with the output of the script's own slug line.
- The branch is the head branch of the pull request that stock shows for the thread. For a stack that is the top open layer.
- With no template, the link components read no pull request and render nothing.

Upstream edits (hunk set `r3-thread`, 4 hunks in 2 files):

| Hunk                         | File                                                   | Purpose                                                   |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `r3-thread-1`, `r3-thread-2` | `apps/web/src/components/chat/ChatHeader.tsx`          | The import and the preview button of the chat header      |
| `r3-thread-3`, `r3-thread-4` | `apps/web/src/components/chat/ThreadDetailsPrRows.tsx` | The import and the preview row under the pull request row |

`PaneHost.tsx`, a fork file, mounts `PaneSettleRelease`. The two settings rows are in `apps/web/src/panes/PaneThreadSettings.tsx`.

Not built, and why:

- A second switch that runs `wrap.sh` after a settle. The stock action above is the mechanism, and it is not safe for this command: it runs inside the worktree that `wrap.sh` removes, in a terminal of the thread, and the user's `/t3-wrap` skill says to run `wrap.sh` from another thread for that reason. It also runs on each settle, not only after a merge. A safe version needs a server that runs a command outside the worktree after a merge, which is a server fork.
- The share token of the preview alias. `pr-url.sh` reads `?_vercel_share=<secret>` from a pull request comment with `gh`. The fork link has no token, so the browser needs a Vercel login.
- The `--prod` alias (`<slug>--prod`). A second template placeholder would be necessary.

Limits and items not verified:

1. Stack top: the fork reads the pull requests that are linked to the thread. `pr-url.sh` reads every open pull request of the repository. A layer that another thread stacked on the branch is not seen, unless the server linked it as a member of a native stack.
2. A user who settles the thread of the focused pane by hand, when its pull request is merged. Stock moves the route to the next thread of the sidebar. Two cases:
   - The next thread is in another pane. Stock focuses that pane, and this rule then frees the pane of the settled thread. The freed pane has the focus again with its new draft. A review saw the focus stay on the other pane before this was fixed. The browser test holds the draft back until the stock move ended, and fails without the fix.
   - The next thread is in no pane. Then the pane shows that thread (the stock result) or its new draft (this rule). Which one depends on the order of two async steps, the stock navigation and the fill of the pane. This case was not made one rule.
3. A thread with only `branchPullRequest` (no link) gets its state from the stock summary query. How soon that query shows a merge was not measured.
4. Not run against a real server, a real pull request or a real merge. The browser tests send the thread shells that a server sends. The packaged Electron app was not run, so the default-browser path of `openExternal` was not run for this link.
5. The preview button is 24 px wide and takes that width and one gap from the thread title. In a pane 210 px wide, in headless Chromium, the title then showed one letter.
6. The mobile app and the command palette have no preview link.

Checks:

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/threadPreviewUrl.test.ts \
  src/panes/paneThreadStore.test.ts src/panes/paneSettleWatch.test.ts)
(cd apps/web && pnpm exec vp test run --project browser \
  src/panes/paneThreadPreview.browser.test.tsx src/panes/paneSettleRelease.browser.test.tsx)
```

Rebase checks (drift that causes no git conflict):

1. `useLinkedThreadPullRequest` in `apps/web/src/components/ThreadStatusIndicators.tsx` must still return the current pull request with `state` and `headRef`.
2. The thread shell must still have `settledOverride`, with the value `settled` for a settled thread.
3. `ThreadDetailsControl` with `part="row"` is the row of the stock thread details. The preview row uses it.
4. Compare the slug line of `~/.claude/bin/pr-url.sh` with `previewBranchSlug`.

Packaged-app check, by hand: give the Tutor codebase its template in Settings > Appearance > Tutor3. Open a thread with a pull request: the header shows the preview button, and a click opens the default browser. Make a 2x2 grid, merge the pull request of one pane, and wait for the settle: that pane shows the new-thread screen, and the thread is in the Settled list.

## Environment resources and account quota

Round 3 requests R5 and R3. Three switches of the "Tutor3" section in Settings > Appearance (see "Fork settings").

| Setting                                              | Default | Key in fork storage        | Effect when off                                         |
| ---------------------------------------------------- | ------- | -------------------------- | ------------------------------------------------------- |
| Show environment resources                           | On      | `showEnvironmentResources` | The sidebar footer is the stock footer. No request runs |
| Show account quota                                   | On      | `showAccountQuota`         | The model picker is the stock picker                    |
| New threads use the account with the most quota left | On      | `newThreadsUseMostQuota`   | A new thread gets the model that stock gives it         |

The three values are in the key `t3code-fork:readouts:v1` (`apps/web/src/panes/readoutSettings.ts`). The rows are in `apps/web/src/panes/ReadoutSettingsRows.tsx`.

### What the stock server sends

Checked in the contracts, and in a dev stack of this checkout on 2026-11-18. The server code of this checkout is the stock `v0.1.10` code.

| Number                            | Stock request or field                                                                           | Reaches the client |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| Free memory, total memory         | `server.getHostResources`: `availableMemoryBytes`, `totalMemoryBytes` (also `cpuUtilization`)    | Yes                |
| Free disk space                   | None. `statfs` runs only inside the server, for the database repair and the service backup       | No                 |
| Claude 5-hour and 7-day windows   | `ServerProvider.usageLimits.windows` with the ids `five_hour` and `seven_day`, for each instance | Yes                |
| Claude weekly window of one model | The same list, id `seven_day_<model>`, label `Weekly · <Model>` (seen: `seven_day_fable`)        | Yes                |

- `server.getHostResources` needs only the orchestration read scope, which every paired client has. Stock uses the answer to pick a machine for a new thread and shows it nowhere. Settings > Diagnostics shows process telemetry, not this sample.
- The stock server reads the limits of each Claude instance with the `get_usage` control request of the Claude Agent SDK. It starts the binary of that instance, so a launcher that sets `CLAUDE_CONFIG_DIR` gives the limits of its own account, on the machine that holds the login. A reading is at most 5 minutes old, and a running turn updates it. This is the data that `~/.claude/bin/usage_page.py` reads from the usage endpoint. No server fork is necessary.
- The server sends a window only when the account reports a number for it. The dev stack sent `seven_day` and `seven_day_fable` and no `five_hour` for an account with no 5-hour window in use.
- Stock already shows the limits of each account: Usage > Limits, and the `/usage-limits` command in the composer. Stock also has a fallback model for new threads (Settings > Threads, "Fallback model"), used when a window of the default model is at 100%.

### Environment resources (R5)

The sidebar footer has one line for each connected environment, above the stock buttons: `dale-nix · RAM 12 / 64 GB`. The desktop app adds the disk of its own machine: `Laptop · 41 GB free · RAM 12 / 36 GB`. The first memory number is the free memory. The environment of the focused thread is the first line. The tooltip gives each number as a sentence.

- A number is amber below 10% free disk space or 10% free memory (`LOW_FREE_DISK_SHARE`, `LOW_FREE_MEMORY_SHARE` in `apps/web/src/panes/environmentResources.ts`).
- Each environment is asked every 30 seconds while the window shows (`ENVIRONMENT_RESOURCES_REFRESH_MS`), and one time when a hidden window shows again. A read makes the stock server sample its CPU for 200 ms. Stock asks only while a draft waits for a machine.
- The readout has its own query on the stock request (`environmentResourcesQuery` in `apps/web/src/panes/environmentResourcesQuery.ts`). It must not read the stock atom `serverEnvironment.hostResources`. Stock load balancing ("Auto balance", `useLoadBalancedEnvironment`) gets a fresh sample from the mount of that atom, and accepts no sample older than 15 seconds. A review found that the readout held the stock atom mounted, so a new automatic draft got a sample of 0 to 30 seconds and, for a part of each cycle, no machine. The browser test mounts the stock hook 20 seconds after the readout's read and fails with the old code.
- Disk space: a stock server sends none, so a remote environment such as `dale-nix` shows memory only. The fork cannot change that without a server fork. The desktop app reads the volume of its home directory in the Electron main process (`apps/desktop/src/ipc/methods/forkHostDisk.ts`, bridge method `getHostDiskSpace`) and shows it for the primary environment and for the service that shares the app's T3 home. A browser shows no disk number.
- The readout has a header, "Machines", that closes and opens it (Dale, 2026-11-20: "make that collapsible"). A closed readout mounts no line, so no request goes to an environment. The state is in the key `t3code-fork:resources-collapsed:v1` (`apps/web/src/panes/environmentResourcesCollapse.ts`): it is no setting, so it has a key of its own.
- Not built: a `df` through the stock terminal requests would give the disk of a remote environment. It opens a shell on that machine for each read, and its output goes through the user's shell profile.

### Account quota (R3)

Under the model list of the picker, each enabled Claude account has one line: its name, then the share that is left of each window, such as `5h 62%  7d 40%  Fable 9%` (`apps/web/src/panes/AccountQuotaList.tsx`). A number at 10% or below is amber (`LOW_QUOTA_PERCENT`). The account of the thread is bold. With two or more accounts, the account that a new thread on the current model would start on has the mark "most left". An account with no reading shows "not reported". Its tooltip gives the reason: the message of the server for an account that is not installed, not signed in or not available, else "The server of this environment reports no quota". An account whose reading has no quota window shows "no usage reported": the stock server sends a window only for a number that the account reports. Seen in a dev stack on 2026-11-18: a second Claude instance with a binary path that does not exist showed "not reported" with the server's message "Claude Agent CLI (`claude`) was not found on PATH."

"New threads use the account with the most quota left":

- The two stock flows that give a draft its first model ask `pickNewThreadAccount` (`apps/web/src/panes/newThreadAccount.ts`): a new thread (`createNewThreadHandler`, which the panes also use) and a draft that moves to another project or machine (`seedDraftModelSelection`).
- The model and its options stay. Only the account changes, and only between Claude accounts (`QUOTA_DRIVER`). A selection of another driver stays as it is.
- The quota left of an account is the smallest share left among the windows that limit the model: `five_hour`, `seven_day`, and a model window only for its own model. A window whose reset time has passed counts as full.
- An account is a candidate when stock would accept it as a fallback: enabled, installed, signed in, available, enabled for the project, and it offers the model. An account with no reading is never picked. An account whose reading has no window that limits the model counts as 100% left. On a tie the account that stock chose stays.
- `pickNewThreadAccount(stockSelection, draftId, projectRef)` reads the accounts, the settings and the default model of the project itself, from the same atom as the stock `createNewThreadHandler` (`environmentServerConfigsAtom`). The hunks therefore name the draft and `projectRef` only.
- An environment with fewer than two Claude accounts has no choice to make. The stock selection stays, and the draft is not read.
- The pick is a seed, as the stock default is. The user can change the account in the thread, and a draft with a model that the user picked is not changed.
- Stock moves a default model that is out of usage to its fallback model. With the setting on, a Claude account that still has quota for the default model comes before that fallback.
- The share is a percentage of the plan of each account. A Max 20x account with 30% left has more quota than a Max 5x account with 40% left, and the pick takes the 40% account. The server sends no plan size that the fork can trust.

### Upstream edits

| Set                        | File                                                  | Hunks | Purpose                                                                                           |
| -------------------------- | ----------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| `r3-environment-resources` | `apps/web/src/components/sidebar/SidebarChrome.tsx`   | 2     | The fork footer (`ForkSidebarFooter`) in the sidebar footer: the arcade and the resources readout |
| `r3-environment-resources` | `packages/contracts/src/ipc.ts`                       | 1     | `getHostDiskSpace` on the desktop bridge type, optional                                           |
| `r3-environment-resources` | `apps/desktop/src/preload.ts`                         | 2     | The bridge method                                                                                 |
| `r3-environment-resources` | `apps/desktop/src/ipc/DesktopIpcHandlers.ts`          | 2     | The handler of the main process                                                                   |
| `r3-account-quota`         | `apps/web/src/components/chat/ModelPickerContent.tsx` | 2     | The quota list under the model list                                                               |
| `r3-account-quota`         | `apps/web/src/hooks/useHandleNewThread.ts`            | 3     | A new thread asks the fork for its account                                                        |
| `r3-account-quota`         | `apps/web/src/lib/seedDraftModelSelection.ts`         | 2     | A draft that moves to another project or machine asks the same                                    |

14 hunks in 7 upstream files. No file of `apps/server` changed.

Fork-owned files outside `apps/web/src/panes/`: `apps/desktop/src/ipc/forkChannels.ts`, `apps/desktop/src/ipc/methods/forkHostDisk.ts` and its test. The path list of rebase step 0 names them. The three search items are in `apps/web/src/panes/readoutSettingsSearch.ts`, and `paneSettingsSearch.ts` spreads them.

Checks:

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/environmentResources.test.ts \
  src/panes/readoutSettings.test.ts src/panes/accountQuota.test.ts src/panes/newThreadAccount.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/environmentResources.browser.test.tsx \
  src/panes/accountQuota.browser.test.tsx)
(cd apps/desktop && pnpm exec vp test run src/ipc/methods/forkHostDisk.test.ts)
```

Rebase checks (drift that causes no git conflict):

1. `apps/server/src/provider/claudeUsageLimits.ts` must still name the windows `five_hour`, `seven_day` and `seven_day_<model>`, with the label `Weekly · <Model>`, and `windowLimitsModel` must still match a model window by its token. `apps/web/src/panes/accountQuota.ts` repeats those rules.
2. `createNewThreadHandler` and `seedDraftModelSelection` must still apply the sticky state to the draft before they ask for the model. `pickNewThreadAccount` reads the draft for the model that stock would show. `createNewThreadHandler` must still take its accounts and settings from `environmentServerConfigsAtom` and its default model from `resolveProjectSettings`: `pickNewThreadAccount` repeats those two reads. The type check does not fail when stock changes them.
3. If upstream adds free disk space to `HostResourcesSnapshot`, read it in `EnvironmentResourcesReadout.tsx` and remove the desktop bridge method.

Not verified:

1. The packaged Electron app. The disk number of the desktop app has a unit test of the byte math and a browser test with a stand-in reader. The bridge method was not run in Electron.
2. An environment with two or more real Claude accounts, and the box `dale-nix`. The dev stack had one Claude account. The quota list and the pick for several accounts ran in the browser tests on fake data only. A real account with no usage in any window was not seen, so the reading with no quota window was not seen from a real server. An account with no 5-hour window in use was seen: it sent the 7-day and the model window only.
3. A real server with a fallback model set, with every Claude account out of usage.
4. Two connected environments in one window. The order of the lines has a unit test.

## CI status in the sidebar

Dale asked for the running CI lane with its time, and for the auto-merge state, in the sidebar (2026-11-19). The switch is "Show CI status in the sidebar", on by default.

What the stock server sends:

- With each thread shell, with no request: the pull request links of the thread. A link has a `snapshot` (`state`, `checksState` as `passing`, `failing` or `pending`, `mergeability`, `reviewDecision`) and, while the server watches the pull request, a `watch` with the names of the failed checks and the head commit.
- `pullRequests.summary` for one pull request: `checksState`, `headSha`, `autoMergeEnabled` and `autoMergeMethod`. The stock sidebar already polls this request every 60 seconds for a thread whose pull request it found by branch (`linkedPullRequestDetailAtom`).
- `pullRequests.checks` for one pull request: each lane with `name` and `status` (`pending`, `action-required`, `success`, `failure`, `skipped`, `neutral`, `cancelled`). The request has a stale time of 45 seconds and no interval. An environment offers it only with the capability `pullRequestChecks`.
- No start time and no duration of a lane. The fork cannot ask the host for it, because only the server holds the host login.

What the fork shows, in the meta line of the row, after the stock pull request badge (`apps/web/src/panes/ThreadCiStatus.tsx`):

- A failed lane: a red mark and its name, with `+N` for more failed lanes. A cancelled lane counts as failed.
- Else a running lane: an amber mark, the name of the lane that runs for the longest time, its time, and `+N` for more running lanes. Example: `build 7m +2`.
- Else a lane that waits for an approval: an amber mark and its name.
- Nothing for lanes that all passed. The stock badge already shows that state.
- "auto" with the merge mark when the host reports auto-merge on.
- The tooltip lists every failed, waiting and running lane with its time, and says if auto-merge is on or off. It says nothing of auto-merge when the host did not report it.
- The row shows this for an open pull request only: the current link of the thread (`resolveThreadCurrentPullRequestLink`, the top open layer of a stack).

The time of a lane:

- It counts from the moment this client first saw the lane as `pending` (`observeRunningLanes` in `ciStatus.ts`). It is not the run time of the lane on the host. A lane that ran for 10 minutes before the app started shows `<1m`.
- The times are in memory. A reload of the app starts each one again. A new head commit also starts each one again, because each lane runs again for it.
- The time is shown in minutes and follows the stock minute tick.

Requests, and how the fork keeps them low:

- One `pullRequests.summary` for each sidebar row with an open pull request, with the stock interval of 60 seconds. It uses the stock atom and the stock input shape, so a row and a stock panel share one cached answer.
- `pullRequests.checks` only while the state is `pending` or `failing`. A pull request whose lanes all passed costs no checks request. While the state is `pending`, the row asks again every 60 seconds (`RUNNING_REFRESH_MS`). A failed state is read once.
- No request with the setting off, for a thread with no open pull request, and for a row that the sidebar does not render.

Code and checks:

- Upstream edit: set `r6-ci-status`, 2 hunks in `SidebarThreadRow.tsx`: the import, and `<ThreadCiStatus thread={thread} />` after `{prBadge}` in the meta line.
- Checks: `ciStatus.test.ts` (which lane shows, the lane clock, the time format), `threadCiStatus.browser.test.tsx` (three rows with a running, a failed and an auto-merge pull request, no checks request for a passing one, and the switch). The browser test is a file of its own, because the app keeps the thread list that the first test of a file loaded. It mocks `pullRequestChecksSupport.ts`, because the fake environment does not offer the capability.
- Rebase check: the anchor `{terminalStatusIcon}` and `{prBadge}` in the meta line of `SidebarThreadRow.tsx`. `linkedPullRequestDetailAtom` and `pullRequestEnvironment.checks` in `apps/web/src/state/pullRequests.ts` must still take `{ environmentId, input }` with a `PullRequestRef`. The capability gate must match the one in `apps/web/src/components/chat/ThreadDetailsPrRow.tsx`.
- Not verified: a real pull request on GitHub, a real server, the packaged Electron app, a row in the folder layout of the sidebar (it has the same meta line), a stack, and a host other than GitHub. The load on the host API with many open pull requests was not measured.

## Pull request watch

Dale asked for two fixes on 2026-11-19, after a thread on `dale-nix` watched `tutorintelligence/codebase` #41279. The fork has one of them, as a display rule of the client. The other is not possible in a client.

Evidence of that day:

- The CI bot `tutor-ci-reconciler[bot]` rewrote its one status comment about every 2 minutes. The comment was from 2026-11-18T23:15:08Z, and its last edit was at 2026-11-19T16:46:55Z.
- Nobody wrote a new comment on that pull request that day. The thread still woke about every 2 minutes with "new comments".
- After enough comment-only wakes the watch stopped itself, so the edits also used the wake limit.

### In the fork: a watched pull request does not hold its thread

- Setting "Watched pull requests do not hold a thread", on by default, in Settings > Appearance > Tutor3 (`releaseWatchedPullRequests` in `t3code-fork:readouts:v1`).
- Stock: a watch whose checks still run is a background task with the mark `awaited`, and an awaited task holds its thread (`backgroundWorkHoldsCompletion`). The sidebar row then shows "Waiting", and the banner over the composer reads "Waiting · Watching pull request #N".
- With the setting on, the client ignores that mark for a pull request watch. The row shows the status of the last run, and the banner reads "Running · Watching pull request #N". The watch stays on. A command, a monitor or a subagent that the agent waits for still holds the thread.
- This is a display rule of this client only. A stock server still holds the thread: its MCP tools report the thread as waiting, and each server rule that reads the hold keeps the stock result. The watch still wakes the thread on failed checks, passed required checks, new comments, reviews and conflicts, because the server does that.
- How: `packages/shared/src/panePullRequestWatchHold.ts` holds one switch, on by default. `startPullRequestWatchHoldSetting` (`apps/web/src/panes/pullRequestWatchHold.ts`) gives the setting to the switch at the start of the client and at each change. A server never calls the setter, so the bundled server of the desktop app keeps the stock rule.
- A stock server computes the mark too and sends it in each thread shell. The client therefore ignores the mark where it reads it (`awaitedTaskHolds`), and also does not set it where it derives the task from a full thread.
- A change of the setting applies to a thread at its next update from the server, or after a reload of the window. The client keeps derived thread state, and the switch is outside React.
- Upstream edit: set `r7-pr-watch-hold`. 3 hunks in `orchestrationV2PendingBackgroundWork.ts`: the import with the export of the setter, `awaitedTaskHolds(task)` in `backgroundWorkHoldsCompletion`, and the `awaited` mark in `pullRequestWatchTasks`. On `v0.1.11` the stock mark also holds for a merged pull request and for a watch with `until: "merged"`, and hunk 3 puts `!pullRequestWatchHoldsThread() ||` before that whole condition: with the setting on, no watch holds, a merged one included. 2 hunks in `appInit.tsx`: the import, and the call before the stock `startModelPreferencesMigration`.
- Checks: `panePullRequestWatchHold.test.ts` in `packages/shared` (both states, for a task that the client derives and for a task as a stock server sends it, and other awaited work still holds). `pullRequestWatchHold.test.ts` in `apps/web/src/panes` (the setting drives the switch, and the label of the sidebar row in both states). The settings row was seen in a dev stack in headless Chromium.
- Rebase check: the task id prefix `pull-request-watch:` is in the fork file too, and the shared test fails when upstream changes it. `backgroundWorkHoldsCompletion` must stay the one function that decides the hold.
- Not verified: a real watched pull request, a real server, and the packaged app.

### In the fork: earlier update turns fold into one line

Dale reported on 2026-11-19 that the thread still woke about every 2 minutes, and that each wake added a turn such as "CI progress only: 4 of 10 gating lanes have passed. Nothing to act on." The wakes are server behavior (see the next section), so the fork folds their turns in the chat.

- Setting "Fold pull request updates in the chat", on by default, in Settings > Appearance > Tutor3 (`foldPullRequestUpdates` in `t3code-fork:readouts:v1`). It also applies with one tab and one pane. With the setting off, the rows of the timeline are the stock rows.
- An update turn is a turn that starts with the notification of a pull request watch whose outcome is `updated`: the item has `source.kind` `monitor` with a `pullRequest` stamp. The stock server gives the outcome `failed` to a wake with a failed check, a conflict, a rebase or a removal from the merge queue, and `completed` to a wake with passed checks only (`apps/server/src/orchestration-v2/pullRequestWatch.ts`). New comments, and the notice after 10 comment-only wakes, are `updated`.
- An update turn is quiet when each of its rows is one of these: an answer of the agent with no changed file in its diff summary, the stock fold line of its work, viewed images, and visible work that only reads (`reasoning`, `checkpoint`, `command_execution`, `dynamic_tool`, `file_search`, `web_search`) with no failure. Each other row keeps the turn on the screen: a file change, a failed tool, an approval, a question, a secret or link request, a sub-agent, a plan, a sent message, a message of the user, and each row of a turn that still runs.
- A sequence is two or more quiet update turns in a row. Each turn of a sequence folds, but not the newest. A turn of the user, an update turn that is not quiet, and each other notification end a sequence. So the newest update is always on the screen, and an update folds only after the next update turn ended.
- The fold is one line: "3 earlier pull request updates" (or "1 earlier pull request update"). It is the stock fold row (`turn-fold`), so stock renders it, with the time of the first folded update. A click or Enter opens it: the line stays, and the folded turns show under it. A second click closes it.
- The open state is in the stock set of expanded runs, under a key that no run has: `pull-request-updates:<id of the first folded notification row>`. The row id is `turn-fold:<that key>`, because the stock toggle anchors the list on that id. The stock list state remembers the set for each thread, so an open fold stays open after a thread switch.
- A match of the find bar in a folded row opens its fold while the match is active.
- The rule reads the rows of the timeline, after the stock `useStableRows`, and gives rows back (`usePullRequestUpdateFold`). The list, the minimap, the scroll memory and the message-jump keys of the fork read that one array. A turn of the user never folds, so the jump keys and the minimap keep each of their targets. With nothing to fold the hook returns the stock array itself.
- Limits. The rule is structural: it cannot read the text of the agent, so a turn in which the agent ran only commands folds, also when one of the commands changed something outside the worktree (for example a push). Work that stock already collapsed is not read: only the diff summary of the turn shows a changed file. A cited message in a closed fold does not open the fold. After older turns load, the first folded turn can change, and the fold then has a new key and is closed.
- Code: `apps/web/src/panes/pullRequestUpdateFold.ts` (the rule), `apps/web/src/panes/usePullRequestUpdateFold.ts` (the hook).
- Upstream edit: set `r7-pr-watch-fold`, 2 hunks in `MessagesTimeline.tsx`: the import, and `usePullRequestUpdateFold(useStableRows(rawRows, listIdentityKey), visibleExpandedRunIds, activeFindMatch?.entryId ?? null)`.
- Checks: `pullRequestUpdateFold.test.ts` (which turns fold, the newest stays, a turn of the user ends a sequence, each kind of turn that stays, the open state, the line object). `pullRequestUpdateFold.browser.test.tsx` (a thread with four update turns in the fake environment: one line for three of them, a click opens and closes it, and the setting off shows each turn). The stock `MessagesTimeline.browser.test.tsx` passes with the hunk.
- Rebase check: `useStableRows` must still give the rows that the list takes as `data`. The stock row kind `turn-fold` must still have `id`, `createdAt`, `runId`, `label` and `expanded`, `TurnFoldTimelineRow` must still call `onToggleTurnFold(row.runId)`, and `onToggleTurnFold` must still anchor on `turn-fold:<run id>` and toggle the id in `expandedRunIds`. A notification must still be a work row of its own with the turn item in `structuredPayload` (`session-logic.ts`). A new row kind or a new work item type is not quiet until someone adds it to `rowIsQuiet` or `QUIET_WORK_ITEM_TYPES`.
- Not verified: a real watched pull request and a real server. The test builds the notification item by hand, as `Orchestrator.ts` stamps it. The look of the line was not seen in a screenshot or in the packaged app.

### Not in the fork: an edited comment must not wake the thread

- Cause in stock: `apps/server/src/orchestration-v2/pullRequestWatch.ts`, `const activeAt = (remark) => remark.editedAt ?? remark.createdAt;`. An edit after the watch boundary counts as a new comment, wakes the thread, and counts toward the wake limit.
- The server decides each wake. A client cannot stop one. The fork does not edit `apps/server`, and `dale-nix` runs the stock server.
- The fix belongs upstream: only a comment created after the boundary counts as new. Until then the thread wakes on each edit of the bot comment.

## Token use of running work

Dale asked on 2026-11-19 that running work in the chat shows how many tokens it uses, as a stock setting if one exists, else as a fork setting that is on by default. Stock `v0.1.10` has no such setting. The switch is "Show token use of running work", on by default (`showWorkTokens` in `t3code-fork:readouts:v1`). With the switch off the timeline is stock.

What the stock server sends about tokens while work runs:

- `tokenUsage` on a provider turn (`OrchestrationV2ProviderTurn` in `packages/contracts/src/orchestrationV2.ts`): the context size of the latest model request, `usedTokens` = input + output, with `maxTokens`. The Claude adapter sends it while the turn runs, at the start and at the end of each model request of the main agent. The Codex adapter sends it with each `thread/tokenUsage/updated` notice. It is not a sum over the turn.
- `turnTokenUsage` on a provider turn: the billed input and output tokens of the whole provider turn. A server sets it only when the provider turn ends, so a running turn has none.
- `contextUsage` on a provider thread: the context that a handoff carried into a new provider conversation. No adapter updates it while a turn runs.
- A subagent record (`OrchestrationV2Subagent`) has no token field. The exception is a workflow: `workflow.totalTokens` and `totalTokens` of each workflow agent, which the Claude adapter copies from the progress frames of the Workflow tool.
- A subagent that Claude starts with its own Agent tool: no number. The Claude adapter reads token reports of the main agent only, and it drops the `usage` of a task progress frame.
- A subagent that runs as its own thread (a `delegate_task` child, or a Codex subagent): its provider turns carry `tokenUsage`, but in the detail of the child thread only. A thread shell has no token field.
- A background task (a command, a monitor, a pull request watch): no token field.

What the client holds: the detail of the open thread, with every provider turn and its last `tokenUsage`. The detail of a child thread only while something reads it. The stock desktop client reads the detail of every running thread (`RunningThreadKeepAlive`). The stock web client does not.

What the fork shows (`apps/web/src/panes/WorkTokenLabels.tsx`, rules in `workTokens.ts`):

- Beside the stock "Working for ..." label: `· 182k tokens in context`. Since 2026-11-23 the output tokens that the turn reported so far come first when a stock server sent them (`· 12.4k tokens · 182k tokens in context`, section "Live token use"). The context number is the context size of the thread. It is the number of the stock "Context" row of the thread details, from the same two stock functions (`latestProviderTurnTokenUsage`, `deriveLatestContextWindowSnapshot`). It is not the count of tokens that the turn spent, because a stock server sends that count only when the turn ends.
- In the row of a subagent that still works, before its time: `45.2k tokens`. For a subagent with a thread of its own it is the context size of that thread. For a workflow it is the total that the workflow reports.
- On the line of a subagent group, after the status counts: the sum over the members that still work, for example `6 working · 2 done · 310k tokens`. The line shows no sum when a working member has no number, because the sum would then be too low.
- Nothing for work without a number from the server: a command, a monitor, a pull request watch, a subagent of Claude's own Agent tool, a task in a linked environment, and a subagent that ended.
- The short form: `512 tokens`, `12.4k tokens` (one decimal below 100k), `182k tokens`, `1.25m tokens`.

Updates and cost:

- A number changes when the agent reports a model request. It does not change with each word, and it has no timer. The components read the structure atom of a thread (`quietThreadAtom`), which keeps its value while text streams, and select one number, so a row renders again only when its number changes.
- For a working subagent with a child thread, the fork reads the detail of that child thread, because the number is nowhere else. This opens one detail subscription for each such subagent, only while the subagent works, only while a row of the open thread shows it, and only with the switch on. In the desktop app the stock client already holds these subscriptions. In a browser client they are extra.

Code and checks:

- Upstream edit: set `r7-work-tokens`, 6 hunks in 3 files, each an import and one element: `<RunningTurnTokens />` after the label in `TimelineWorkGroupRows.tsx`, `<SubagentWorkTokens />` before the time in `V2LifecycleRow.tsx`, and `<SubagentGroupWorkTokens />` after `{statusSummary}` in `TimelineV2EventRow.tsx`. The calls name stock locals only (`props.parentRef`, `props.subagentId`, `ctx`, `agents`).
- Checks: `workTokens.test.ts` (the number of a thread, which child thread is read, the number of a subagent, the sum of a group, the short form). `workTokens.browser.test.tsx`, with token reports through the fake server: the label in the stock "Working" row, the group sum, the two member rows, no number and no child subscription after a subagent ended, and the switch.
- The Replay provider of the dev stack sends no token report: none of its six recordings has a `usage_update` frame. So no dev stack check was run for this feature.
- Rebase check: the three anchors. `latestProviderTurnTokenUsage` and `deriveLatestContextWindowSnapshot` in `packages/client-runtime/src/state/contextWindow.ts` must keep their arguments. `environmentThreadDetails.quietThreadAtom` must still carry `subagents`, `providerThreads` and `providerTurns`. When upstream adds a token field to the subagent record or to the thread shell, use it and remove the read of the child thread.
- Not verified: a real provider, a real server, the packaged Electron app, a Claude turn with real subagents, a workflow, a Codex subagent, and the number of subscriptions with many subagents in a browser client. The fork-source fallback of the stock "Context" row (a forked thread before its first report) is not used, so such a thread shows no number until its first model request.

## Pull request chip in the bottom bar

Dale asked for the pull request and CI state of the sidebar in split panes, "at the bottom with env and worktree info", and then for a compact chip (2026-11-19). The switch is "Show the pull request in the bottom bar", on by default.

What stock shows: the strip under the composer already has a pull request badge, directly before the branch control (`ThreadPullRequestBadgeControl` in `BranchToolbarBranchSelector.tsx`). It shows the glyph in the color of the state and the number. It shows no CI state and no auto-merge state. With two or more linked pull requests its click opens the list in the right panel, which a pane of less than 720 px does not have.

What the fork shows (`apps/web/src/panes/PullRequestChip.tsx`), as the last item of the strip:

- The stock glyph in the stock color of the state: open, draft, merged or closed. A link with no state yet has the plain glyph in the muted color.
- The number, as `#123`.
- At most one CI mark: a red mark for failed lanes, an amber mark with the time of the lane that runs for the longest time, an amber shield for a lane that waits for an approval. No mark when every lane passed. The chip names no lane.
- The merge glyph when the host reports auto-merge on.
- The tooltip has the detail, one fact in each line: number and title, the state with the state of the checks ("Open, checks failed"), the failed, waiting and running lanes with their times, auto-merge on or off, and "N more linked pull requests".
- The chip takes the place of the stock badge, so the strip names the pull request one time. `pullRequestChip.css` hides the stock badge while a chip is in the strip. A thread with a pull request that stock found by its branch, with no link, has no chip and keeps the stock badge.
- The pull request is the current link of the thread (`resolveThreadCurrentPullRequestLink`), which is the one that the stock thread details show first.
- It shows wherever the strip shows: in each pane, and with one pane when the stock "composer context" setting is on. A draft thread and a thread with no linked pull request have no chip.

Narrow strip: the number and the time are stock strip labels (`ComposerContextLabel`), so they collapse by the stock rule, when the labels of the strip do not fit (`data-compact`). The glyph, the CI mark and the auto-merge mark stay. The chip is a group of the strip, so the stock measure counts its width.

Click: the chip is a link to the pull request. A click runs the stock action of the thread details row (`useOpenPrLink`), which opens the pull request in the right panel or outside the app, as the stock settings say. In a pane that has no right panel (`paneRefusesPanel`) the click does not run that action. It stays a plain link, which a browser opens in a new tab and the desktop app opens in the system browser.

Requests: none of its own. `useOpenPullRequestCi` (`apps/web/src/panes/usePullRequestCi.ts`) holds the requests of the sidebar feature, and the sidebar row and the chip both call it. It uses the stock atoms with the stock input shape, so a row, a chip and a stock panel of one pull request share one cached answer.

- `pullRequests.summary` and `pullRequests.checks` by the rules of the section "CI status in the sidebar": only for an open pull request, the checks only while the state is pending or failing.
- The refresh of the checks while a lane runs is one timer for each pull request, however many rows and chips show it (`createSharedInterval`). Before, each row had its own timer.
- No request with the setting off, for a thread with no open pull request, and for a merged or closed pull request, whose glyph and number come from the thread shell.
- The two settings are separate. Each view makes the requests of its own pull requests when its setting is on.

Code and checks:

- Upstream edit: set `r7-pane-pr-chip`, 2 hunks in `apps/web/src/components/BranchToolbar.tsx`: the import, and `<PullRequestChip environmentId={environmentId} threadId={threadId} />` after `{trailing}` in the strip.
- Checks: `prChipState.test.ts` (what the chip shows for each pull request state and CI state, the tooltip lines), `ciStatus.test.ts` (the time of the running lane, one timer for each pull request), `pullRequestChip.browser.test.tsx` (two panes: the chip with the red mark in the pane of its thread and one link to the pull request in the strip, no chip for a thread with no pull request, the collapse and a plain-link click in a pane of 220 px, and the switch brings the stock badge back). The browser test mocks `pullRequestChecksSupport.ts`, as the sidebar test does.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/prChipState.test.ts src/panes/ciStatus.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/pullRequestChip.browser.test.tsx)
```

Rebase check: the anchor `{trailing}` directly before the end of `ComposerSurface.ContextStrip` in `BranchToolbar.tsx`. `pullRequestChip.css` selects stock markup: the stock badge is the `a` or `button` directly before the `span` that holds the branch control, which is the one `[role="combobox"][aria-haspopup="dialog"]` of the strip. The browser test fails when the strip shows two links to the pull request. The stock measure of the strip (`useLabelsOverflow` in `BranchToolbar.tsx`) must still count each child of the strip as a group and each `[data-composer-label]` as a label.

Not verified: a real pull request, a real server, the packaged Electron app, the click that opens the pull request in the right panel (in the fake environment of the browser test the stock action opens the link outside the app), a stack, a host other than GitHub, and a strip that also names the machine of a remote environment.

## Environment of a new thread

Dale asked on 2026-11-19: "in new thread message [I] should be able to select the env here, and it updates the project based on what env you chose." The switch is "Choose the environment on a new thread", on by default (`draftEnvironmentChoice` in `t3code-fork:readouts:v1`). With the switch off, or with one connected environment, the fork renders nothing and the project picker is the stock picker.

What stock `v0.1.10` already offers for a draft:

- The project picker in the headline of the new thread screen (`DraftHeroHeadline.tsx`). It lists the projects of every environment as groups, with a mark for the environments of each group. A choice moves the draft to that project, and to another environment when the project is only there. An empty draft opens the stock draft of that project (`createNewThreadHandler`). A draft with text keeps its text and moves (`setLogicalProjectDraftThreadId`, then `seedDraftModelSelection`).
- The "Run on" list in the strip under the composer (`BranchToolbarEnvironmentSelector`, key `composer.cycleHost`). It lists only the environments that hold the same project, plus "Add to another machine". For a draft with no project it lists every environment that offers a "No project" workspace. With load balancing on, it also offers "Auto balance".
- No control lists every connected environment and changes the project with the choice. That is the gap.

What the fork adds (`apps/web/src/panes/DraftEnvironmentChoice.tsx`):

- One line under the headline, before "or start without a project": `on <environment>`. It is the stock select with the stock machine icon. It lists each connected environment, and the environment of the draft. The app's own environment is first, then by name, as in the stock "Run on" list.
- A choice moves the draft to that environment. The project is, in this order (`pickEnvironmentTarget` in `draftEnvironment.ts`):
  1. The same project there: first by the grouping of the sidebar, then by repository, so a client that keeps each project apart still gets the same repository. With two clones of the repository there, the clone that was used last.
  2. The project that the user wrote to last there. The time is the last user message of a thread of that project, or the creation time of a thread with no message. It comes from the thread list that the client holds, with no request.
  3. The first project there in the order of the stock project picker (pinned projects first, then the sort order of the sidebar).
- A draft with no project keeps no project: the environment opens its "No project" workspace (stock `openScratchProject`). An environment with no project also gets that workspace. An environment with neither is disabled in the list.
- An archived project is never picked.
- With the control shown, the stock project picker lists the projects of the draft's environment only (`useDraftEnvironmentProjects`). "Add project" stays.
- The control shows only on the new thread screen, so only for a thread that was not sent. `moveDraftToProject` also leaves a draft that was sent.

How the draft moves (`draftEnvironmentMove.ts`). It calls the two stock flows of the project picker and copies none:

- An empty draft: the stock `createNewThreadHandler` opens the draft of the target project. That gives the stock workspace mode, no branch, and the model of a new thread there.
- A draft with text or attachments: `setLogicalProjectDraftThreadId` keeps the text and the attachments, and clears the branch and the worktree, because the project changed. The stock store removes the upload id of a file that the first environment holds (`clearStaleFileUploadMetadata`): a file whose bytes the client still has uploads again at the send, and a file with no bytes in the client must be attached again. `seedDraftModelSelection` then gives the model of a new thread there.
- Both flows ask the fork's account rule `pickNewThreadAccount` (set `r3-account-quota`) for the new environment, so the draft gets the Claude account with the most quota left there. A unit test checks that with two accounts in the new environment.
- The draft gets the stock mark `environmentSelection: "manual"`, as a choice in the stock "Run on" list gives. Without it, the stock "Auto balance" moves the draft to another environment again.
- As in stock, a model that the user picked by hand stays, also when the new environment does not have that account. The stock composer then resolves it as for any thread. The stock project picker has the same rule.
- The stock "Run on" list keeps the selections of a multiple-model draft through a change. The stock project picker does not, and this control does not.

Upstream edit: set `r7-draft-environment`, 3 hunks in `DraftHeroHeadline.tsx`: the import, `useDraftEnvironmentProjects(projectPickerEntries, activeProjectRef)` in front of the stock scratch filter of the picker entries, and `<DraftEnvironmentChoice />` before the line of "or start without a project". The hunks name three stock locals: `draftId`, `activeProjectRef` and `projectPickerEntries`.

Checks:

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/draftEnvironment.test.ts \
  src/panes/draftEnvironmentMove.test.ts src/panes/readoutSettings.test.ts)
(cd apps/web && pnpm exec vp test run --project browser \
  src/components/chat/DraftHeroHeadline.browser.test.tsx --no-file-parallelism)
```

- `draftEnvironment.test.ts`: the project rule (same repository, two clones, last used, first, archived, no project, an empty environment), the list of environments, and the picker filter.
- `draftEnvironmentMove.test.ts`: a draft with text keeps the text, loses the branch, gets the manual mark and the account of the new environment, the account setting off sets no account, an empty draft goes through the stock new-thread flow, and a sent draft stays.
- No browser test of the fork. The fake environment (`apps/web/test/fakeEnvironment.ts`) gives every connection the same environment id, so it cannot be a second environment. The stock browser test of the headline passes with the hunks.

Checked on 2026-11-19 in headless Chromium at 1440 x 900: a dev stack with an isolated home, and a second stock server with its own home, added in Settings > Environments with a pairing code. The first server had the projects `a-shared` and `a-only`, the second `b-first`, `b-shared` and `b-third`. `a-shared` and `b-shared` had the same remote.

- The line showed with two environments. The project picker listed the projects of the draft's environment only.
- A draft in `a-shared` with typed text moved to `b-shared`. The text stayed. The stored draft had `environmentSelection: "manual"`. The picker then listed the three projects of the second environment.
- The empty draft moved back to `a-shared`. From `a-only`, which the second environment does not have, the draft moved to `b-third`, the first project of the picker there.
- A draft with no project stayed with no project in the other environment.
- With the switch off, the line was gone and the picker listed all five projects.
- With two panes, a choice in the second pane moved that pane only.

Rebase check: `selectProject` in `DraftHeroHeadline.tsx` must still be the pair `openProjectDraft(projectRef)` for an empty draft and `setLogicalProjectDraftThreadId` with `seedDraftModelSelection` for a draft with content. `moveDraftToProject` calls the same pair and adds the manual mark. `onEnvironmentChange` in `useDraftEnvironmentRouting.ts` must still set `environmentSelection: "manual"` and `loadBalancedEnvironmentId: null`. The entries of `buildSidebarProjectPickerEntries` must still carry `group.memberProjects` and `targetProject`.

Not verified:

1. The Mac app with its own environment and `dale-nix`. Both test environments ran on one machine and had the same name in the list.
2. A real provider and a send after the move. No turn ran.
3. Two Claude accounts in a real second environment. The unit test uses fake accounts.
4. "Auto balance" with load balancing on. The manual mark was read in the stored draft only.
5. Attachments through a move. The stock function that moves the draft is the one of the stock project picker.
6. A click on "or start without a project" directly before a choice in the list, while the server still opens the workspace. The stock code of the headline may then open the "No project" draft.

## Command palette filter

Dale asked on 2026-11-19: "hitting command f in the search command k panel opens a filter by env, and project (within that env); also a button for this. Command f shouldn't close the modal and fall back to normal search bar command f functionality." The feature has no setting. With no filter set, the palette lists what stock lists.

What stock `v0.1.10` does: the search field of the open palette resolves each key press against the keybinding rules. A key that resolves to `chat.find` (default `mod+f`) closes the palette and opens the find bar of the open thread. With a server that has no thread find, it closes the palette and shows a toast. The fork's pane keys do not run while the palette is open (`suspended` in `paneKeyScopes.ts`).

What the fork does:

- In the root view of the palette, the key opens a filter menu. The palette stays open, and the find bar and the toast do not show. The root view is the palette with no submenu and no folder browsing.
- A filter button at the end of the search field opens the same menu. Its tooltip is "Filter by environment and project" with the key.
- With two or more environments, the menu lists "All environments" and each environment. An environment opens its project list: "All projects", then each project that has a copy in that environment. With one environment, the menu is the project list only.
- Keyboard in the menu: the arrow keys move, a typed letter moves to an entry, Enter opens an environment, Enter takes a project. The stock submenu also opens with the right arrow and on hover. That was not run. Escape closes the menu only, also from the project list, and the caret returns to the search field. A second Escape closes the palette, as in stock.
- With a filter set, the palette lists only the threads of that environment and project: in "Recent Threads", in the "Threads" group of a search, and in "In messages". The "Projects" group of a search lists only the projects with a copy in that environment. Commands, suggestions and settings stay.
- A chip left of the button shows the filter: the environment, or the environment and the project. With one environment it shows the project only. The button next to the chip clears the filter. The key opens the menu again, with the current choice marked.
- The filter resets when the palette closes. A later opening is never narrowed by an earlier choice. The filter also resets when the palette changes to the file picker or the project content search and back, because stock mounts the palette again.

The key:

- It is a local key rule of the palette's own search field, not a keybinding command of the fork. No rule was added to the defaults, and Settings > Keybindings lists nothing new. With the palette closed, `chat.find` is unchanged.
- Setting "Filter in the command palette", on by default (`paletteFilter` in `t3code-fork:readouts:v1`), added at the merge. Off: the hook reports the filter as not available, so the palette shows no button and the find key is stock.
- The filter key is the key that the stock handler resolves to `chat.find`, so a user who moved the find key moves this key too. A plain `mod+f` that no rule owns is also the filter key. `mod+f` that the user gave to another command stays with that command (`isPaletteFilterKey` in `paletteFilter.ts`).
- The key is taken only while the filter button is on the screen. In a submenu ("New thread in", "Add project", themes) and while the palette browses folders, the palette has no filter button, the filter does not narrow, and the key is the stock key.
- With focus on the filter button, on the chip or in the menu, the key is also taken, so the browser's own find does not open.

How:

- `apps/web/src/panes/paletteFilter.ts`: the pure rules. `buildPaletteFilterIndex` maps the `value` of each thread row and project row of the stock palette to its environment and its project group. `narrowPaletteItems` keeps the rows that pass. A row that the index does not know stays, and with no filter the stock list is returned as it is.
- A project of the menu is a project group, as the sidebar and the palette group projects. One group can have a copy in several environments. The palette shows one row for the group, named after one copy. The row passes when any copy is in the environment of the filter.
- `apps/web/src/panes/usePaletteFilter.tsx`: the hook of the open palette. It holds the filter and the open state of the menu in React state of the palette view. Stock unmounts that view when the palette closes, which is the reset.
- `apps/web/src/panes/PaletteFilterControl.tsx`: the button, the chip and the menu, built from the stock `Menu`, `Button`, `Badge` and `Tooltip` parts. The menu has the same shape as the stock filter menu of the pull request list.
- The threads are narrowed before the stock ranking, so the limit of the "Threads" group counts filtered threads. Message matches are narrowed after stock cut them to its limit, so "In messages" can show fewer rows than the server has for that project.
- Upstream edit: set `r7-palette-filter`, 5 hunks in `CommandPalette.tsx`: the import, the hook around the stock `useCommandPaletteThreadItems` call (it names the stock locals `paletteMode` and `projectGroups`), the narrowing of `projectSearchItems`, the control as the input accessory when stock shows none, and the key rule before the stock `handleKeyDown` with the padding class of the search field.

Checks:

- `paletteFilter.test.ts`: which rows stay for an environment and for a project, the project list of an environment, a filter whose environment or project left, the chip text, and the key rule.
- `paletteFilter.browser.test.tsx`, a file of its own, two tests. Test 1, in the app with the fake environment (one environment, two projects): the key keeps the palette open with no find bar and no toast, the menu has the project list only, a typed letter and Enter choose a project, the thread rows narrow, the chip shows, the caret is in the search field, the arrows move in the menu, Escape closes the menu and then the palette, the next opening has no filter, the button opens the menu, the project rows narrow, and the clear button works. Test 2, the control alone in a stock palette dialog with two environments: the menu lists the environments, Enter on an environment opens the projects of that environment only, a project sets the chip "environment › project", and one Escape from the project list closes both lists and keeps the dialog. `apps/web/test/paneThreadShell.ts` has the helper that puts a thread in a second project.
- Checked on 2026-11-19 in a dev stack with an isolated home, in headless Chromium at 1440 x 900 on Linux (`ctrl+f`), with one environment, three projects and three Replay threads: Ctrl+K opened the palette with the button and no chip. The tooltip was "Filter by environment and project (Ctrl+F)". Ctrl+F kept the palette open, showed no find bar and opened the project list. Two presses of the down arrow and Enter chose a project. The chip showed it, the search "one" listed 1 thread in place of 2, and a project search listed 1 project in place of 2. The first Escape closed the menu only, the second closed the palette, and the next opening had no filter. With the palette closed, Ctrl+F opened the stock find bar of the thread.
- Rebase check: the anchors of the 5 hunks. `projectGroups` must still be the list of `useSortedProjectGroups`, with `projectKey`, `displayName`, `memberProjectRefs`, `pinned` and `archived`. The row values must still be `thread:<environment>:<thread>` and `project:<environment>:<project>` (`buildThreadActionItems`, `buildProjectActionItems`). The stock search field must still take `inputAccessory` in a `relative` wrapper, and set no class in the root view. The stock palette view must still unmount when the palette closes. `MenuSub` must still take `closeParentOnEsc` (Base UI).
- Not verified: two or more environments in a real client (the environment list ran in test 2 with made-up environments, and its rules have unit tests), the packaged Electron app, macOS (`cmd+f`), a project group with copies in two environments, and a long environment or project name in the chip (it is cut at 11 rem).

## Mirror panes

Dale asked for this on 2026-11-19: "when I scroll through tabs on the right with a pane and it goes to a session another pane has open, it switches to that pane. Wrong. I want it to switch my current pane to that session and leave the other pane untouched, so I could theoretically have a mirror of two panes open." The switch is "Open a thread in the current pane when another pane shows it", on by default (`mirrorPanes` in `t3code-fork:readouts:v1`).

What it does, with the switch on:

- A route to a server thread that another pane of the active tab shows opens that thread in the focused pane. This is the rule for each route change: a click in the sidebar, the thread next and previous keys, the command palette, a link, and Back. The focused pane keeps the focus and the keyboard.
- The other pane keeps its thread, its scroll position and its focus state. Its leaf object does not change, so its chat view does not render again.
- Two or more panes of one tab can then show one server thread. Each of them is a full live chat view of that thread.
- A draft still belongs to one pane. A route to a draft that another pane shows focuses that pane. So does a route to the thread of a draft that another pane still shows as a draft (a send that is not final yet).
- A route that names the thread of the focused pane changes nothing, as before.
- "Rule 0" stays: a restored layout wins over the empty launch draft. The first route of a session also never makes a mirror: when the launch URL names a thread that a pane of the restored layout shows, that pane takes the focus. Without this, a launch would replace the thread of the focused pane.
- A pane that navigates by itself (a pane without focus that follows its sent draft, or a redirect) can take a thread that another pane shows. Before, such a pane became empty and took a new draft.
- A stored layout with one server thread in two panes of a tab loads as stored.
- With the switch off, each of these is the old rule: the pane that shows the thread takes the focus, a pane cannot take a thread that another pane of its tab shows, and a layout load empties the second pane of a thread. A layout that already holds a mirror keeps it until the next start of the app, where the second pane becomes empty and takes a new draft.
- One tab with one pane is stock, with the switch on or off.

How:

- `findCollidingLeaf` in `apps/web/src/panes/paneTree.ts` is the one test for "another pane owns this target". Without a mirror it is true for each pane with the same thread key. With a mirror it is true only when one of the two targets is a draft.
- `followRoute` (`paneRouteSync.ts`) takes the setting as a parameter. The pane that owns the route's thread takes the focus. With no owner, the focused pane takes the route.
- `setPaneTarget` and `retargetInactiveDrafts` (`paneStore.ts`) and `sanitizeLayout` (`paneTree.ts`) use the same test. The store reads the setting when it acts (`createPaneStore` takes the reader as a parameter, for tests).
- `PaneHost.tsx` gives the setting to `followRoute`.

Each registry and store that has a thread or a pane as its key, checked for two chat views of one thread in one tab:

| State                                                                                                                                                                                                                        | Key                  | Result                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pane focus memory, focus guard, composer handle of a pane, pane project, pane navigate function, panel animation context (`paneFocusMemory.ts`, `paneFocusGuard.ts`, `PaneCell.tsx`, `paneActions.ts`, `paneNavigation.tsx`) | pane id              | Safe as it is                                                                                                                                                                                                                                                                                                                              |
| The "focused pane" registries: scroll to end, stop turn, message jump, focus input (`paneScrollToEnd.ts`, `paneStopTurn.ts`, `paneMessageJump.ts`, `paneFocusInput.ts`)                                                      | one slot             | Safe as it is. Only the chat view of the focused pane registers, and a registration removes itself only while it is still the registered one. A pending take back of the stop key belongs to the chat view that took the key                                                                                                               |
| Narrow-panel views (`panePanelViews.ts`)                                                                                                                                                                                     | thread, counted      | Safe as it is. It counts the narrow and the wide views of a thread, so a request for a panel surface from a narrow mirror passes while the other mirror is wide, and the panel shows there                                                                                                                                                 |
| Settle release (`PaneSettleRelease.tsx`, `paneSettleWatch.ts`, `paneArmedThreadStore.ts`)                                                                                                                                    | thread               | Fixed. A thread is watched one time, and each pane that shows it takes its own new draft. The settle by hand of the focused pane's thread needed two changes, see below                                                                                                                                                                    |
| Terminal reveal (`paneTerminalReveal.ts`)                                                                                                                                                                                    | thread               | Safe as it is                                                                                                                                                                                                                                                                                                                              |
| Pane drafts (`paneDrafts.ts`), layout load                                                                                                                                                                                   | draft id             | Safe as it is. A draft has one pane, with the switch on or off                                                                                                                                                                                                                                                                             |
| Paste chips (`pasteCollapseStore.ts`)                                                                                                                                                                                        | draft key            | Safe as it is. The pane that types records the chips before the prompt changes, so the other pane shows the same chips and writes nothing. Read in the code, not run                                                                                                                                                                       |
| Stock composer draft (`composerDraftStore.ts`): text, attachments, send in flight, rewind mark                                                                                                                               | thread               | Shared, by design of stock. Typing in one pane shows in the other. The pane that types keeps its caret, and the other pane writes nothing back: one typed character is one write of the draft. One send goes out and both composers are empty after it. Each pane has its own caret                                                        |
| Stock timeline scroll and follow mode (`useTimelineFollow.ts`)                                                                                                                                                               | chat view            | Safe as it is. Each pane has its own scroll position                                                                                                                                                                                                                                                                                       |
| Stock thread family mount, thread subscription                                                                                                                                                                               | thread, counted      | Safe as it is. Closing one pane keeps the subscription of the other                                                                                                                                                                                                                                                                        |
| Stock right panel state (`rightPanelStore.ts`)                                                                                                                                                                               | thread               | Known limit. Both panes show the same panel with the same surfaces, where each pane is 720 px or wider. A browser preview or a panel terminal is then mounted two times. Not run                                                                                                                                                           |
| Stock terminal drawer (`terminalUiStateStore.ts`, `lib/terminalFocus.ts`)                                                                                                                                                    | thread               | Known limit. The drawer opens and closes in both panes, and both show one terminal session. The session has one size, so the pane that was sized last decides the columns of both. A focus request goes to the first mounted view that takes it, and the focus guard sends focus back from a pane without focus. Read in the code, not run |
| Stock thread find (`threadFindStore.ts`)                                                                                                                                                                                     | thread, one timeline | Known limit. Find opens in both panes and uses one timeline (see "Untested assumptions", item 12)                                                                                                                                                                                                                                          |
| Stock optimistic message, local error, feedback state                                                                                                                                                                        | chat view            | Known limit. The pane that sends shows its message at once. The other pane shows it when the server sends it                                                                                                                                                                                                                               |

Closing a pane sends no command. A chat view that unmounts removes its listeners only, so the thread of the other pane is not stopped, not archived and not changed.

A settle by hand of the focused pane's thread, after its merge, keeps its result in both states of the switch: the pane takes its own new draft and has the focus again (section "Settle on merge and preview links"). The stock settle action moves the route to the next thread. With the switch on, that route opens the next thread in the pane of the settled thread, where the old rule gave it to the pane that already showed it. Two changes keep the result:

- The draft of that pane now takes the place of the thread that the stock route put there (`claim` in `openNewThreadNow`, used by `replacePaneThread` with `keepFocus`).
- `releasePanesOfThread` also frees the pane that had focus at the settle when the stock route already replaced its thread.

One result changed with the switch off too: when no other pane shows the next thread, the pane of the settled thread now takes its draft. Before, it kept the next thread when the stock route ended before the draft was ready.

Text of other sections that this section changes: "Panes and drafts" (a pane whose thread another pane shows), and item 6 of the limits of "Collapse long pastes".

- Upstream edit: none.
- Checks: `paneRouteSync.test.ts`, `paneStore.test.ts`, `paneTree.test.ts` (each rule for both states of the switch, a stored layout with a mirror, a draft with one pane), `readoutSettings.test.ts`, `paneMirror.browser.test.tsx` (a route to a thread that the other pane shows, typing with a mirror, one send, closing one mirror pane), one section of `paneSettleRelease.browser.test.tsx` (the settle by hand in both states), and one test of `panes.browser.test.tsx` (the route with the switch off).
- Rebase check: none of its own. The stock editor must still apply a changed prompt to an editor without focus with no update event and no DOM selection (`ComposerPromptEditorTiptap.tsx`, the effect "writes the controlled value and cursor into the Tiptap document"). The typing test fails when that changes.
- Not verified: the packaged Electron app, a real server, a real provider, a running turn in a mirror (the stream in both panes, the stop key), an approval or a question that both panes show, the right panel and the terminal drawer of a mirror, the paste chips of a mirror, three or more panes on one thread, and the render cost of two views of one long thread.

## Music control

Dale asked on 2026-11-19 for a music icon at the bottom right, "where you can connect to spotify and control music I'm playing", with a small popup above it, a key to open it, and controls that Tab reaches. The switch is "Show the music control", on by default. The control shows only in the desktop app on macOS.

What it does:

- The sidebar footer has one music button, directly after the stock Usage button and in its row (`apps/web/src/panes/SidebarMusicControl.tsx`). Dale moved it there on 2026-11-20 ("should go bottom right next to usage not here"): the first place was the right end of the bottom bar of each pane. The button looks like the stock buttons of that row, and the Settings, Usage and Pull requests pages show "Back" in place of the row. A click opens a popup above the button. It shows the name and the artist of the current track, one line each, the buttons "Previous track", "Play" or "Pause" and "Next track", and a volume slider with steps of 5.
- When the popup opens, focus goes to the play/pause button. Tab goes through the controls in the order that they show. Space and Enter press a button, the arrow keys move the slider, and Escape closes the popup. A popup that opens with the help line leaves focus on the music button, and focus goes to play/pause when the controls show.
- The key `mod+alt+m` (`layout.toggleMusic`, Cmd+Option+M on macOS) opens the popup from any pane. The same key or Escape closes it, and focus returns to the place where it was. After a click, focus returns to the music button. The user can rebind the key in Settings > Keybindings.
- Dale asked for Cmd+Shift+C "as long as that isn't taken". Stock has `thread.copyReference` on `mod+shift+c` and `modelPicker.toggle` on `mod+shift+m`. No stock default and no fork default uses `mod+alt+m`, and the stock app menu has no item on it (read in `apps/desktop/src/window/DesktopApplicationMenu.ts`).
- The key is not taken with terminal focus, and when the sidebar shows no music button: in a browser, off macOS, with the setting off, with a collapsed sidebar (it is inert), and on a page that shows "Back".
- The popup shows one line of help in place of the controls when Spotify does not run, when macOS refused the permission, and when the read failed.
- The state is in `apps/web/src/panes/musicStore.ts`.

How it reaches Spotify:

- No Spotify login, no Spotify Web API, no developer app, no client id and no token. The main process of the Mac app runs `/usr/bin/osascript` with fixed AppleScript for the application with the id `com.spotify.client` (`apps/desktop/src/ipc/methods/forkSpotify.ts`). It controls the Spotify desktop app on the same Mac only. It does not control a phone or a speaker, except through that app.
- Two bridge methods: `getSpotifyState` and `sendSpotifyCommand`. The commands are a closed list: `playpause`, `next`, `previous`, `setVolume` (a whole number from 0 to 100) and `seek` (whole seconds). The popup has no control for `seek`. The main process checks the command against a schema. A number goes to the script as an argument (`argv`), never as script text.
- Nothing starts Spotify. `tell application` starts an app that does not run, so each script that tells Spotify first asks `application id "com.spotify.client" is running`. A read first runs that question alone, in a script with no Spotify term: a script with a Spotify term does not compile on a Mac that has no Spotify.
- The answer is typed: a state, or one of `notRunning`, `unsupported` (not macOS), `permissionDenied` (AppleScript error -1743) and `error` with the first line of the message.
- macOS asks one time for the permission to control Spotify, at the first read. The Info.plist of the Mac app now has `NSAppleEventsUsageDescription`, which macOS needs for that question.

Reads, and how the fork keeps them low:

- A read runs when the popup opens, every 5 seconds while it is open and the window shows, and one time 300 ms after a command. A read is two `osascript` processes, or one when Spotify does not run.
- A closed popup reads nothing. The button therefore has no "playing" mark: a mark needs a read every 30 seconds for as long as the app has focus, also for a user who never opens the popup, and it would be up to 30 seconds old.
- The popup shows a command at once, before Spotify confirms it. A read that started before a command is dropped.
- A drag of the volume slider sends its last value one time, 150 ms after the last change.
- A command is one `osascript` process. Nothing repaints while the state does not change.

Code and checks:

- Upstream edit: set `r7-music-control`, 8 hunks in 5 files. `SidebarChrome.tsx`: `<ForkSidebarUtilityItems />` after the Usage item (the import is in the hunk `r3-environment-resources-1`, which now names two parts of `ForkSidebarFooter.tsx`). `packages/contracts/src/ipc.ts`: the import with the export of the types, and the two optional bridge methods. `apps/desktop/src/preload.ts`: the import, and the two bridge methods. `apps/desktop/src/ipc/DesktopIpcHandlers.ts`: the import, and the two handlers. `scripts/build-desktop-artifact.ts`: the `NSAppleEventsUsageDescription` text.
- Fork-owned files outside `apps/web/src/panes/`: `packages/contracts/src/forkSpotify.ts` (the bridge types), `apps/desktop/src/ipc/methods/forkSpotify.ts` and its test, and two more channel names in `apps/desktop/src/ipc/forkChannels.ts`. The path list of rebase step 0 must name the three new files.
- Checks: `forkSpotify.test.ts` in `apps/desktop` (the answer of the state script, the error mapping, the script and the argument of each command, and both methods with a stand-in for `osascript`). `music.test.ts` (what the popup shows after a command, and the help line). `musicStore.test.ts` (one read at a time, a read from before a command is dropped, one read after a command, one send for a volume drag). `paneKeys.test.ts` and `packages/shared/src/paneKeybindings.test.ts` (the key). `sidebarMusic.browser.test.tsx` with a stand-in for the bridge: one button, directly after the Usage button and in its row, no button in a pane, no read while the popup is closed, the help line, the popup by click and by key, the Tab order, each command, the focus return, no popup by key with a collapsed sidebar, and no button with the setting off. The test replaces `musicBridge` and not `window.desktopBridge`, because the stock app takes a `window.desktopBridge` for the whole bridge and fails on one with two methods. `music.test.ts` covers who has a bridge: the Mac app only.

```sh
(cd apps/desktop && pnpm exec vp test run src/ipc/methods/forkSpotify.test.ts)
(cd apps/web && pnpm exec vp test run --project unit src/panes/music.test.ts src/panes/musicStore.test.ts \
  src/panes/paneKeys.test.ts src/panes/readoutSettings.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/sidebarMusic.browser.test.tsx)
```

Rebase check:

1. `SidebarUtilityMenu` in `SidebarChrome.tsx` must still end its row of buttons with the Usage item, and each item must still be a `SidebarMenuItem` with a `SidebarMenuButton` of `size="icon"`.
2. A collapsed sidebar must still be `inert`: the music key reads that to know that the button does not show.
3. If upstream adds `NSAppleEventsUsageDescription` to the build script, remove hunk 8.

Not verified: this work was built on Linux, where no `osascript` and no Spotify exist. No script ran against Spotify. See "Untested assumptions". Not built: a button that starts Spotify, a seek control, the cover image, and playback on another device.

## Working time of a finished turn

Dale asked on 2026-11-19, with a screenshot of the end of a finished turn: "when things are continuously working and finish, [I] want to see total working time after it finishes." The switch is "Show the working time of a finished turn", on by default (`showWorkedTime` in `t3code-fork:readouts:v1`). With the switch off the timeline is stock.

What stock `v0.1.10` shows:

- While a turn runs: "Working for 32m 16s", in the working row at the end of the turn's work (`WorkingTimelineRow` in `TimelineWorkGroupRows.tsx`). The start is `orchestrationV2RunWorkStartedAt(run)`: `workStartedAt`, else `startedAt`, else `requestedAt` (through `activityStartedAt` and `resolveThreadWorkingStartedAt`). The row leaves when the turn ends.
- After the turn ends: the fold line "Worked for 32m 16s", or "You stopped after ..." for the latest stopped turn (the `turn-fold` row of `deriveTurnFolds` in `MessagesTimeline.logic.ts`). The line is at the START of the turn's work, directly under the message of the user, so after a long turn it is far above the end of the chat. A turn has no fold line when it has no work to hide (an answer of text only), when its run failed, and when the timeline has an interrupt row for its run.
- The footer of the last agent message of a turn (`AssistantMessageMeta` in `TimelineAssistantRows.tsx`): copy, fork, reply and the time of the message. It has no working time. It shows only under the pointer, except when tool rows follow the message.

So stock has the number, but not where the turn ends. That is the gap.

What the fork shows (`apps/web/src/panes/WorkedTimeLabel.tsx`, rule in `workedTime.ts`):

- In the stock footer of the last agent message of a finished turn, after the stock time: `4:49 PM · worked 32m 16s`.
- The number is the end of the run minus the start that the stock "Working for" label uses, so it is the last value of that label. The form is the form of that label: whole seconds, then the stock `formatDuration`.
- A footer with the label stays visible with no pointer on it (`workedTime.css`), with its copy, fork and reply buttons. A footer with no label keeps the stock rule.
- A turn that was stopped or that failed shows its time too. The word is always "worked".
- A turn that still runs shows no label. The label has no timer, because the number of a finished turn is fixed.
- A turn of less than 10 seconds shows no label (`WORKED_TIME_MIN_MS`), so a short answer keeps the stock footer.
- The tooltip of the label says when the work started, and the number of runs when there is more than one.
- It sits beside nothing of the set `r7-work-tokens`: that label is in the working row, which only a running turn has.

Which runs one number covers:

- One run: from its work start to its end.
- A turn that the server continued in a new run (`restartContinuationOfRunId`, `manualContinuationOfRunId`, `usageLimitContinuationOfRunId`): the label shows one time, on the last run of the chain, and covers each run of the chain. The earlier runs show no label. The wait for a usage limit or for a manual "continue" does not count, because each of those runs counts from its own start. A run after a server restart counts from the start of the run before it, as the stock label does, so there the restart time counts.
- A wake by a background task, a subagent result or a message of a subagent: a stock server gives the wake run the work start of the run before it (`wakeWorkStartedAt` in `apps/server/src/orchestration-v2/Orchestrator.ts`), and the stock label counts from there. The fork does the same, so the message of the wake shows the time since the first run of that work, with the waits. The message of each earlier run keeps its own number.
- A wake by a pull request watch: new work. The run counts from its own start, and so does each later wake of that work. This is the one place where the label differs from the last value of the stock "Working for", which still counts from the first run. The reason: the fork treats a watch as not holding its thread (section "Pull request watch"), and a watch can wake a thread hours later.

Code and checks:

- Upstream edit: set `r7-worked-time`, 2 hunks in `apps/web/src/components/chat/TimelineAssistantRows.tsx`: the import, and `<WorkedTimeLabel message={message} />` after the stock time in `AssistantMessageMeta`. The call names one stock local, `message`.
- The label reads the structure atom of the thread (`quietThreadAtom`) and selects one string, so it renders again only when a number of its turn changes.
- Checks: `workedTime.test.ts` (start and end, a running turn, a waiting turn, the threshold, a stopped and a failed turn, the three kinds of continuation, a continuation that waits or was cancelled, a wake by a background task, a wake by a pull request watch, the format). `workedTime.browser.test.tsx`: the label in the stock footer of a turn of 32m 16s, that footer visible with no pointer, no label and the stock hover rule for a short turn, and the switch.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/workedTime.test.ts src/panes/readoutSettings.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/workedTime.browser.test.tsx --no-file-parallelism)
```

Checked on 2026-11-19 in headless Chromium at 1440 x 900, in a dev stack with an isolated home and the Replay provider (scenario `showcase`):

- A turn of 5.7 s: no label. The stock fold line said "Worked for 5.7s".
- A turn held open for 20 s by its approval request: the last value of the stock label was "Working for 20s", and the footer then showed `5:32 PM · worked 20s` with no pointer on it. The stock fold line said "Worked for 20s".
- With the switch off in the stored settings and a reload: no label.

Rebase check: the anchor is the end of the time tooltip in `AssistantMessageMeta`. The footer must still be a `div` directly inside an element with the class `group/assistant`, because `workedTime.css` selects it as the parent of `[data-worked-time]`. `orchestrationV2RunWorkStartedAt` must still be the start of the stock label. When upstream shows the working time at the end of a turn, remove this feature.

Token use (Dale asked on 2026-11-23: "the work x seconds doesn't show token use"): the label adds the output tokens of the turn, "· worked 19s · 1.2k tokens", and its tooltip gives the output, the input and the input read from the cache. The numbers are the `turnTokenUsage` reports that the Claude and Codex adapters of a stock server put on each provider turn: the main agent plus `otherUsage` (subagents, compaction), summed over the provider turns of every run that the working time counts (`continuedRunChain` in `workedTime.ts`, `finishedTurnTokens` in `turnTokens.ts`). A report of a local command does not count. With no report, the label shows the time only. The token part follows the switch "Show token use of running work" (`showWorkTokens`). While the fold line of the turn shows the number, the label leaves the token part out (section "Live token use"). Checks: `turnTokens.test.ts`. Not verified: the fake server of the browser tests and the Replay provider send no provider turns, so the label with tokens was not seen.

Not verified: a real provider, a real server, the packaged Electron app, a turn that a server continued (restart, usage limit, manual "continue"), a wake by a background task and a wake by a pull request watch (unit tests only, with run records made by hand), a thread whose older runs the client did not load, and the mobile client, which this fork does not change.

## Artifact links

Dale asked on 2026-11-19: "I want to open artifact links in Tutor3 by default, signed in, so if I have multiple accounts going at once it's easy to see multiple artifacts at once." He runs threads on three Claude accounts at the same time. A Claude artifact is private to the account that published it, and the system browser is signed in to one account. The switch is "Open artifact links in the app", on by default (`artifactLinksInApp` in `t3code-fork:readouts:v1`). It acts in the desktop app only.

What stock `v0.1.10` already has (read in the code on 2026-11-19):

- Where a chat link opens: the click handler of a link in `apps/web/src/components/ChatMarkdown.tsx` asks `resolveLinkTarget` (`apps/web/src/browser/browserLinkTarget.ts`). The link goes to the system browser with Cmd, Ctrl or a middle click, when the setting is not "app", when the client may not use the browser for the thread, and for a URL that is not `http` or `https`. Else it opens as a tab of the browser in the right panel.
- The setting is Settings > Browser > "Open links in", with the values "Your default browser" (the default) and "T3 Code" (`browserLinkTarget` of the client settings). It is one rule for every link.
- A browser profile is `{ id, name, kind }` (`packages/contracts/src/browserProfile.ts`). Two are built in: "Default" and "Incognito". The user can add 24 more in Settings > Browser > "Browser profiles". A tab gets its profile when it opens and keeps it.
- In the desktop app each tab is an Electron `<webview>`. The main process derives its session partition from the environment and the profile (`resolvePartitionScope` in `apps/desktop/src/ipc/methods/preview.ts`, `getPartition` in `apps/desktop/src/preview/BrowserSession.ts`): `persist:t3code-preview-profile-<first 20 hex digits of the SHA-256 of [environmentId, profileId]>`. The default profile uses the environment id alone. So each profile of each environment is one cookie store, and a tab can have a cookie store that no other profile shares. The id need not be in the profile list.
- A `persist:` partition is on the disk of the Mac, in the Electron profile of the app, so a sign-in stays across app starts. The "Incognito" profile has a partition with no `persist:` and loses its cookies when the app quits.
- The browser import (Settings > Browser > "Browser profiles" > "Add profile" > "Import from") copies the cookies of another browser into one profile, one time (`docs/user/browser-import.md`). The fork does not use it.
- The tab shows its profile: a badge with the profile name before the address, when the profile of the tab is not the default profile, and the line "Profile: <name>" in the menu of the tab (`PreviewView.tsx`, `PreviewMoreMenu.tsx`). A profile id that the list does not have shows as "Removed profile".
- The floating preview (`ThreadPreviewMiniPlayer.tsx`, `previewMiniPlayerStore.ts`): a small frame inside the chat view that shows one browser tab of the thread. The user can move it, change its size, close it, send it to the right panel, and "Pop into separate window". Stock shows it when an agent opens a browser (Settings > Browser, "Auto-show floating preview").
- For a thread of a remote environment, the desktop app opens a tab in its own `<webview>` (`previewRuntimeFor` gives no server runtime there). The page and its cookies are on the Mac.

What the fork adds, with the switch on:

- A click on a Claude artifact link in a chat opens the link in the browser of the app. The stock setting "Open links in" stays as it is for each other link, and need not be "T3 Code".
- An artifact link is an `https` URL with the host `claude.ai` and a path that holds `/artifact/` and an id: `https://claude.ai/artifact/<id>` and `https://claude.ai/code/artifact/<uuid>`.
- The tab opens in a browser profile of the Claude account of the thread: the provider instance that the thread runs on now. The profile id is `claude-account-<provider instance id>`, for example `claude-account-dale-claude2`. Each account therefore has its own cookies.
- The first link of an account adds the profile to the stock list, with the name "<display name of the provider instance> account". So the stock badge before the address shows the account, and Settings > Browser lists the profile. The user can rename it there, clear its cookies, or remove it. A removed profile is added again at the next link.
- The first time, the page is the sign-in page of claude.ai. The user signs in by hand, in that tab. The fork reads, copies and writes no credential file and no token, and does not touch the login.
- A second click on a link whose tab is still open in the thread shows that tab. No second tab opens.
- A pane narrower than 720 px has no right panel (section "Right panel in a narrow pane"). There the tab shows in the stock floating preview of that pane. No panel request is made, so no "too narrow" message shows. When the pane is 720 px wide or more, the tab is also a tab of its right panel.
- Cmd, Ctrl, Alt or a middle click with the click: the stock rule, which opens the system browser.
- The stock menu item "Open in browser" of an artifact link (right click) uses the same profile. In a narrow pane it gets the message of the fork, as each other request for a panel does.
- The stock rule decides in each other case: a link that is no artifact link, a thread that does not run on a Claude account, a plain browser (no desktop bridge), a client with no preview permission for the environment, and the switch off.

Several artifacts at the same time:

- Each pane has its own right panel and its own floating preview. Two panes of 720 px or more, each with a thread of another account: click the link in each pane, and the two artifacts show side by side, each in its own panel, each signed in to its own account.
- In narrow panes, each pane shows its artifact in its floating preview. The button "Pop into separate window" of a floating preview gives the artifact a window of its own.
- One thread can hold several artifact tabs in its right panel. They share the cookies of the account.

How:

- `apps/web/src/panes/artifactLinks.ts` holds the rules as pure functions: `isClaudeArtifactUrl`, `artifactProfileOf`, `withArtifactProfile`, `resolveArtifactLinkTarget`, `findArtifactTab`.
- `apps/web/src/panes/openArtifactLink.ts` reads the app and acts. `openArtifactLinkInApp` is the call in the click handler. It opens the tab with the stock `openUrlInPreview`, with `profileId`, and with `background` for the floating preview. `artifactLinkProfile` gives the profile to the stock menu item.
- The fork adds no code to the Electron main process and none to the preload. The stock desktop code already gives each profile id its own partition.
- The profile list is the stock client setting `browserProfiles`. The fork adds one entry for each account, as the stock "Add profile" does. A stock app sends this list to an environment that has a server browser.

Limits:

- The account is the one that the thread runs on at the click. A thread that changed its account after it published an artifact opens the link in the profile of the new account.
- A cookie store belongs to one environment and one profile. The same provider instance id on a second environment is a second cookie store with the same profile name.
- Links in a terminal, and links that another app sends to Tutor3 as the default browser, keep the stock rule and the default profile.
- For a thread of the app's own local environment, stock decides the runtime of the tab. Where that environment has a server browser, the tab is a tab of that local server, and its cookies are in the T3 home of the Mac, not in the Electron profile.

- Upstream edit: set `r7-artifact-links`, 3 hunks in `apps/web/src/components/ChatMarkdown.tsx`: the import, one call in the click handler of a link directly before the stock `resolveLinkTarget` test, and the profile in the one `openUrlInPreview` call of the stock "open in preview" function.
- Checks: `artifactLinks.test.ts` (which URL is an artifact link, the profile of an account and its limits, the profile list, the target for each state, the narrow pane rule, the tab that is already open), `readoutSettings.test.ts`, and `artifactLinks.browser.test.tsx` with a stand-in for the one question about the desktop bridge: a real click on a link in a chat sends `preview.open` with the profile of the thread's account and opens the right panel, a second click opens no second tab, Ctrl and the switch off give the stock rule, two narrow panes each show their own tab in the floating preview with no panel and no message, and a browser with no bridge is stock. The browser test fails on a tree without the hunks.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/artifactLinks.test.ts src/panes/readoutSettings.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/artifactLinks.browser.test.tsx --no-file-parallelism)
```

Rebase check:

1. `resolvePartitionScope` (`apps/desktop/src/ipc/methods/preview.ts`) must still derive the partition from the environment id and the profile id alone, for an id that the profile list does not have. The click lists the profile before it opens the tab. The menu item does not wait for that write, so it needs this rule.
2. `openUrlInPreview` (`apps/web/src/browser/openFileInPreview.ts`) must still take `profileId` and `background`, and `background` must still make no panel request.
3. `PreviewView.tsx` must still show the badge for a tab whose profile is not the default profile.
4. If upstream adds a rule of its own for Claude artifact links or a profile for each provider account, remove the set.

Not verified: this work was built on Linux, where the Electron app does not run. No `<webview>` opened claude.ai, no sign-in was made, and no cookie store was seen on disk. The partition rule and the persistence were read in the stock desktop code only. The floating preview in a narrow pane was seen in the browser test only, with no page in it. A real remote environment was not used.

## Claude keywords in the input

Dale asked on 2026-11-19: "also make ultracode text stylized when we type in input and Claude is the provider." The Claude Code CLI colors such a word in its input. The switch is "Style Claude keywords in the input", on by default (`styleClaudeKeywords` in `t3code-fork:readouts:v1`). With the switch off the composer is stock.

What stock `v0.1.10` does:

- "ultracode" in a prompt for a Claude provider starts the multi-agent mode of Claude Code for that message. Claude Code reads the word. T3 does not read it: T3 has a model option with the same name (the "Ultracode" toggle of the model picker).
- "ultrathink" is a keyword that T3 reads: `isClaudeUltrathinkPrompt` in `packages/shared/src/model.ts` finds it with `/\bultrathink\b/i`, and for a model whose effort option has that value the composer then gets a frame (`ultrathink-frame`) and the effort control shows "Ultrathink".
- Stock styles neither word in the text of the input.

What the fork shows:

- Each whole word "ultracode" and "ultrathink" in the prompt editor has the action color of the theme and a soft background of that color, from the moment its last letter is typed. Any letter case counts. The rule is the stock rule of "ultrathink": a word boundary on both sides, so `ultracoder`, `ultracode_mode` and `ultracode2` are no hit, and `ultracode.` and `ultracode-style` are a hit.
- No style in code: a code span and a code block of the rich text editor, and in text with Markdown marks (the plain text editor, and the shown source of the rich text editor) a backtick span and a fenced block. No style in a chip, and a chip ends a word.
- Only when the selected provider of that composer is a Claude provider (driver `claudeAgent`, any provider instance). The style follows the model picker at once. Each pane has its own composer, so each pane follows its own provider.
- No style in an answer that is sent as typed (`literalText`): that text is no prompt.
- The style changes nothing else: the text, the caret, the selection, copy and paste, undo, the saved draft and the sent message are stock.

How:

- The CSS Custom Highlight API paints the word: `CSS.highlights` holds one highlight with the name `fork-claude-keyword`, and `apps/web/src/panes/claudeKeywords.css` styles `::highlight(fork-claude-keyword)`. Stock uses the same API for the find results of a thread and for citations. A ProseMirror decoration was the other way. It was not taken: it puts a `span` around the word in the DOM of the editor, and it needs a plugin in the stock editor, whose list of extensions is a constant of the stock file. The highlight adds no node to the document and no element to the DOM, and its carried diff is one line.
- `::highlight` takes a color, a background and a text decoration only, so the word has no gradient and no animation. The color is `--update-foreground`: the action color of the theme in its form for text. It is `--primary` in the light stock theme, a lighter blue in the dark stock theme, Tutor yellow in the dark Tutor palette, and the dark yellow `#5d4400` in the light Tutor palette, where yellow text on white is not readable. The background is `--primary` at 18%.
- `PasteCollapseEditor` (the fork wrapper of the stock editor, section "Collapse long pastes") takes one more prop, `keywordProvider`, and calls `useClaudeKeywordStyle` (`apps/web/src/panes/useClaudeKeywordStyle.ts`). While the style is active, the hook gives the container of the stock editor one more class (`claude-keywords-<id>`, through the stock prop `containerClassName`) and finds the container by that class. With the switch off, with another provider, and in a browser with no `CSS.highlights`, the editor gets the stock props.
- `styleClaudeKeywordsIn` (`claudeKeywordHighlight.ts`) watches the container with a `MutationObserver` and makes the ranges again after each change of the text. The observer runs before the next paint. A prompt with the letters of no keyword costs one read of the editor text for each change.
- The rule is `findClaudeKeywordRanges` in `claudeKeywords.ts`, a function of plain text. The DOM walk gives it the text of the editor, with a line break between two blocks, and one character that ends a word in the place of each chip and each code element.
- Each composer adds its own ranges to the one highlight, and removes them when it leaves.
- Both settings together: with "Collapse long pastes" on, the fork wrapper mounts the stock editor inside `CollapsingEditor`. The props of the hook go to both forms, and the hook finds the new container after each change of the form.

Code and checks:

- Upstream edit: set `r7-ultracode-style`, 1 hunk in `apps/web/src/components/chat/ChatComposer.tsx`: the line `keywordProvider={selectedProvider}` on the editor element, after the stock `literalText` prop. `selectedProvider` is a stock local. The prop belongs to the fork wrapper, so this set needs the import hunk of the set `r3-paste-collapse`.
- Checks: `claudeKeywords.test.ts` (the place of a word, letter case, several hits, word boundaries, a chip, backtick spans, fenced blocks, the provider rule). `claudeKeywords.browser.test.tsx`, in the app with a stand-in for the server: no style before the last letter, the style on "ultracode" for a Claude provider, the color of the word, one paragraph with one text node and the typed text in the draft, no style and the stock class list with the switch off, the style with "Collapse long pastes" on, no style in a code span, "ULTRATHINK", two panes with a provider each, a change of the provider in the store of the draft, a pane that closes, and no style for a Codex thread.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/claudeKeywords.test.ts src/panes/readoutSettings.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/claudeKeywords.browser.test.tsx --no-file-parallelism)
```

Checked on 2026-11-19 in headless Chromium at 1440 x 900, in a dev stack with an isolated home, on a new thread. No message was sent, so no provider ran:

- With the default model of the new thread (a Codex model): "run this with ultracode please" had no style.
- The Claude provider of this machine was in the model picker. After a click on a Claude model, with the picker still open, "ultracode" had the style. The editor held one paragraph with the typed text and no other element.
- After a click on a model of "Replay (dev)": no style. After a click on the Claude model again: the style was back, and "ULTRATHINK", typed after that, had it too.
- The Replay provider is not a Claude provider, so a Replay thread cannot show the style. The style in a started thread ran in the browser test only.

Looked at on 2026-11-19 as pictures of the composer, from the browser test page: the dark and the light palette of the theme "Tutor" and of the theme "T3 Code". The word was readable in each of the four.

Rebase check:

1. `ChatComposer.tsx` must still pass `literalText={isLiteralPendingAnswer}` to the editor, and `selectedProvider` must still be the driver kind of the selected provider (`ProviderDriverKind`), not a provider instance id.
2. The stock editor must still put `containerClassName` on the element that holds the editor, and the editor must still have `data-testid="composer-editor"`. The browser test fails when one of these no longer holds.
3. A code span must still be a `code` element, a code block a `pre` element, and a chip an element with `contenteditable="false"`. An inline mark with a new tag needs a place in `INLINE_TAGS` of `claudeKeywordHighlight.ts`, or a word that is half in that mark gets no style.
4. `--update-foreground` and `--primary` must still be theme tokens.
5. When upstream styles the keywords of a provider in the input, remove this feature.

Not verified: a real turn with "ultracode" (no message was sent, so that Claude Code starts its multi-agent mode on the word is taken from Dale's request and was not run), the exact rule by which Claude Code finds the word (the fork uses the stock rule of "ultrathink"), the packaged Electron app, Safari and Firefox (a browser with no `CSS.highlights` shows no style), a text with a right-to-left script, text during an input method composition, and the mobile client, which this fork does not change.

## Browser pane

Dale asked on 2026-11-20: "artifact previewer need some updates 1. too small 2. not resizable 3. need to be able to drag in and create a split pane with it if we want / move to new pane or diff tab just how vscode windows work. but initial state is inset I think". "Inset" is the stock floating preview, which stays the first state of an artifact link in a narrow pane (section "Artifact links"). Two switches, both on by default, both in `t3code-fork:readouts:v1`: "Larger floating preview with a resize grip" (`largeFloatingPreview`) and "Browser panes" (`browserPanes`). With both off the floating preview is stock in size, look, markup and drag.

What stock `v0.1.10` does (read in the code on 2026-11-20):

- The floating preview stores a width only (`previewMiniPlayerStore.ts`). Its height follows the shape of its source (`resolvePreviewMiniPlayerFrame` in `previewMiniPlayerLayout.ts`). For a browser tab the source is the viewport setting of the tab, else the size at which the page showed last (`fittedSourceContent` in `browser/browserSurfaceStore.ts`), else 1280 x 800 (`resolveFittedBrowserViewport`).
- An artifact link opens its tab in the background, so the tab never showed: the source is 1280 x 800. The first width is the largest that fits a box of 320 x 320, so the frame is 320 x 200, and the page is drawn at 1280 x 800 and scaled to 25% (`HostedBrowserWebview.tsx`). This is "too small".
- The size can change: eight handles with no mark, strips of 8 px on the edges and squares of 16 px on the corners (`RESIZE_HANDLES`). A resize keeps the shape of the source. A frame larger than its source shows the page at 100% with an empty margin. This is "not resizable": Dale did not find the handles.
- The drag handle is a dot of 12 px at the top right. Under the pointer it becomes a row of buttons. The buttons fill the row, so about 3 px of it start a drag.
- The store is in memory. Stock keeps the width and the position for the thread while its floating preview is open, and drops them when it closes.

What "Larger floating preview with a resize grip" does:

- The floating preview that an artifact link opens starts at 70% of the width of its chat area, and 1.25 times as tall as wide. In the browser test, with a chat area of 512 px, it is 358 px wide and taller than wide. The stock limits stay: 240 px minimum width, 12 px to each edge, and the area above the composer. In a pane too short for that shape, the frame keeps the 70% width and takes the height that fits.
- The page has the size of the frame, so it shows at 100%, as a narrow window does. A frame narrower than 390 px keeps a page of 390 px and scales it, because a page narrower than a phone screen breaks most layouts.
- After a resize the page takes the new size of the frame: a larger frame shows more of the page, with no margin. A width that the user set stays for the thread, as in stock.
- Every floating preview shows a grip in its bottom right corner: the stock corner handle, at 26 px, with three lines on a small plate. Each edge handle is 12 px and shows a line in the action color under the pointer. The cursor classes are the stock ones.
- How the size works: stock reads the shape of the frame and the size of the page from one value, `fittedSourceContent`. `floatingPreviewSize.ts` writes its page size there for the tabs that it sizes, each time stock claims the tab for a floating preview. Stock clears the value when the tab goes to the right panel, so the panel is not changed. The fork changes no viewport setting and sends nothing to a server.
- The grip is CSS on the stock handle elements (`floatingPreview.css`), under the attribute `data-preview-grip` that the pane host sets while the switch is on.

What "Browser panes" does:

- A pane can show the browser of a thread in place of a chat: a header (the word "Browser", the thread title, two buttons) and the stock browser view of the thread's active browser tab (`PreviewPanel`: address row, profile badge, the menu, the page).
- Ways in, from the floating preview of a browser tab:
  - Drag: the fork adds a grip to the stock button row, as a place to take hold. With "Larger floating preview with a resize grip" on, a bar on the top edge of the frame is the place to take hold (section "Drag right-panel tabs"). While the pointer is inside the pane of the floating preview, the drag is the stock move. When the pointer leaves that pane, drop zones show: the left, right, top or bottom half of the pane under the pointer, each tab of the tab strip, each place between two tabs (section "Reorder tabs"), and a "New tab" zone at the top right of the pane area. A release on a zone opens the browser pane there. Escape hides the zones, and the release then drops nothing.
  - Buttons in the stock button row: "Open in a split pane" splits the pane of the floating preview (beside it when the pane is wider than tall, else under it), and "Move to a new tab". Both work with one tab and one pane.
- A drop on a side of a pane splits that pane in half. A drop on a tab puts the pane at the right edge of that tab, with an equal share of the width. The split rules stay: 12 panes for each tab, 200 x 140 px minimum. A drop that breaks them shows a message and changes nothing.
- The header of a browser pane is its drag handle, with the same zones. The pane keeps its id, so a move inside its tab keeps its view mounted.
- Ways out: "Back to floating preview" closes the pane, and the page shows in the floating preview of the chat pane of that thread. Where the tab has no chat pane of the thread, the pane itself becomes that chat pane. "Close browser pane" and the fork's close key close the pane. No way out closes the browser tab of the thread: no `preview.close` goes to the server.
- An artifact link of a thread that has a browser pane in the current tab shows in that pane: the tab opens in the background and becomes the active browser tab of the thread. No floating preview and no right panel opens.
- The pane is part of the saved layout: a leaf with `view: "browser"`. A layout of an older build has no such field and loads as it is. A build without this feature reads such a leaf as a chat pane.
- Where the client has no desktop browser (a plain web browser), and with the switch off, such a pane shows the chat of its thread.

The model, and what it does to the rules for two panes of one thread:

- `PaneTarget` is not changed. A leaf keeps its server thread and gets the optional field `view: "browser"` (`PaneLeaf` in `paneTree.ts`). So the URL, the sidebar highlight, the tab title, the project of a new pane and the saved layout need no second kind of target.
- A browser pane owns no thread. `findCollidingLeaf` and the layout load skip it, so the chat of a thread opens beside its browser pane with "mirror panes" on or off.
- A leaf that gets a new target shows a chat (`setLeafTarget` drops the view). So a draft that takes the place of a thread never shows as a browser.
- Route sync, rule 5 (`followRoute`): a focused browser pane keeps its page. The route of its own thread changes nothing. A route to another thread (a click in the sidebar, the thread keys) opens in the chat pane that had focus last, and that pane takes focus. Only where the tab has no chat pane does the browser pane itself show the thread as a chat.
- Focus on a browser pane moves the URL to its thread, so the sidebar shows that thread as open.
- The settle watch skips a browser pane: a merge does not free it, and a thread that only a browser pane shows is not watched.
- A browser pane alone in its tab is not the stock layout (`isMultiLayout`), so the tab bar shows.
- Only one webview exists for a browser tab. A browser pane closes the floating preview of the page it shows, at the moment it opens and for as long as it is mounted. When the right panel of a chat pane of the same thread shows the same page, the panel keeps it and the pane shows one line with the button "Show it here", which closes that panel.

Decisions that Dale may want to change:

- The large size applies to the floating preview of an artifact link only. A floating preview that an agent or the stock button opens keeps the stock size. The grip applies to each floating preview.
- 70% width, a shape of 1 to 1.25, and a page of at least 390 px.
- "Back to floating preview" turns the browser pane into the chat pane when no chat pane of the thread is in the tab. The other choice is to close it and show nothing.
- The stock button of the address row that floats a tab does nothing in a browser pane, because the pane closes that floating preview again. The header button is the way.
- The zones show only when the pointer leaves the pane of the floating preview. To split that same pane, use the button.

Code:

- `floatingPreviewSize.ts` (sizes, the write to the stock store), `FloatingPreviewExtras.tsx` (the element in the stock button row: size rule, grip, buttons, pointer listeners on the stock handle), `floatingPreview.css`.
- `paneBrowserLayout.ts` (pure layout functions: place, move, close, refusal), `paneBrowserActions.ts` (the actions on the stores), `BrowserPane.tsx`, `paneDropZones.ts` (pure geometry), `paneDrag.ts` (the drag in progress), `PaneDropOverlay.tsx`.
- Changed fork files: `paneTree.ts` (`view`, `insertLeaf`, `appendLeaf`), `paneRouteSync.ts` (rule 5), `paneStore.ts` (`replaceLayout`), `paneSettleWatch.ts`, `PaneCell.tsx`, `PaneHost.tsx`, `PaneTabBar.tsx` (a globe icon), `paneFocusMemory.ts`, `openArtifactLink.ts`, `artifactLinks.ts`.
- Upstream edit: set `r8-browser-pane`, 2 hunks in `apps/web/src/components/preview/ThreadPreviewMiniPlayer.tsx`: the import, and `<FloatingPreviewExtras threadRef={threadRef} miniPlayer={miniPlayer} />` after the stock `{pillActions}`. The element renders nothing for a device preview, and nothing with both switches off.
- Checks: `paneBrowserLayout.test.ts`, `paneDropZones.test.ts`, `floatingPreviewSize.test.ts` (the sizes against the stock layout function, the write to the stock store), and new cases in `paneTree.test.ts`, `paneRouteSync.test.ts`, `paneSettleWatch.test.ts`, `artifactLinks.test.ts`, `readoutSettings.test.ts`. `browserPane.browser.test.tsx` runs the app with a real mouse (CDP input) and stand-ins for the two questions about the desktop bridge: the large first size in a pane and the page size, the grip and a resize by it, the stock size with the switch off, the zones for each side, a tab and a new tab, Escape, a drop that splits a pane, the two buttons, the way back, a move by the header to a tab and to a side, the close with no `preview.close`, the link that shows in the pane, the one-pane case, and the chat in a client with no desktop browser.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/paneBrowserLayout.test.ts src/panes/paneDropZones.test.ts src/panes/floatingPreviewSize.test.ts src/panes/paneTree.test.ts src/panes/paneRouteSync.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/browserPane.browser.test.tsx --no-file-parallelism)
```

Rebase check:

1. `ThreadPreviewMiniPlayer.tsx`: the drag handle must still be a `div` child of `[data-preview-mini-player]` that holds the button row, and the resize handles must still be `[data-preview-mini-player-resize="<direction>"]`. The browser test fails when one of these changes.
2. `browserSurfaceStore.ts`: `claim` must still take `fitSourceContent`, and `fittedSourceContent` must still give both the source size of the floating preview (`useBrowserMiniPlayerSource`) and the page size (`HostedBrowserWebview.tsx`, `resolveFittedBrowserViewport`). `floatingPreviewSize.test.ts` fails when the store rule changes.
3. `PreviewPanel` must still take `mode="embedded"`, `threadRef` and `visible`, and show the active tab with no `tabId`.
4. The webview layers must still be under 60 (`PREVIEW_MINI_PLAYER_WEBVIEW_Z_INDEX` is 48), or the drop zones are behind a page.
5. When upstream adds a larger or free-shape floating preview, or a browser in the main area, remove the matching part.

Limits:

- A resize keeps the shape, as in stock. The frame has no free width and height.
- The fork does not keep a size after the floating preview closes. The next artifact link starts at 70% again.
- The zones are measured when the drag starts.
- A browser pane shows the active browser tab of its thread. It has no tab strip of its own: the stock tab strip is part of the right panel.
- A press on the page of a browser pane does not move the pane focus, because the page is a webview outside the pane's element. A press on its header or its address row does.
- The close key on a browser pane that is the last pane of the last tab does nothing, as for a chat pane. The header buttons work there.
- A browser pane whose thread is deleted stays, with the title "Thread".
- A chat pane moves with the same zones: see "Drag a chat pane".

Not verified: this work was built on Linux, where the Electron app does not run. No `<webview>` showed a page, so these were read in the stock code only: that the page reflows to the size that the fork writes, that the grip and the drop zones are above the page layer, that pointer capture keeps a drag alive over a page, and that the stock browser view fills a pane. In the tests the browser pane shows the stock line "Preview is only available in the T3 Code desktop app." in place of the browser view. Also not run: a real server, a claude.ai page, a second window, a touch screen, and a pane layout of more than three panes during a drag. `panes.browser.test.tsx` has one test of 12 panes that reached its 15 s limit on 2026-11-20 while the box load was 25 on 16 cores. It reached the same limit on the base commit `226a1eec64` in the same minute.

## Drag a chat pane

Dale asked on 2026-11-20: "add drag a chat pane". The panes move "just how vscode windows work" (section "Browser pane"). One switch, on by default, in `t3code-fork:readouts:v1`: "Drag panes to move them" (`dragPanes`). With the switch off no pane header drags, the header of a browser pane included. One tab with one pane is the stock layout, and nothing drags there.

What it does:

- A press on the free area of a chat pane header and a move of 6 px or more starts a drag. The free area is each part of `[data-chat-header]` that is not a button, a link, an input or the title editor. A press with no move stays a click, and a press on a header control keeps its own behavior.
- The zones, the overlay and the drop rules are those of a browser pane: a side of another pane (split on that side), a tab of the tab strip (the pane goes to the right edge of that tab), a place between two tabs (a new tab there, section "Reorder tabs"), and the "New tab" zone. A drop on the pane itself changes nothing. Escape hides the zones, and the release then drops nothing. A drop that breaks a split rule shows "Can't move the pane there" and changes nothing.
- A pane alone in its tab moves to another tab, and its empty tab closes. A move of such a pane to the "New tab" zone changes nothing. A drop of such a pane between two tabs moves its tab there.
- The pane keeps its id, its thread or draft, its typed text and its DOM focus. `PaneHost` renders the cells of the active tab as one flat list keyed by pane id, so the chat view stays mounted through a move inside its tab and through a move to another tab: the browser test checks that the composer is the same element.
- Where the tab of the drop already has a pane that owns the thread (each thread with "Mirror panes" off, and a draft always), the moved pane closes, and that tab shows with focus on its own pane of the thread. One tab never shows two panes of one draft.
- The header shows the grab cursor, and keeps 1.25rem free after the title, so a long title leaves a place to take hold.

Decisions that Dale may want to change:

- The handle is the whole free area of the header, not a grip icon. A VS Code tab drags by its whole surface, a grip adds an element to the stock header, and in multi mode the pane header does not drag the window ("Known differences", item 1), so the area is free.
- A separate switch, not part of "Browser panes". A chat pane drag works in a plain web browser, where browser panes are not available, and "Browser panes" reads as a switch for the browser view.
- The switch also turns off the header drag of a browser pane. The floating preview drag stays with "Browser panes".
- A move to a tab that has a pane of the same thread closes the moved pane, by the rule of "Mirror panes". The other choice is to refuse the drop.

How:

- `paneChatMove.ts` (pure: `moveChatLeaf`, the same-thread rule on top of `moveLeaf`), `paneChatDrag.ts` (the handle test, the window pointer listeners, the move on the stores).
- `PaneCell.tsx` (fork-owned) calls `pressChatPaneHeader` from its pointer-down handler in capture phase, and prevents the default of the mouse press on the handle, so the composer keeps focus and no text gets selected. The pointer is captured on the header only after the drag arms, to keep the drag alive over a browser pane page.
- Changed fork files: `PaneCell.tsx` (`data-pane-draggable`), `BrowserPane.tsx` (the switch), `paneBrowserActions.ts` (`showDropRefusal` takes a title), `panes.css` (cursor, room after the title), `readoutSettings.ts`, `readoutSettingsSearch.ts`, `ReadoutSettingsRows.tsx`.
- Upstream edit: none. The capture-phase handler on the fork-owned cell made a hunk in `ChatHeader.tsx` unnecessary.
- Checks: `paneChatMove.test.ts` (each side, a tab, a new tab, the empty tab, no-op drops, the same-thread rule with mirror on and off, drafts, a browser pane of the thread), a case in `readoutSettings.test.ts`. `paneChatDrag.browser.test.tsx` runs the app with a real mouse (CDP input): a move to a side and under a pane with the same composer element, its text and its focus, a move to a new tab and back to a tab that closes the empty tab, a draft pane, Escape, a press with no move, a press and a click on the title button, the switch off, and one pane.

````sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/paneChatMove.test.ts src/panes/readoutSettings.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/paneChatDrag.browser.test.tsx --no-file-parallelism)
## Menu bar count and finish sound

Dale asked on 2026-11-20: "menu bar make number for how many unread finished threads. make you able to turn it off. also sound notification when something becomes done off by defaults". Two switches: "Show unread finished threads in the menu bar" (`menuBarUnread`, on by default) and "Play a sound when a thread finishes" (`finishSound`, off by default). With both off, the client watches nothing, makes no bridge call and makes no audio context.

What "unread finished" is:

- Stock has two counts. The dock badge (`setNotificationBadge` in `ThreadNotificationCoordinator.tsx`) counts the desktop notifications that are still open: approvals, questions and completions, and only while desktop notifications are on. The sidebar marks a row "Done" when the row status is `ready` and `hasUnseenCompletion` is true: the latest run completed after the last visit of the thread (`Sidebar.logic.ts`, the same rule as the unread dot of a closed folder).
- The menu bar number uses the sidebar rule, through the stock functions, with no rule of its own (`isUnreadFinished` in `apps/web/src/panes/finishedThreads.ts`). It counts the threads of the stock navigation list (`navigationThreadShellsAtom`): every enabled environment, no archived thread, no hidden thread, no subagent thread that shows under its parent. A visit takes the thread out of the count at once.

Menu bar item (Mac app only):

- The item shows a template icon (a ring with a T, drawn in code at 18 and 36 px in `apps/desktop/src/ipc/methods/forkMenuBar.ts`) and the count beside it, or `99+`. macOS draws a template image in the color of the menu bar text, so it fits a light and a dark bar.
- With zero, the item shows the icon with no number, and a click shows the app window. The item stays so that it does not appear and leave at each finish. The switch removes it.
- With a count, a click opens a menu: "Show Tutor3", then the 10 newest unread finished threads by title (60 characters at most), then "N more in Tutor3" when more exist. A pick shows the window and opens the thread in the focused pane.
- The renderer sends `{ count, threads }` over the optional bridge method `setMenuBarUnread` only when the answer changes, and `null` when the switch turns off. The main process owns the one `Tray` (`forkMenuBarMethod.ts`). It ignores the call off macOS, and the renderer makes no call in a browser or off macOS. A pick reaches the renderer as the menu action `fork-open-thread:<thread key>`. When the renderer that sent the count goes away (the window closes, which leaves the Mac app running, or the renderer crashes), the item stays and shows the icon with no number until a renderer sends again.

Sound:

- Two soft sine notes (E5, then A5 after 90 ms), 0.3 s each, made with Web Audio (`finishSound.ts`). No audio file. It works in a browser and in the desktop app.
- It plays at the event of the stock "Thread completed" notification: the stock gate `createThreadNotificationGate` decides it. So a stopped turn, a snoozed thread, a thread that finished while the app was closed, and a monitor wake inside its grace stay silent, as in stock.
- No sound for the thread of the route (the focused pane) while the window shows and has focus: the user sees it finish.
- No sound while the stock notification sound is on (Settings > Notifications), so one finish never plays two sounds.
- Threads that finish within 0.4 s share one sound.
- A browser plays no audio before the first click or key on the page. The first one after the switch turns on unlocks the sound.
- The audio context sleeps (`suspend`) 0.5 s after each sound and resumes for the next one, so no audio thread runs between sounds. The switch off closes the context.

Code and checks:

- Upstream edit: set `r9-menubar-sound`, 6 hunks in 4 files. `apps/web/src/appInit.tsx`: the import, and `startFinishedThreadSignals(appAtomRegistry, router)`. `packages/contracts/src/ipc.ts`: the optional bridge method. `apps/desktop/src/preload.ts`: the bridge method (it uses the `MusicChannels` import of `r7-music-control-4`). `apps/desktop/src/ipc/DesktopIpcHandlers.ts`: the import, and the handler.
- Fork-owned files outside `apps/web/src/panes/`: `apps/desktop/src/ipc/methods/forkMenuBar.ts` (the controller, the menu and the icon, with no Electron import), `forkMenuBarMethod.ts` (the IPC method and the Electron `Tray`), `forkMenuBar.test.ts`, and one more channel name in `apps/desktop/src/ipc/forkChannels.ts`. The path list of rebase step 0 must name the three new files.
- Checks: `forkMenuBar.test.ts` in `apps/desktop` with a stand-in for `Tray` (the text, the menu, a long or empty title, one item for many counts, a click with and without unread threads, a pick, the removal and a new item, a renderer that goes away, the icon pixels). `finishedThreads.test.ts` (the sidebar rule, the local visit, the order and the limit of the menu, the menu action, the stock observation, the focused-thread rule). `finishSound.test.ts` (nothing before a click, one context, one sound for a burst, the sleep after a sound and the resume, the close). `finishedThreadSignals.browser.test.ts` with stand-ins for the bridge and the audio context: the count reaches the bridge, a visit and an update with no change, a pick opens the thread, the switch removes the item; one sound for two threads, none for the focused thread, none with the switch off, and the switch off closes the audio context.

```sh
(cd apps/desktop && pnpm exec vp test run src/ipc/methods/forkMenuBar.test.ts)
(cd apps/web && pnpm exec vp test run --project unit src/panes/finishedThreads.test.ts src/panes/finishSound.test.ts src/panes/readoutSettings.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/finishedThreadSignals.browser.test.ts --no-file-parallelism)
````

Rebase check:

1. The stock chat header must still carry `data-chat-header`, and its controls must still be buttons, links or inputs. A new control of another kind becomes part of the handle.
2. The header must still keep its title in a `.flex-1` child, for the free room after the title.
3. `PaneHost` must still render the cells as one flat list keyed by pane id, or a move remounts the chat view. The browser test fails then.

Not verified: the Electron app (built on Linux), a touch screen, a drag over a browser pane page, and a real server.

## Context breakdown

Dale asked on 2026-11-20: "context breakdown on hover/click", after a look at the `/context` view of the Claude Code app (system prompt, tools, memory files, messages, free space). The switch is "Show a context breakdown", on by default (`showContextBreakdown` in `t3code-fork:readouts:v1`). Off: the stock "Context" row with its stock tooltip.

What stock `v0.1.10` shows: one readout of the context, the "Context" row of the thread details card (`ThreadDetailsContext` in `ThreadDetailsUsage.tsx`). Its item "Context window" is off by default in the thread details items (Settings, Appearance, or a right-click on the card). The tooltip of the row gives the percent, the token count, the limit and the auto-compaction point.

What a stock server sends that a breakdown can use (see also "Token use of running work"):

- `tokenUsage` on each provider turn: the context size of the latest model request of that turn (`usedTokens`), the limit, and for some providers input, cached input, output and reasoning tokens of that request.
- A compaction item with `afterTokenCount` when the provider reports the size after a compaction.
- No size for the system prompt, the tools, memory files, a message, a tool call or a tool result.

What the fork shows (`apps/web/src/panes/ContextBreakdown.tsx`, rules in `contextBreakdownShares.ts`): a hover (150 ms) or a click on the row opens a popover in the place of the stock tooltip, with the stock popover look and theme tokens only.

- The total and the limit (`100k / 200k`), one bar, and `50% used · 100k free (50%)`. With no limit from the provider: the total and "The provider reports no limit." The auto-compaction line of the stock tooltip when the provider sends a threshold.
- "Growth by turn": the context of the active provider conversation, split by the turn that added each share. The share of a turn is its report minus the report before it. A turn with no report gives its growth to the next turn that has one ("Turns 2 to 3"). After a compaction with a reported size, the list starts again at "Kept by the compaction". Where the context got smaller with no reported size (a compaction with no size, a revert), the list starts again at "Up to turn N". The first share holds the system prompt, the tools and memory files too. Each line names the first user message of its turn when the client has it. The popover shows at most six lines: the newest five shares and one "Earlier turns" line for the rest. The bar has one segment for each line.
- "Latest model request": input read from the cache, new input and output of the latest request, and the reasoning share of the output. This section shows only when input and output of the report sum to the total.
- A note: each number is a report of the provider, and the server sends no size for the system prompt, the tools, memory files or tool results.

All numbers are real reports. There is no estimate. A split by kind (system prompt, tools, messages, tool results) from the text size of the timeline items was not built: the client has no text for the system prompt, the tools and memory files, and these are often the largest part. Scaled to the real total, their tokens would show as message tokens. The split by turn is exact for the active provider conversation.

The breakdown shows no split by turn when the reports of the turns do not sum to the total of the row. This happens for a total that a handoff or a fork carried in, and for a thread that the client has no detail of yet. The popover then says so and shows the total and the free share only.

Where it works: each provider that sends `tokenUsage` (Claude and Codex adapters in stock), in each pane (the pane reads its own thread through `usePaneThreadRef`) and with one pane, and for a thread of a remote stock server, because it reads only the thread detail that the client already holds (`environmentThreadDetails.quietThreadAtom`). It makes no request. The structure atom keeps its value while text streams, so an open popover does not render again for each word.

Code and checks:

- Upstream edit: set `r9-context-breakdown`, 2 hunks in `apps/web/src/components/chat/ThreadDetailsUsage.tsx`: the import, and `<UsageRow label={gt("Context", ...)}` becomes `<ContextBreakdownRow row={UsageRow} usage={usage} label={gt("Context", ...)}` (before `v0.1.11` the label was the plain string `"Context"`). The fork gets the stock row component and renders it unchanged inside its trigger, with `inert`, so the stock tooltip never opens under the popover.
- Checks: `contextBreakdownShares.test.ts` (the shares sum to the total, a turn with no report, a compaction with and without a size, a retired provider conversation, a total that the turns do not give, no limit, the split of the latest request, the "Earlier turns" line). `contextBreakdown.browser.test.tsx`: the popover on hover and on click, the stock row and tooltip with the switch off, and in the app with the fake server, two token reports of an open thread give "Turn 1" and "Turn 2" lines.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/contextBreakdownShares.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/contextBreakdown.browser.test.tsx --no-file-parallelism)
```

Rebase check: the anchors `import { ThreadDetailsSection } from "./ThreadDetailsSection";` and `<UsageRow` followed by `label={gt("Context", { $context: "context window row label" })}` in `ThreadDetailsUsage.tsx`. `UsageRow` must keep its props (`StockUsageRowProps` in `ContextBreakdown.tsx` copies them) and its subgrid of three columns. `OrchestrationV2ProviderTurn.tokenUsage`, the compaction item's `afterTokenCount` and `quietThreadAtom` must keep their shapes. When upstream sends a size of each kind (as the `/context` view of Claude Code has it), show that in place of the split by turn.

Not verified: a real provider, a real server, a remote stock server, the packaged Electron app, and a thread in a split pane (the browser test opens the app with one pane). The Replay provider of the dev stack sends no token report, so no dev stack check was run.

1. `resolveSidebarRowStatus`, `hasUnseenCompletion` and `resolveThreadLastVisitedAt` in `Sidebar.logic.ts` must still be the rule of the "Done" mark. If upstream changes that rule, the count follows it, which is the intent.
2. `createThreadNotificationGate` and `isSnoozedForNotification` in `ThreadNotificationCoordinator.logic.ts` must keep their signatures, and `finishObservation` must still read a thread as the stock coordinator does.
3. `DesktopWindow.dispatchMenuAction` must still take `{ reveal: true }`, and the renderer must still ignore an unknown menu action.
4. When upstream adds a menu bar item or a sound of its own, remove the matching part.

Not verified: this work was built on Linux, where the Electron app does not run and no macOS menu bar exists. Not seen: the `Tray` in a real menu bar, the look of the icon at 1x and 2x in a light and a dark bar, the count text beside it, the menu and a pick that opens a thread, and the sound through real speakers (in the desktop app and in a browser). No real server and no real provider turn ran.

## Selection to input

Dale asked on 2026-11-20: "when selecting text it auto fills the input field placeholder if input empty and can tab to use or right click and fill input/append to input to do same thing". The switch is "Offer selected text to the input", on by default (`selectionToInput` in `t3code-fork:readouts:v1`). Off: the stock placeholder, the stock Tab key and the stock context menu.

What it does (`apps/web/src/panes/useSelectionInputOffer.ts`, rules in `selectionToInput.ts`):

- Select text in a chat. While the input of that chat is empty, its placeholder shows the text on one line in quotes (at most 100 characters) and the stock "⇥ Tab" hint. The full text is kept.
- Tab puts the full text in the input and moves the caret there. This works with focus in the chat or in the input. A click in the input keeps the offer, so a click and then Tab works too. Tab stays stock while focus is in another field, while a dialog or a menu is open, and while the input has text.
- A right click on the selection opens a menu: "Fill input" (replaces the text of the input), "Append to input" (adds the text on a new line) and "Copy". The menu is the stock context menu: native in the desktop app, the DOM menu in a browser. A right click on a link keeps the stock link menu.
- The selection goes to the input of its own chat: the pane cell, or the side chat, that holds it. Text in the sidebar, in a field or in the input itself gives no offer. Text typed in the input, Escape, and a new empty selection end the offer.
- No offer while the input answers an approval or a question, needs a project, has no provider, or holds speech input. The menu items are disabled then.
- A selection made while the input of the same chat has focus gives no offer: a new placeholder makes the focused editor write its caret back over the selection (the stock Ctrl+C test in `panes.browser.test.tsx` showed this). A press on chat text takes the focus from the input, so a mouse selection is not affected.

Code and checks:

- Upstream edit: set `r10-selection-input`, 4 hunks in `apps/web/src/components/chat/ChatComposer.tsx`: the import, one `useSelectionInputOffer` call after the stock `offeredPromptSuggestion`, the offer before the prompt suggestion in the placeholder expression, and the Tab hint for either. The fork edits the input through the stock `applyPromptReplacementStable`, the edit that the stock Tab key of a prompt suggestion uses.
- Checks: `selectionToInput.test.ts` (the preview, the appended text). `selectionToInput.browser.test.tsx`: in the app with the fake server, a selection gives the placeholder and the hint, Tab fills the input, the menu appends and fills; with the switch off, the stock placeholder and no menu. A dev stack check with real pointer drags in headless Chromium: placeholder, Tab, focus, the menu and Append.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/selectionToInput.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/selectionToInput.browser.test.tsx --no-file-parallelism)
```

Rebase check: the anchors `import { usePromptSuggestion } from "./usePromptSuggestion";`, `? promptSuggestion` followed by `: null;`, `(offeredPromptSuggestion ?? m(DEFAULT_COMPOSER_PLACEHOLDER))` and `offeredPromptSuggestion !== null ? (` in `ChatComposer.tsx`. `applyPromptReplacement` must keep its first three parameters, `composerFormRef` must stay on the form with `data-chat-composer-form`, and the pane cell must keep `data-splitpane-cell`.

Not verified: the native context menu of the Mac app, a split pane in the dev stack (the second pane had no thread), a side chat, and a real provider.

## Input history after a reconnect

Dale reported on 2026-11-23: "hitting up arrow in dev box when coming back to get input history doesn't always work". A diagnosis with five parallel investigators and a judge found three causes. Two are stock behavior and one was fork behavior.

1. Stock, the main cause on `dale-nix`. The Up key recalls only the user messages of the rows that the client holds. When the client subscribes to a thread again (the thread was closed, or a laptop sleep dropped the remote connection), the server sends one fresh snapshot when the replay is long. The client replaces the thread with it (`boundedSnapshotProjection` in `packages/client-runtime/src/state/threads.ts`), and the snapshot holds the latest rows only (`threadHistoryPaging.ts`: 75 work rows when no user turn fits). In a long turn the user's message is outside it, so Up recalls nothing. A local server mostly keeps its connection through a sleep, and a remote one does not.
2. Fork. A click on chat text focuses the chat scroller (stock `tabIndex={-1}`). The pane focus memory recorded that element, and a return to the pane (pane key, tab, sidebar row) focused the scroller again. Up then scrolled the chat. Letters still go to the input through the stock type-to-focus, so the input looked focused.
3. Stock. A recalled message stays in the draft, but the position of the recall lives in the mounted composer. After a remount the input holds text with no position, and Up does nothing.

The fix:

- `apps/web/src/panes/promptHistoryMemory.ts` records the user messages of each thread's timeline while the client holds them (at most 200 for each thread and 300 threads, in memory for the life of the window). At the Up key, the history is the timeline plus the recorded messages that it lost, in time order. Messages that this window never saw (sent from another device while the thread was not open here) are not in it.
- The same file gives a recall with no position a start at the text of the input. The stock step finds an entry by its text when no id matches, so a recalled message continues the recall. Text that matches no message changes nothing.
- `paneFocusMemory.ts` does not record the chat scroller, or an element with a negative `tabIndex` inside it (on `v0.1.11` a click focuses the assistant message body), when a click focused it. A return to the pane then focuses the input. A focus on the scroller by F6 (`:focus-visible`) is still recorded.

The switch "Keep input history after a reconnect" (`keepPromptHistory`, on) turns off the first two parts. The focus part has no switch: it applies only to the fork's own focus restore.

Code and checks:

- Upstream edit: set `r11-prompt-history`, 3 hunks in `ChatComposer.tsx` (the import, `useRememberPromptHistory(composerDraftTarget, promptHistoryEntries)` before the key handler, and `promptHistoryEntries: promptHistoryFor(...)` in its input) and 2 hunks in `composerCommandKey.ts` (the import, and `resumePromptHistoryPosition(...)` around the start position).
- Checks: `promptHistoryMemory.test.ts` (messages that a fresh snapshot removed come back in time order, a new message after them, one thread does not see another; a recalled text continues the recall, typed text does not, the switch). `promptHistory.browser.test.tsx`: two panes, a click on chat text in the first, the pane keys away and back, Up recalls the message. It fails without the focus change.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/promptHistoryMemory.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/promptHistory.browser.test.tsx --no-file-parallelism)
```

Rebase check: the anchors `import { composerCommandKeyHandler } from "./composerCommandKey";`, the `onComposerCommandKey` line, and `promptHistoryEntries,` followed by `promptHistoryPositionRef,` in `ChatComposer.tsx`; `import { composerTargetKey } from "../../composerDraftStore";` and the `const position = recalled?.targetKey === ...` line in `composerCommandKey.ts`. The stock `findActive` must still match an entry by its text. When upstream loads earlier history at the Up key, remove the memory part.

Not verified: a real reconnect to `dale-nix` after a sleep. The fake server of the tests sends no bounded snapshot, so the memory part ran in unit tests only.

## Drag right-panel tabs

Dale asked on 2026-11-23: "browser tabs side tabs artifact preview PIP should all be able to be dragged to new tabs by dragging it to top bar or its own split pane". A minute later, about the floating preview of a claude.ai artifact, which shows only the page: "also should be able to move it around". No new switch. The tab drag and the drop on the tab strip are part of "Browser panes" (`browserPanes`). The hold bar is part of "Larger floating preview with a resize grip" (`largeFloatingPreview`). With both off, the right panel and the floating preview are stock.

What stock `v0.1.10` does (read in the code on 2026-11-23):

- The tabs of the right panel reorder by a drag (`SortableTabList` in `RightPanelTabs.tsx`, dnd-kit, a move of 6 px starts it). The drag stays on the strip: `restrictToHorizontalAxis` and `restrictToFirstScrollableAncestor`. A release outside the strip can still reorder: the drop is measured on the clamped tab, so the tab can go to the end of the strip.
- A side chat is a thread with `lineage.sideChat`. Stock shows it as a tab of its parent (`resolveThreadOpenRoute` in `lib/sideChatPane.ts` sends a link to the parent and opens that tab), but the route of a side chat thread is not redirected. `ChatView` shows a side chat in full when it is not embedded, with a link back to its parent.
- The move handle of the floating preview is a dot of 12 px at the top right (section "Browser pane").

What the fork adds:

- A browser tab and a side chat tab of the right panel of a chat pane drag. While the pointer is in the panel, the drag is the stock reorder. When the pointer leaves the panel, the drop zones of "Browser pane" show: a side of each pane (the pane of the panel too), each tab of the tab strip, and "New tab". A press with no move stays a click.
- A browser tab dropped on a zone opens a browser pane of the thread there, with that tab as the active browser tab of the thread (`openBrowserPane`, as for the floating preview). When the panel showed that tab, the panel closes, because one webview exists for a tab. The tab stays in the strip of the panel: open the panel again to show it there, and the browser pane shows "Show it here".
- A side chat tab dropped on a zone opens a chat pane of the side chat thread there, and the tab leaves the panel of the parent (store only: the side chat is not deleted). The stock ways to open a side chat (the thread relationships control, the parent link) bring it back as a tab. Where the tab of the drop has a pane of the side chat ("Mirror panes" off), that pane takes focus and no pane is added.
- A browser tab drags out only in the desktop app, because a browser pane needs it. A side chat tab drags out in every client, the web client too.
- Escape hides the zones, and the release then does nothing: no pane, and no stock reorder. A release outside the panel with no zone also skips the stock reorder.
- In the stock layout (one tab, one pane) the "New tab" zone is at the top right of the pane area, which is part of the right panel. For a tab drag the zone moves to the left of the panel, with the same inset.
- Every drag of the fork (the floating preview, a browser pane header, a chat pane header, a right-panel tab): a drop on the empty end of the tab strip, right of the last tab, opens a new tab after the last tab, as in VS Code. The zone shows as a box from the last tab to the end of the tab list, as tall as the bar. A drop on a tab keeps its meaning. The "New tab" zone stays, because the tab strip is hidden with one tab and one pane. With so many tabs that the list scrolls, there is no empty end.
- The floating preview gets a hold bar: the stock move handle is 16 px high, as wide as the frame, on its top edge and outside the page, in the popover color with a short line in the middle (the action color under the pointer). A press on it is the stock move inside the pane, with the stock bounds. A drag out of the pane shows the drop zones. The pointer on the bar shows the stock button row, and its buttons keep their clicks. The top resize handle is 8 px, from 2 px above the edge, so it does not cover the bar.

Decisions that Dale may want to change:

- No new switch: the tab drag is part of "Browser panes", and the hold bar is part of "Larger floating preview with a resize grip".
- A dropped browser tab stays in the strip of the panel. The other choice is to close the tab in the panel, which in stock closes the browser tab of the thread.
- A dropped side chat leaves the panel. The other choice is to keep its tab, which shows the same thread in two places.
- Only browser tabs and side chat tabs drag out. The files, diff, terminal, pull request and device tabs do not: a pane shows a chat or a browser only, and each other view would be a new pane kind.
- A tab of a new thread (a draft) does not drag out: its pane has no server thread.
- The hold bar is outside the frame, above the page, and not over the top of the page. In a pane whose floating preview is at the top limit (12 px), up to 4 px of the bar can be outside the chat area.

How:

- `panelTabPane.ts` (pure: which tab drags and what it becomes, `placeChatPane`), `panelTabDrag.ts` (the hook for the tab attribute, the press on a tab, the drop, the test for the stock reorder).
- `PaneCell.tsx` calls `pressRightPanelTab` from its pointer-down handler in capture phase, as for the chat pane header. The press reads the surface by the tab's `data-right-panel-surface` and the right panel store of the pane's thread, and the panel box by `[data-preview-panel-mode]`.
- `paneDrag.ts`: a drag source `panel-tab` that arms when the pointer leaves the panel, the empty end of the tab strip (`[data-pane-tablist]` in `PaneTabBar.tsx`), the one pane of the stock layout as a zone (its cell has no box), and the "New tab" zone beside the panel. `paneDropZones.ts`: `tabStripEndOf`, `newTabZoneBeside`, the end of the strip in `resolveDropZone`. `PaneDropOverlay.tsx` shows the box of the strip end.
- `floatingPreview.css`: the hold bar, under `data-preview-grip`.
- Changed fork files: `paneTree.ts` (`createChatLeaf`), `paneBrowserLayout.ts` (`tabOfDrop` exported), `ReadoutSettingsRows.tsx` and `readoutSettingsSearch.ts` (the descriptions of the two switches).
- Upstream edit: set `r12-panel-tab-drag`, 4 hunks in `apps/web/src/components/RightPanelTabs.tsx`: the import after `import { observeResize } from "~/lib/observeResize";`, `panelTabLeftPanel() ||` at the start of the stock test `if (!over || active.id === over.id) return;`, `const panelTabDragId = usePanelTabDragId(surface);` before the stock `useSortable` call of `RightPanelTab`, and `data-right-panel-surface={panelTabDragId}` after `data-active-tab={props.active}`. With "Browser panes" off, or outside a pane (the pull requests page), the attribute is undefined and React renders none.
- Checks: `panelTabPane.test.ts` (the tabs that drag, a side, a new tab, a tab with a pane of the thread with mirror on and off, a tab or a side at the pane limit, a gone pane), `paneDropZones.test.ts` (the strip end, the zone beside the panel). `panelTabDrag.browser.test.tsx` runs the app with a real mouse (CDP input) and the stand-ins of "Browser pane": a click and the stock reorder inside the panel, Escape outside with no reorder, a browser tab dropped on its own pane, a second Escape that cancels the stock drag and leaves the next stock reorder working, a side chat tab dropped on "New tab", the switch off, a chat pane header dropped on the empty end of the tab strip and back on a tab, and the hold bar (its box, the stock move, a real click on the close button of the row, the stock dot with the switch off). The tab tests fail on a tree without the hunks. The click test fails without the `z-index` of the bar.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/panelTabPane.test.ts src/panes/paneDropZones.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/panelTabDrag.browser.test.tsx --no-file-parallelism)
```

Rebase check:

1. `RightPanelTabs.tsx`: the tab must still be a `div` with `data-active-tab` that spreads the dnd-kit `listeners`, and `SortableTabList` must still reorder in `onDragEnd` with the test `if (!over || active.id === over.id) return;`. The fork's window listener must still see the release before the stock `onDragEnd` runs, and `onDragEnd` must still run in that same `pointerup` dispatch, because a timer clears the fork's flag after it: the Escape cases of the browser test fail when either changes.
2. `PreviewPanelShell.tsx` must still put `data-preview-panel-mode` on the box of the panel.
3. `ThreadPreviewMiniPlayer.tsx`: the move handle must still be the first `div` child of `[data-preview-mini-player]`, with the dot first and the button row second. The browser test fails when this changes.
4. When upstream adds a drag of a panel tab out of the panel, or a hold bar of its own, remove the matching part.

Limits:

- The zones are measured when the drag starts, as for the other drags.
- The dragged tab stays drawn in the strip, clamped by the stock reorder, while the pointer is outside the panel.
- The panel of a pane narrower than 720 px does not exist, so its tabs cannot drag (section "Right panel in a narrow pane").

Not verified: this work was built on Linux, where the Electron app does not run. No `<webview>` showed a page, so a drag over a page of a browser pane, and the bar above a real claude.ai page, were not seen. The side chat in the test is a fake side chat with no run of its own. A touch screen, the right panel as a sheet, and a maximized panel were not used.

## Live token use

Dale asked on 2026-11-23, with a screenshot of a thread that still worked: "while its working I want how many tokens its using". The screenshot showed three places. The fold line of the turn, "Worked for 3m 9s", had no tokens. The row of a workflow showed "Running 6.89m tokens 38m 23s" (section "Token use of running work"). The stock background work bar at the end of the chat, "Waiting · Apply the 50 findings ... 38m 24s Details Stop", had no tokens. This feature adds the tokens to the bar and to the fold line. It follows the switch "Show token use of running work" (`showWorkTokens`). With the switch off the bar and the fold line are stock. No new switch.

What the fork shows (`apps/web/src/panes/WorkTokenLabels.tsx`, rules in `workTokens.ts` and `turnTokens.ts`):

- In the background work bar, before its time: `6.89m tokens`. The number is the sum over the subagents that the bar lists, with the numbers of the subagent rows: the total that a workflow reports, or the context size of the thread of a `delegate_task` child. A command or a monitor runs no model and adds nothing. The bar shows no number when it lists no subagent, and when one listed subagent has no number (a subagent of Claude's own Agent tool, a task of a child thread), because the sum would then be too low. Like the group line of section "Token use of running work", the sum adds two kinds of count: the context size of a child thread and the total that a workflow reports. The label does not say which kind it holds. The bar finds the subagent of a task by the key that the stock bar uses for its turn item (`nativeItemId`, else `taskId`).
- In the fold line of the latest turn while background work runs: `Worked for 3m 9s · 12.4k tokens`. A stock client folds a turn only after its run settled (`deriveActiveVisualResponseRunIds` keeps the open run unfolded), so a "Worked for" line of a thread that still works is the latest run, settled, with background work that holds the thread. The line shows the number while the stock list of the bar (`deriveThreadPendingBackgroundTasks`) has a task that is not a pull request watch, or while the run is open. An older turn and a turn whose work ended show no number on the fold line. While the fold line shows the number, the footer of the turn leaves its token part out, so the number is in one place. When the work ends, the footer shows the number (section "Working time of a finished turn"), but only when "Show the working time of a finished turn" is on and the turn worked at least 10 seconds. Otherwise the number leaves the chat when the work ends.
- Beside the stock "Working for ..." label: the same number first, when the provider turns of the open run ended, then the context size as before: `· 12.4k tokens · 182k tokens in context`. While the provider turn of the main agent still runs, a stock server has no count yet, so the label shows the context size only.

Which number: the output tokens that the provider reported in `turnTokenUsage`, the main agent plus `otherUsage`, summed over the provider turns of the run and of each run that it continues (`continuedRunChain`). This is the number of the footer of a finished turn (`finishedTurnTokens`), so the fold line, the "Working for" label and the footer agree. It is the most honest count that a stock `v0.1.10` or `v0.1.11` server sends for a turn that still works. The other candidates:

- `tokenUsage` on a running provider turn is the context size of the latest model request, and its `outputTokens` is the output of that one request. It is not a sum over the turn. It stays in the "Working for" label as the context size, with the words "in context".
- A partial sum: the fork shows no number while a provider turn of the run is `pending` or `running`, because that turn has no count until it ends, and the sum would then be too low.

The tokens of the background work itself (the workflow) are in the bar, not in the fold line, because `turnTokenUsage` of the main agent does not count a workflow that runs after the turn.

Updates and cost: no timer. Each label reads a structure atom (`quietThreadAtom`, or the subagent map of section "Token use of running work") and selects one number or one string, so it renders again only when its number changes. The bar label reads the subagent map that the subagent rows read. So while the bar shows a working `delegate_task` child, the client keeps the detail subscription of that child thread, also when no row of it is in view. The fold line derives the stock pending task list only for the latest turn, and only when its run settled.

Code and checks:

- Upstream edit: set `r15-live-tokens`, 4 hunks in 2 files, each an import and one element: `<BackgroundWorkTokens ... />` before the time in the `actions` of `backgroundWorkNowItem` in `ThreadActivityBanners.tsx`, and `<LiveTurnTokens runId={row.runId} />` after `{row.label}` in `TurnFoldTimelineRow` in `MessagesTimeline.tsx`. The calls name stock locals only (`input.environmentId`, `input.threadId`, `input.tasks`, `input.turnItems`, `row.runId`).
- Checks: `turnTokens.test.ts` (the sum of a run that continues another, no number while a provider turn runs, the latest run and the latest open run, the fold rule: background work, an open run, an older turn, ended work). `workTokens.test.ts` (the bar sum, a command that adds nothing, a subagent with no number, a task that is not in the thread). `workTokens.browser.test.tsx`, extended with a turn that ends while a workflow still works: the bar label `310k tokens`, the fold line `· 12.4k tokens` with a footer that has no tokens, then, when the workflow ends, no fold number and the footer `· worked 3m 0s · 12.4k tokens`, and the switch.
- Rebase check: the anchors are the import of `BackgroundWorkDetails` and the start of the `actions` fragment in `ThreadActivityBanners.tsx`, the end of the import of `./timelineRowContext` and the `{row.label}` line of the fold row in `MessagesTimeline.tsx`. `deriveThreadPendingBackgroundTasks` (`ChatView.logic.ts`) and `isPullRequestWatchTask` must keep their arguments. When upstream folds an open run, or shows tokens in the bar, look at this feature again.
- Not verified: a real provider and a real server, the packaged Electron app, a remote stock `v0.1.10` server, a workflow of a real Claude turn, a fold line of a real thread with background work, and a bar with two or more subagents in the app. The bar rule finds a turn item only in the thread of the bar, so a task of a child thread gives no number.

## Tab keys from a browser page

- A focused browser page (desktop) takes every key press. The desktop app sends back only the keys on a list that the web client sets, and the stock list has no pane keys. So the tab keys did nothing while a browser page had focus.
- With 2+ tabs, the next, previous and jump tab keys are on the list (`panes/previewPaneKeys.ts`). The pane key scope runs each one as a menu action, and the desktop app gives the keyboard back to the app window first. With one tab the list is stock, so the page keeps those keys.
- Upstream edit: set `r16-browser-tab-keys`, 4 hunks in `ReopenClosedViewShortcut.tsx` (import, hook, list, effect dependency) and 1 in `apps/desktop/src/preview/Manager.ts` (`layout.*` joins the commands that call `host.focus()`).

## Thread artifacts

Dale asked on 2026-11-23 for the claude.ai artifacts of a thread in its details menu (the popover of the header button, and the inline card), so he can open one or copy its link. The switch is "List artifacts in the thread details", on by default (`showThreadArtifacts` in `t3code-fork:readouts:v1`). Off, or with no artifact, the section renders nothing and the details are stock.

- Place: a section "Artifacts" after "Lineage" and before "Usage", at full density and not on a draft, as Lineage is. It shows 5 rows, newest first, and "Show N more" adds 5. It is not an item of the stock "Choose what to show" list: those ids go into server-stored client settings.
- A click on a row opens the page as a chat link click does: `openArtifactLinkInApp` (section "Artifact links"), else the stock `useOpenLink`. A hover button copies the link. The tooltip shows the full URL and the publish description.
- Source: only the loaded items of the thread itself (`useTimelineVisibleTurnItems`, with inherited rows). Child threads and deferred work of a long turn are not read. The rules are pure functions in `apps/web/src/panes/threadArtifacts.ts`:
  - `Artifact`, `ArtifactData` and `ArtifactComments` calls with `input.url`. The `Artifact` actions `list`, `quickstart`, `read` and `open` do not count. A completed `delete` with no `path` removes the page. Only a later tool call that names the page brings it back. Agent text that names it does not, because the agent names a page in its report of the delete.
  - Artifact URLs in agent messages and subagent results. User messages, commands, file changes and thread reads do not count: they hold other threads' data or pasted text.
  - A URL is kept without hash, query and trailing slash, and only with an id of 8 or more characters, so placeholders such as `<id>` drop out.
- Server limit: a stock 0.1.10 server compacts the output of a tool call on the wire and drops the `url` and `title` of a publish (`outputOmitted: true`). A first publish has no `input.url`, so the section asks `getTurnItem` for the full item of completed publishes with no `input.url` and no `asset`. It asks once per `file_path`, for the newest publish of it, because a redeploy of the same file goes to the same page, and for at most 10 files, as the stock item inspector does (`panes/threadArtifactsQuery.ts`). It asks only while the section shows, and a settled answer stays in the stock query cache. Without that answer the page still lists when the agent wrote its URL.
- Title: the fetched publish title, else `input.title`, else the title that the app's browser recorded for the page, else the id.
- Upstream edit: set `r17-thread-artifacts`, 2 hunks in `ThreadDetailsPanel.tsx` (import, mount) and 1 in `ThreadDetailsCard.tsx` (density measure).

## Reorder tabs

Dale asked on 2026-11-23: "also need to be able to reorder tabs and panes". Panes already move (section "Drag a chat pane"). The tabs of the fork's tab bar now reorder too, as in VS Code. No new switch: the tab drag is part of "Drag panes to move them" (`dragPanes`). With the switch off no tab drags. One tab has nothing to reorder, and one tab with one pane shows no tab bar.

What it does:

- A press on a tab and a move of 6 px or more starts the drag (the slop of the pane drag). The tab follows the pointer along the strip, clamped to the first and the last tab. The other tabs move aside to show its place. The release puts the tab there.
- The tab passes another tab when its leading edge passes the center of that tab.
- A press with no move stays a click that activates the tab. A press on the close button closes the tab, and starts no drag. The middle button still closes.
- Escape puts the tabs back. The release that follows moves nothing and activates nothing.
- A tab that opens or closes during the drag cancels it as Escape does. A lost pointer capture does too. A move with no button held ends the drag, also after Escape.
- A wheel scroll of the strip during the drag keeps the dragged tab under the pointer, and the place follows it.
- The active tab stays active by id, also when another tab moves. The click that ends a drag is swallowed, so the dragged tab does not become active.
- The order is saved with the layout in `t3code-fork:panes:v1`.

A drop between two tabs (every drag of the fork: the floating preview, a browser pane header, a chat pane header, a right-panel tab):

- The place between two tabs, before the first tab and after the last tab is a zone. It covers the gap of 4 px and the outer quarter of each tab next to it, at most 24 px of a tab, and 8 px outside the first and the last tab. The overlay shows it as a vertical line of 4 px in the gap. The middle of a tab keeps its meaning: the pane goes into that tab.
- A drop there opens a new tab at that place with the pane, as the "New tab" zone does, and that tab becomes active. The "New tab" zone stays, and still opens its tab after the active tab. The empty end of the strip opens its tab after the last tab.
- A pane alone in its tab, dropped between two tabs, moves its tab there. A place next to its own tab changes nothing.
- The rules of the other drops stay: a new tab has no pane of the thread, so "Mirror panes" does not apply, and a new tab has no split rule. Escape cancels. One tab with one pane shows no tab strip, so no such zone.
- How: `PaneDrop` `new-tab` takes an optional `index` (a place in the tab list as measured when the drag starts, so a tab that opens or closes during the drag can shift it by one). `addTab` in `paneTree.ts` takes it, `placeLeaf` passes it, and `moveLeaf` turns it into `moveTab` for a pane alone in its tab, so `moveChatLeaf`, `placeChatPane` and `openBrowserPane` follow. `tabSlotOf` in `paneDropZones.ts` gives the zone, and `PaneDropOverlay.tsx` draws the line (`data-pane-drop-zone="tab-slot"`). Upstream edit: none.
- Checks: `paneDropZones.test.ts` (`tabSlotOf`: each gap, both ends, a narrow tab, the middle of a tab, the line, the order against a tab and the strip end), `paneBrowserLayout.test.ts`, `paneChatMove.test.ts`, `panelTabPane.test.ts` (an index, its bounds, the default, the active tab, a pane alone in its tab). `paneChatDrag.browser.test.tsx`: a chat pane header dropped in the gap between tab 1 and tab 2 becomes the second tab, and a drop on the middle of a tab still goes into that tab.

Decisions that Dale may want to change:

- The other tabs move aside with a 150 ms transform, none with reduced motion.
- A drop on the empty end of the strip used to open its tab after the active tab. It now opens it after the last tab, the same place as the line after the last tab.
- The zone between two tabs is cut from the outer quarter of each tab (at most 24 px), because the gap alone is 4 px wide.

How:

- `paneTree.ts`: `moveTab(layout, tabId, toIndex)` (pure, clamped, the same layout for no move). `paneStore.ts`: the `moveTab` action.
- `paneTabDrag.ts`: `pressPaneTab`, the window pointer listeners, the transforms set on the tab elements while the drag lasts (no React render per move), and the store move on release. `PaneTabBar.tsx` calls it from the tab's pointer-down handler, and the tab gets `select-none`.
- Changed fork files: `paneDrag.ts` (`DRAG_SLOP_PX` exported), `ReadoutSettingsRows.tsx` and `readoutSettingsSearch.ts` (the switch text).
- Upstream edit: none.
- Checks: `paneTree.test.ts` (`moveTab`: each direction, the bounds, no move, an unknown tab, the active tab), a case in `paneStore.test.ts` (the order is saved and the active tab kept). `paneTabDrag.browser.test.tsx` runs the app with a real mouse (CDP input): the third tab dragged to the first place with the other tabs moved aside, a press with no move that activates, the close button, Escape, the switch off, and one tab, a lost release after Escape, a tab that opens during the drag, and a scroll of the strip during the drag.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/paneTree.test.ts src/panes/paneStore.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/paneTabDrag.browser.test.tsx --no-file-parallelism)
```

Limits:

- The tab boxes are measured when the drag starts. A tab whose title or pane count changes during the drag keeps its old box until the release, so tabs can overlap for that time. The place is still a place in the same tab list.
- The list does not scroll by itself during the drag. A drag past the visible edge still reaches a place out of view, but the dragged tab is then clipped by the strip.
- A tab drag does not show the drop zones of the pane drag: a tab does not move into a pane.
- The places between tabs are measured when the drag starts, as the other zones. In a strip that scrolls, a tab out of view can still be a zone at its measured box, as for a drop on a tab.
- A keyboard way to move a tab is not added.

## Faded panes

Dale asked on 2026-11-25: in a tab with 2 or more panes, every pane except the focused one fades back, so the focused pane stands out. Setting "Fade panes without focus" (`fadeUnfocusedPanes`), on by default.

What it does:

- In a tab with 2 or more panes, each pane without focus shows behind a veil in the background color at 30% opacity. The text stays legible in both palettes. Measured from the Tutor tokens: dark ink text `#f5f5f5` on `#202020` becomes about `#b5b5b5`, light ink text `#202020` on white becomes about `#636363`.
- The veil changes in 120 ms when the focus moves, and at once with reduced motion. It never animates by itself. Hover does not change it.
- The veil takes no pointer event. A press on a faded pane acts there and focuses the pane, as before.
- One pane in a tab, and one tab with one pane, show no veil. With the switch off no pane fades.
- The focus ring of the focused pane stays (its own `::after`). The veil is the `::before` of the pane.
- The drop overlay of a drag is in a portal on the body, so it does not fade. Two panes of one thread (section "Mirror panes") fade by focus as two other panes do.
- The floating preview of a pane without focus does not fade. In the desktop app its page is a webview outside the pane that no veil can cover, so a faded frame would not match its page.

How:

- `PaneHost.tsx` sets `data-fade-panes` on the pane root, and `data-pane-faded="true"` on each pane without focus (`PaneCell.tsx`), when the switch is on and the tab has 2+ panes. A focus move renders only the two panes whose focus changed, as before.
- `panes.css` draws the veil. A pane is a stacking context (`contain: layout`), so the veil (z-index 100) covers the whole pane and its close button, and nothing outside the pane. In a pane without focus the floating preview (`[data-preview-mini-player]`) gets z-index 101. No stacking context lies between it and the pane, so it shows above the veil.
- Upstream edit: none.
- Checks: `readoutSettings.test.ts` (default, storage, search). `paneFadeRename.browser.test.tsx`: in a tab of 2 panes the pane without focus has the marker and a veil of 0.3, the focused pane has neither and keeps its ring, a press on the faded pane focuses it, the switch off shows no veil, and one pane shows none.

Limits:

- In the desktop app, a web page (a browser pane, a browser tab of the right panel, the page of a floating preview) is a stock webview layer outside the panes (z-index 30 and 48, `HostedBrowserWebview.tsx`). The veil cannot cover it, so in a pane without focus that page does not fade. Its header and the chat around it fade.
- Not checked in the packaged app, and not measured for GPU cost. The veil is one layer for each pane, with no animation at rest.

## Rename tabs

Dale asked on 2026-11-25: rename a tab of the tab bar. No switch: the tab bar shows only with 2+ tabs or 2+ panes, so one tab with one pane stays stock.

What it does:

- A double-click on a tab shows a field in the place of its label, with the label selected. Enter or a press elsewhere saves. Escape keeps the old name. The focus then goes back into the focused pane, as after a pane key: to the element it last focused, its covering terminal, its composer, its empty view or its browser box (Enter and Escape only). An Enter that confirms an IME candidate does not end the edit.
- A right click on a tab opens a menu with "Rename tab" and "Close tab" (the stock context menu: native in the desktop app, the stock fallback in a web browser). "Close tab" is off for the last tab.
- The name is trimmed and at most 40 characters. An empty name gives the tab its automatic label again (the title of its focused pane). A value saved unchanged keeps the name as it was. So the automatic label saved unchanged stays automatic and still follows the thread, also when the thread title changes while the field shows.
- A named tab shows its name in the tab bar and in the label of its close button ("Close tab <name>"). No other place lists tabs by label: the drop zones of a drag show "New tab" and the place between two tabs, and no "Move to tab" list exists.
- The double-click does not start a tab drag: each press has no move, so each is a click (section "Reorder tabs"). A double-click on the close button closes the tab and does not rename. While the field shows, a press on the tab starts no drag.
- No key and no command: a key would need a new upstream keybinding command.
- The name is saved with the layout in `t3code-fork:panes:v1`, as an optional `name` of the tab. A layout of an older build has no name and loads as it is. A name that is not text is dropped on load. A build without this feature ignores the field and drops it at its next save.

How:

- `paneTree.ts`: `renameTab(layout, tabId, name)` and `normalizeTabName`, and `sanitizeLayout` keeps a valid name. `paneStore.ts`: the `renameTab` action.
- `PaneTabBar.tsx`: the field (`PaneTabNameInput`), the double-click and the context menu. `returnFocusToFocusedPane` (`paneFocusInput.ts`) moves the focus back with the restore of `paneFocusMemory.ts`.
- Upstream edit: none.
- Checks: `paneTree.test.ts` (`renameTab`: set, trim, the maximum length, clear, the same name, an unknown tab, a split keeps it, a stored layout with no name and with a name that is not text), a case in `paneStore.test.ts` (the name is saved). `paneFadeRename.browser.test.tsx` with a real mouse: a double-click, typing and Enter, an IME Enter, Escape, an empty name, the automatic label saved unchanged, a press elsewhere, "Rename tab" from the context menu, a thread title that changes during the edit, and the focus back in an empty pane.

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/paneTree.test.ts src/panes/paneStore.test.ts src/panes/readoutSettings.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/paneFadeRename.browser.test.tsx --no-file-parallelism)
```

## Arcade

Dale asked for a small arcade at the bottom of the sidebar (2026-11-19): first a game of snake, then "galaga and infinite runner". The switch is "Show the arcade", off by default. With the switch off the fork renders nothing for it.

The second request named an existing game. The fork does not copy that game: "Shooter" is an original game of the same kind (a ship at the bottom that shoots enemies which come from the top), with its own shapes, rules and name. "Runner" is an original endless runner.

- With the switch on, the sidebar footer shows a small "Arcade" button above the resources readout (`apps/web/src/panes/SidebarArcade.tsx`). A click opens three tabs (Snake, Shooter, Runner) and a board of 220 x 140 px above the button. A second click closes it. The open state and the selected game are not stored.
- Keys of each game: the arrow keys and W, A, S, D are up, down, left and right, and Space is "fire". A click on the board or a game key starts the game. Enter or P pauses and continues. After "Game over", Space or Enter starts a new game. Escape leaves the board.
- Snake: the arrow keys turn the snake. A wall or the body ends the game, food adds one cell and one point, two quick turns both count, and a turn back onto the neck is not taken. The move time starts at 140 ms and falls by 10 ms for each 5 points, down to 70 ms (`snakeGame.ts`).
- Shooter: left and right move the ship, and Space or up fires while it is held. Enemies come from the top and sway down. Some shoot. A hit enemy is one point. The ship has 3 lives, and loses one when a shot or an enemy touches it, and when an enemy passes the bottom. Enemies come sooner and faster with more points (`shooterGame.ts`).
- Runner (changed on 2026-11-19 at Dale's request): Space or up jumps, and a held key jumps again at each landing. A jump is low and short: about 23 px high and 13 ticks long (`GRAVITY`, `JUMP_SPEED`). Down or S in the air drops the runner fast. Down or S on the ground rolls: the runner is half as high, and the down key wins over the jump key. Low blocks come from the right, to jump over. After 500 px, bars that hang from the top come too, with 7 px of free space under them, so only a roll passes. The speed grows with the distance from 3.4 to 8 px for each tick, reached at 5500 px. A touch ends the game. The score is the distance (`runnerGame.ts`). The highest and widest block can be cleared at the start speed and at the top speed, and a test checks both.
- The game runs only while the board has focus. When focus leaves the board, the game pauses. A paused or closed game has no timer. Shooter and Runner step every 33 ms while they run.
- The rules of each game are a pure function with no React and no clock. `arcadeGames.ts` gives each game one shape (`create`, `press`, `step`, `stepMs`, `draw`), and one board component runs all three.
- Colors: the player has the action color of the theme (`--primary`, Tutor yellow in the Tutor theme). Enemies and blocks have the text color. Food and enemy shots have the error color.
- The best score of each game is in the key `t3code-fork:arcade-scores:v1`. It is no setting, so it has a key of its own. A score is stored when a game ends.
- Keys: the board is `role="application"`, which the stock type-to-focus rule leaves alone, so a letter of a game does not go to the composer. The board stops each game key at itself. A key with Cmd, Ctrl or Alt is not a game key.
- Upstream edit: none of its own. The set `r3-environment-resources` now mounts `ForkSidebarFooter`, which renders the arcade and the resources readout.
- Checks: `snakeGame.test.ts`, `shooterGame.test.ts`, `runnerGame.test.ts`, `arcadeStore.test.ts`.
- Checked on 2026-11-19 in a dev stack with an isolated home, in headless Chromium: no arcade with the default setting. After the switch in Settings > Appearance, the button showed and opened the board. Snake: a click started the game, W and A did not reach the composer, a wall ended the game, and a click in the composer paused it. Shooter: with Space held and the ship moved left and right, the score rose to 4, and P paused. Runner: with the up arrow held, the score rose to 8. With no key it ended at a block with 13 points, Space started a new game and Enter paused it. The best score of the runner was in the scores key.
- Not verified: the packaged Electron app, a touch screen (the games have no touch control), and a narrow sidebar (the board has a fixed width of 222 px).

## Collapse long pastes

Round 3 request R4. The switch "Collapse long pastes" is the first row of the "Tutor3" section in Settings > Appearance (see "Fork settings"). The default is off. With the switch off, the chat composer renders the stock editor with the stock props, and a paste is stock.

What stock `v0.1.10` already has, and what stays as it is:

- A paste of 32 KB or more becomes a `pasted-text.txt` attachment (`packages/client-runtime/src/textPaste.ts`, `foldPastedText` in `apps/web/src/components/chat/useComposerAttachmentIntake.ts`). The stock paste handler runs first. A paste that it takes gets no chip.
- Cmd+Shift+V (Ctrl+Shift+V) and the desktop menu action "Paste as text" paste plain text and skip that fold. They also skip the chip.
- Stock has no setting for pastes, no chip for a paste below 32 KB, and no way to expand a folded paste in place.

With the switch on:

| Action                                                           | Result                                                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paste more than 10 lines, or more than 1000 characters           | One inline chip, `[Pasted text · N lines]`, at the caret                                                                                           |
| Click the chip                                                   | The full text takes the place of the chip. It goes through the stock paste of the editor, so the result is equal to a stock paste at that position |
| Paste the same text again, right behind its chip or on that chip | The same as a click                                                                                                                                |
| Undo (Cmd+Z) after a collapse or after an expand                 | One step back: the paste is gone, or the chip is back                                                                                              |
| Send, queue, steer, stash, side chat                             | Stock. The message carries the full text at the place of the chip                                                                                  |
| Copy or cut a selection that holds a chip                        | The clipboard text holds the full text                                                                                                             |
| Paste with no focused editor                                     | Stock puts the text at the end of the composer. That text becomes a chip too                                                                       |
| Paste into a code block of the composer                          | Stock text. A code block takes no chip                                                                                                             |
| Restart the app                                                  | The chip is back, with its text                                                                                                                    |

The two limits are `PASTE_COLLAPSE_MIN_LINES` and `PASTE_COLLAPSE_MIN_CHARS` in `apps/web/src/panes/pasteCollapse.ts`.

How it works:

- The chip is display only. The stock draft store, `promptRef` and every stock reader of the prompt hold the full text. So stock draft persistence, the 120,000 character limit, the 32 KB fold, the send paths and a stock server need no change, and the provider receives the text inline.
- `PasteCollapseEditor` (`apps/web/src/panes/PasteCollapseEditor.tsx`) takes the place of the stock editor in `ChatComposer.tsx`. It gives the stock editor a text in which each collapsed paste is one stock context reference of the kind `fork-paste`: `[Pasted text · N lines](t3-context://v1/fork-paste/<id>)`. The stock editor shows such a reference as its stock chip node (`composer-context-reference`). No editor node type was added.
- On each editor change the wrapper puts the full text back at each reference and gives that prompt to the stock composer. It maps the cursor, the selection range and the snapshot of the editor handle between the two texts (`apps/web/src/panes/pasteCollapse.ts`).
- The stock composer registry has no handler for the kind `fork-paste`, so the chip goes to the registry fallback. The fallback hunk renders `PasteCollapseChip` there. Every other unknown kind still shows the stock "unavailable" chip.
- A stock edit of the prompt (a mention from the menu, dictation, an attachment reference, a send that clears the prompt) reaches the wrapper as a new prompt. A chip stays when its text lies in the unchanged start or the unchanged end of the prompt. A chip whose text the edit touched becomes text again.
- The id of a chip is a hash of its text. The texts of one session stay in memory, so undo can bring back a chip whose text left the prompt.
- Each pane has its own composer, editor and draft key, so each pane has its own chips.

Where the values are saved (browser storage of the client, as for each fork setting):

| Key                             | Content                                                                                            | Default |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `t3code-fork:paste-collapse:v1` | `collapseLongPastes`                                                                               | `false` |
| `t3code-fork:paste-chips:v1`    | For each draft key: the start, the end and the id of each chip. No pasted text. At most 200 drafts | empty   |

A stock server never receives either value. The pasted text is saved one time, in the stock draft (`t3code:composer-drafts:v1`). After a restart a chip is restored only when the hash of the prompt text at the saved place is equal to the saved id. If not, the prompt shows as full text.

Upstream edits (hunk set `r3-paste-collapse`, 3 hunks in 2 files):

| Hunk                                         | File                                                      | Purpose                                                           |
| -------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `r3-paste-collapse-1`                        | `apps/web/src/components/chat/ChatComposer.tsx`           | The import of `ComposerPromptEditor` names the wrapper            |
| `r3-paste-collapse-2`, `r3-paste-collapse-3` | `apps/web/src/components/composerContextPresentation.tsx` | The import, and the registry fallback renders the fork chip first |

Each anchor is stock text, so the set applies to a stock tree with or without the other sets. The settings row (`apps/web/src/panes/PasteCollapseSettings.tsx`) and the search item (`pasteCollapseSettingsSearch.ts`) need no hunk of their own.

Checks:

```sh
(cd apps/web && pnpm exec vp test run --project unit src/panes/pasteCollapse.test.ts)
(cd apps/web && pnpm exec vp test run --project browser src/panes/pasteCollapse.browser.test.tsx)
```

Rebase checks (drift that causes no git conflict):

1. `ComposerPromptEditorProps` and `ComposerPromptEditorHandle` in `apps/web/src/components/ComposerPromptEditorTiptap.tsx`. The wrapper maps `value`, `cursor`, `onChange`, `onPaste`, `onCitationDraftSave` and each handle method. A new prop or handle method that carries a text offset or the editor text needs a mapping. The type check fails on a new handle method. It does not fail on a new prop.
2. The stock editor must still call `onPaste` in the capture phase, show a context reference of an unknown kind through the registry fallback, keep the node name `composer-context-reference` with the attributes `kind`, `contextId`, `label` and `source`, keep `data-testid="composer-editor"` on the editor element, and handle a scripted `paste` event (`handlePaste`). The browser test fails when one of these no longer holds.
3. `usePasteToFocusComposer` must still put a paste with no editable target at the end of the prompt. The browser test of that paste fails when the text is put elsewhere.
4. `collapseExpandedComposerCursor` and `expandCollapsedComposerCursor` in `apps/web/src/composer-logic.ts` must keep their meaning.

Limits and items not verified:

1. A chip that is sent gives the provider the text at the exact place of the chip. A stock paste of several lines behind typed text starts the lines on a new line. So `a [chip]` sends `a line 1...`, and the expanded chip sends `a`, a line break and `line 1...`.
2. While a question of the agent is open, the composer edits the answer under the same draft key. The chips of the prompt then become text. The text is not lost.
3. With a chip, the stock rule "Enter sends only a prompt of one line" (`sendShortcut` set to `mod-enter-multiline`) reads the full prompt, which has many lines.
4. The mobile app has no chip. A draft is not shared between clients, so no client sees a `fork-paste` reference of another client.
5. Not run in the packaged Electron app. Not run in Safari or Firefox: the expand uses a scripted `paste` event with a `DataTransfer`, and it leaves the chip as it is when the browser drops that data. The desktop menu action "Paste as text" has no automated test. The key has one.
6. Two panes that show the same thread share one draft. This is a supported state since 2026-11-19 (section "Mirror panes"): typing in one pane shows in the other, and that ran in a browser test. The second pane takes the chips of the first pane after each edit. The chips of a mirror were read in code only.
7. The 32 KB fold in the fake test environment: that environment has no file attachments, so the browser test uses a stand-in for the stock paste handler that takes the paste. The real fold was not run with the switch on.

## Build and sign

Cargo must be on `PATH`. Do not set `GITHUB_REPOSITORY` or `T3CODE_DESKTOP_UPDATE_REPOSITORY`. With neither set, the app has no auto-update feed.

```sh
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"   # first time: brew install rustup && rustup default stable
env -u GITHUB_REPOSITORY -u T3CODE_DESKTOP_UPDATE_REPOSITORY \
  pnpm exec node scripts/build-desktop-artifact.ts \
  --platform mac --target dmg --arch arm64 \
  --build-version 0.1.10 --output-dir <output dir>
```

- Stamp each build with the version of the base tag (`--build-version`). The client then reports the same version as a server on that tag.
- The build of the identity commit took 63 seconds on this Mac.
- The build leaves only the linker ad-hoc signature (`Info.plist` not bound). Sign after install:

```sh
codesign --force --deep --sign - "/Applications/Tutor3.app"
```

Checks on the built app:

1. `CFBundleIdentifier` is `com.daleross.tutor3`.
2. `Contents/Resources/app-update.yml` does not exist.
3. The fork app runs while the stock app runs.
4. Pair it with a remote server: `t3 pair` on the server, then Add environment in the app.

## Rebase to a new stable tag

Agents: follow `scripts/fork/UPDATING.md` (the order of work and the checks that typecheck misses) and use `scripts/fork/squash.sh <base tag>` in place of the hand-written step 0 below.

0. If the branch has more than three commits, squash it to three: identity, fork-owned files, generated hunks. A hunk that an early generated commit wrote and a later one moved (set D was in `hooks/useThreadRouteTarget.ts` at first) can stop the rebase at a commit whose codemod is out of date.

   ```sh
   OLD=$(git rev-parse main)
   git checkout -B main <old tag>
   git cherry-pick <identity commit>          # the first commit on the old tag
   git checkout $OLD -- apps/web/src/panes apps/web/test/panes.renders.tsx \
     apps/web/test/paneThreadShell.ts scripts/fork FORK.md TUTOR3.md .github/README.md \
     packages/contracts/src/paneKeybindings.ts packages/shared/src/paneKeybindings.ts \
     packages/shared/src/paneKeybindings.test.ts \
     packages/shared/src/panePullRequestWatchHold.ts \
     packages/shared/src/panePullRequestWatchHold.test.ts \
     packages/contracts/src/forkSpotify.ts \
     apps/desktop/src/ipc/forkChannels.ts apps/desktop/src/ipc/methods/forkHostDisk.ts \
     apps/desktop/src/ipc/methods/forkHostDisk.test.ts \
     apps/desktop/src/ipc/methods/forkSpotify.ts apps/desktop/src/ipc/methods/forkSpotify.test.ts \
     apps/desktop/src/ipc/methods/forkMenuBar.ts apps/desktop/src/ipc/methods/forkMenuBarMethod.ts \
     apps/desktop/src/ipc/methods/forkMenuBar.test.ts
   git commit --no-verify -m "fork: split panes with top-level tabs (new files)"   # the hook checks the end state, not this one
   git checkout $OLD -- .
   git commit -m "fork: generated upstream hunks (scripts/fork/apply-pane-hunks.ts)"
   git diff $OLD HEAD                         # must print nothing
   ```

1. `git fetch origin --tags`
2. `git rebase --onto <new tag> <old tag> main`
3. A conflict can appear only in the identity commit and in a generated-hunks commit. For conflicts in hunk files, take the upstream side and apply the codemod again:

   ```sh
   git checkout --ours -- <conflicted files>   # in a rebase, "ours" is the new upstream base
   node scripts/fork/apply-pane-hunks.ts
   git add -u                                  # every file the codemod wrote, not only the conflicted ones
   git rebase --continue
   ```

   At an early stop, the codemod in the work tree is the version of that commit. It can also write files that a later commit edits. `git add -u` puts those edits in the current commit, and the later commit then applies with no change. If git reports that a commit has no changes left, run `git rebase --skip`.

4. If the codemod reports `missing` or `repeated`, upstream rewrote that site. Read the new code. Decide if the guard is still necessary. Update the anchor in `scripts/fork/apply-pane-hunks.ts`.
5. `pnpm install`. Run the acceptance checks below. `node scripts/fork/apply-pane-hunks.ts --check` must exit with code 0.
6. Build with `--build-version <tag version>`. Sign. Do the packaged-app checklist.

Rehearsal: steps 0 to 3 were run in a scratch clone from `v0.1.10` to upstream main `a99faf5a62` (189 commits). Step 0 gave three commits and an empty diff against the old tip. The rebase stopped one time, at the generated commit, with conflicts in `ThreadRouteView.tsx` and `routes/_chat.tsx`. After step 3 it completed. `--check` then reported all hunks applied (53 at that time). A review repeated the rehearsal on 2026-11-18 with 60 hunks: the same single stop, and 60 hunks applied. It was not repeated with the 62 hunks of the tree after that review. A rebase of the squashed branch onto a `v0.1.10` with an edit in `hooks/useThreadRouteTarget.ts` did not stop. The `panes` branch itself was squashed to three commits on 2026-11-17. Round 2 of 2026-11-18 added commits and two merge commits on top, and step 0 ran again at the end of that round, with an empty diff against the old tip. The identity commit got the title `fork: app identity (Tutor3)` at that time.

State after round 3: the ship step of 2026-11-18 ran step 0, so the branch is three commits on `v0.1.10` again and `git log --oneline v0.1.10..panes | wc -l` prints 3. The round had added commits of kind 2 and kind 3 and three merge commits (22 commits in all before the squash). `git diff` between the old tip and the squashed tip printed nothing. The old tip is the local ref `refs/backup/panes-r3-presquash`. A review showed what happens without step 0: `git rebase --onto v0.1.10 v0.1.10` of the branch that is not squashed stops with a conflict in `scripts/fork/apply-pane-hunks.ts`, a file that the hourly job does not resolve.

Rehearsal for round 3, on 2026-11-18 in a scratch clone, from `v0.1.10` to upstream main `a99faf5a62`:

- With the 85 hunks of the round before its review fixes (a review ran it): step 0 gave three commits and an empty diff. The rebase stopped one time, at the generated commit, with conflicts in `ThreadRouteView.tsx` and `routes/_chat.tsx`. After step 3, `--check` reported 85 applied. On the rebased tree the type check of `apps/web` and `apps/desktop` passed, and 238 of 239 unit tests of `src/panes` passed. The one failure is the tripwire `paneNarrowPanel.test.ts`: upstream added the right panel store action `openIssue` (rebase checklist, item 19).
- With the 86 hunks after the review fixes and the scroll key: step 0 gave three commits and an empty diff against the tip of 19 commits. Commit 2 held fork-owned files only, and commit 3 held the 30 hunk files. The rebase stopped at the same single place with the same two conflicts. After step 3, `--check` reported 86 applied with exit code 0. The type check and the tests were not run on that rebased tree.

Rebase of 2026-11-23 from `v0.1.10` to `v0.1.11` (643 upstream commits). The rebase stopped at the generated commit. After `git checkout --ours` of the conflicted hunk files, the codemod reported 10 hunks `missing`. Each got a new anchor, and none was dropped. Most of the drift is the upstream translation work (`gt(...)`, `msg(...)` and the message resolver `m`):

- C5, C6 (`ChatView.tsx`): stock now gates the desktop menu listener on `embedded || backgroundThread` and adds the menu action `rightPanel.close` to it. The fork's own `backgroundThread` gate is now stock, so the hunks add only `paneNarrow`.
- C17 (`ChatView.tsx`): the side chat reason is now `gt("Available once the thread's worktree is set up.")`.
- `r2-density-settings-4` (`settingsSearch.ts`): the search terms of "Chat width" are now `msg(...)`.
- `r7-pr-watch-hold-3` (`orchestrationV2PendingBackgroundWork.ts`): stock no longer drops the watch of a merged pull request. Its mark now also holds for a merged pull request and for a watch with `until: "merged"`. The hunk puts the fork switch before the whole stock condition, so with the setting on no watch holds.
- `r7-palette-filter-2` (`CommandPalette.tsx`): the stock destructuring gained `isSearchFailed`. The fork hook spreads the stock result, so the new field passes through.
- `r7-worktree-label-2` (`BranchToolbarEnvModeSelector.tsx`), `r7-worked-time-2` (`TimelineAssistantRows.tsx`), `r10-selection-input-3` (`ChatComposer.tsx`): the stock calls now take `m`.
- `r9-context-breakdown-2` (`ThreadDetailsUsage.tsx`): the stock label is now `gt("Context", ...)`.

After that, `--check` reported 157 of 157 hunks applied with exit code 0, and the codemod output on clean `v0.1.11` files was the same as the git merge in every file that git merged without a conflict. `ORCHESTRATION_PROTOCOL_VERSION` is 2 at both tags.

Upstream also broke fork-owned files. The fixes:

- `settingsSearch.ts` exports the hook `useSearchableSetting` in place of `searchableSetting`, and the stock `SettingResetButton` takes the whole `ariaLabel` in place of `label`. `ArcadeSettingsRow.tsx`, `PaneDensitySettings.tsx`, `PaneThreadSettings.tsx`, `PasteCollapseSettings.tsx` and `ReadoutSettingsRows.tsx` use the hook and pass "Reset <title> to default".
- `formatResetsIn` and `limitsNotice` moved to `@t3tools/shared/usageLimitsCopy`. `accountQuota.ts` imports them from there. Their default resolver gives the English text.
- The stock panel store has a new opening action, `openIssue`. `paneNarrowPanel.ts` guards it like `openPullRequest`.
- A click on assistant text now focuses the message body (stock `tabIndex={-1}` with `data-assistant-citation-source`), not the chat scroller. `paneFocusMemory.ts` also skips an element with a negative `tabIndex` inside the scroller, so a return to the pane still goes to the input.
- The new lint rule `t3code/no-untranslated-copy` reported 171 errors in `apps/web/src/panes`. The new set `r13-english-copy` adds `apps/web/src/panes/**` to the `excludeFiles` list of that rule in `vite.config.ts`. The fork copy stays English.
- The v0.1.11 client takes the preview tunnel as on for a stock v0.1.10 server, because the schema decodes the missing `enablePreviewTunnel` as `true`. A v0.1.10 server has no `/api/preview/tunnel`, so a `localhost` tab of `dale-nix` in the desktop app did not load, and each port forward failed. The new set `r14-old-server` also requires `capabilities.previewTunnelSetting`, which only a server with the route sends. Without it the tab streams from the server (`serverBrowser`, which v0.1.10 has).
- Settings > Source Control asked a v0.1.10 server for `issueTrackers.list`, an RPC it does not have, and showed a load error. `r14-old-server` shows the section only for a server with `capabilities.issues`.
- `panes.css` selected the launcher by `aria-label="Open a surface"`, which v0.1.11 translates. The selector is now `[data-surface-launcher-keys]` alone, so it also matches in other UI languages.

Then `--check` reported 163 of 163 hunks applied, and the type check, lint, knip and the fork tests passed. A packaged build was not made.

The hourly job on the `fork-infra` branch does the same steps. It reads the list of hunk files from `HUNK_SETS` and reads the lines `<id>  <state>  <file>` of the codemod output, so keep both.

Estimate from the plan, not measured: 15 to 30 minutes for each rebase when all anchors hold. An anchor that upstream rewrote adds 30 to 60 minutes. `ThreadRouteView.tsx` is the most likely place (6 hunks).

### Rebase checklist (drift that causes no git conflict)

1. `grep -n "embedded" apps/web/src/components/ChatView.tsx`. Look for a new site next to `window.`, `desktopBridge` or `subscribe` that has no `backgroundThread`.
2. `grep -rn "BackgroundThreadContext" apps/web/src`. A new reader that hides or disables UI affects passive panes.
3. `grep -rnE '(window|document)\.addEventListener\(\s*"(keydown|paste)"' apps/web/src/components`. A new global key listener inside the chat subtree needs a gate. `pullRequest/PullRequestDetailPanel.tsx` is one: set O turns its `shortcutsEnabled` off in a passive pane.
4. Search the ChatView subtree for a new inline `fixed` element that is not in a portal. `contain: layout` on a pane anchors it to the pane.
5. Compare `DEFAULT_KEYBINDINGS` in `packages/shared/src/keybindings.ts` with `packages/shared/src/paneKeybindings.ts`. A new stock default on a fork chord needs a decision. The test `packages/shared/src/paneKeybindings.test.ts` fails when a pane rule takes the chord and condition of a stock command other than the three moved commands.
6. `grep -n ORCHESTRATION_PROTOCOL_VERSION packages/contracts/src/environment.ts`. The value must equal the value of the remote server (2 at `v0.1.10` and at `v0.1.11`).
7. Read `createNewThreadHandler` in `apps/web/src/hooks/useHandleNewThread.ts`. `paneRouter` in `apps/web/src/panes/paneActions.ts` stands in for the router and supplies only `state.matches`, `state.location.href` and `navigate`. A new router read needs a new field there. The draft reuse rule must still look the draft up by the project's key (`getDraftSessionByLogicalProjectKey`): `apps/web/src/panes/paneDrafts.ts` relies on it. The test `apps/web/src/panes/paneDrafts.test.ts` runs the real stock flow and fails when two panes share a draft.
8. Compare the stock right-panel tab classes in `apps/web/src/components/RightPanelTabs.tsx` with `apps/web/src/panes/PaneTabBar.tsx`. The tab bar copies them, and adds a medium weight and a 2px line in the primary color to the active tab.
9. Check that `apps/web/src/lib/workspaceFocus.ts` still skips an area with `data-workspace-unavailable="true"`. A passive pane relies on it.
10. Search the upstream tests for the three moved stock keys. A new test of `mod+d`, `mod+shift+d` or `mod+t` needs a hunk in set J.
11. `apps/web/src/panes/panes.css` selects stock markup by class: the new-thread screen is `[data-chat-composer-overlay="true"].items-center` with the one child `.chat-composer-lane`, its headline is `.absolute.bottom-full` and its notices are `.absolute.top-full` inside `[data-chat-composer-stack="true"]` (`ChatView.tsx`). The question of the headline is the first `span` of the `h1`, and its closing "?" is the last `span` of the last `span` (`chat/DraftHeroProjectHeading.tsx`, where stock hides both with `[@media(max-height:28rem)]`). The browser test "each new pane and each new tab opens its own draft" fails when the headline covers the pane header. The test of 12 minimum panes fails when the project picker of a minimum pane cannot scroll into view.
12. `panes.css` copies the two stock gutter rules of `apps/web/src/index.css` for a window below 640 px (`.chat-composer-lane` and `.messages-timeline-scroll`). Compare them.
13. `grep -rn "subscribePreviewAction\|onMenuAction" apps/web/src/components`. A new subscriber that acts on a preview or a panel needs the gate of set L.
14. `grep -rn "document.querySelector" apps/web/src/components/chat apps/web/src/components/RightPanelTabs.tsx`. A query that takes the first match in the document can find an element of a passive pane (sets K and N).
15. `PANE_PANEL_INLINE_MIN_WIDTH_PX` in `apps/web/src/panes/paneSize.ts` is the sum of the two 360 px minimums in `apps/web/src/hooks/usePreviewPanelInlineSize.ts`.
16. `grep -rn "onPointerDown={" apps/web/src/components/chat`. A stock control that cancels `pointerdown` keeps DOM focus where it is. `claimPaneFocusAfterPress` in `apps/web/src/panes/paneFocusMemory.ts` moves the keyboard into the pane after such a press. It relies on the press reaching the pane cell in the capture phase.
17. `handleNewThread` in `ChatView.tsx` must still have one caller chain: the new thread of the chat view's own project (hunk C14 wraps it).
18. The `data-pane-short` and `data-pane-narrow` rules of `panes.css` select stock markup: `--workspace-topbar-height`, `.composer-tiptap` (stock minimum `2lh`), `[data-chat-composer-body]`, its placeholder `.text-placeholder.absolute`, the composer footer (`[data-chat-composer-footer]`), the strip under the composer (`[data-slot="composer-context-strip"]`, stock `pt-2`), the spacer under the composer (`[aria-hidden][class*="safe-area-inset-bottom"]`), and `[data-chat-header] > .pr-24`. The browser test "a 2x2 pane splits again, and a tab holds 12 panes of the minimum size" fails when the header or the composer no longer fits a pane of 200 x 140 px, also with a prompt of 12 lines. More stock markup that `panes.css` selects with no test: the stock limit of the editor (`max-h-52` in `ComposerPromptEditorTiptap.tsx`, repeated as `calc(var(--spacing) * 52)`), the model button (`[data-chat-provider-model-picker]`, its first `span`, and the effort `span` that holds a `[data-composer-control-label]`, `chat/ProviderModelPicker.tsx` and `chat/ComposerModelEffort.tsx`), the launcher (`[data-surface-launcher-keys]`, `RightPanelTabs.tsx`, with no `aria-label` in the selector because v0.1.11 translates it) and the text of an empty thread (`div.flex.h-full.items-center.justify-center` with one `p`, inside `[data-workspace-area="conversation"]`, `chat/MessagesTimeline.tsx`). A new unnamed `@container` query or `cq` unit in the chat subtree with no stock container of its own would read the pane (`container: tutor-pane / size`).
19. `grep -n "rightPanelOpen\|toggleRightPanel\|openFileSurface\|useRightPanelStore.getState()" apps/web/src/components/ChatView.tsx apps/web/src/components/chat/useRightPanelActions.ts`. A new key or a new window-level listener that opens or closes the right panel needs the `paneNarrow` gate (hunks C4, C5, C15). `apps/web/src/panes/paneNarrowPanel.test.ts` lists every action of `apps/web/src/rightPanelStore.ts` as guarded or passed. It fails on a new action, which then needs a place in one of the two lists. Upstream main `a99faf5a62` has one such action already, `openIssue`: the test failed for it in the rehearsal of 2026-11-18, so the next rebase must place it. A new flow that does server work before it opens a surface, as the side chat does, needs a gate of its own before that work (hunk C17).
20. `apps/web/src/panelAnimations.ts` must still export `PanelAnimationSuppressionProvider`, `usePanelNavigationSuppression` and `usePanelAnimationSettings`, and its context must have no other reader than `usePanelAnimationSettings`. `PaneCell` gives a single pane the value `!active`, which is equal to the stock value only for that reader.
21. `grep -n "useLocation\|useParams\|useRouterState\|useMatch" apps/web/src/components/ChatView.tsx`. A new reader of the router state in the chat view renders every pane on a focus move. Run `apps/web/test/panes.renders.tsx`.
22. The terminal rules of `panes.css` select stock markup of the drawer. Check each one against `apps/web/src/components/ThreadTerminalDrawer.tsx`, `PersistentThreadTerminals.tsx` and `ChatView.tsx`:
    - The drawer that shows is `[data-thread-terminal-drawer][data-workspace-area="terminal"]`. A hidden drawer and a panel terminal do not have the second attribute.
    - The drawer is a grandchild of a `div` that is a child of `[data-chat-column]`, and the timeline is the `div` directly after `[data-chat-header]`.
    - Stock sets the drawer height as an inline style. The rule for a short pane overrides it with `!important`.
    - The drag handle is the child with the class `cursor-row-resize`. The terminal list is `aside.w-36`.
    - `paneFocusMemory.ts` focuses the first `textarea` of the drawer, which is the input of the terminal surface (`apps/web/src/terminal/ghostty/surface.ts`).
    - `paneTerminalReveal.ts` reads `terminalOpen` of `apps/web/src/terminalUiStateStore.ts` and `maximized` of `apps/web/src/rightPanelStore.ts`. If upstream fixes the maximized case, remove the file.

    The browser test `apps/web/src/panes/paneTerminal.browser.test.tsx` fails when one of the first four or the last no longer holds. It is a file of its own because the app keeps the thread list that the first test of a file loaded, and a drawer mounts only for a thread of that list.

23. The Tutor theme (`apps/web/src/panes/tutorTheme.ts`). The type check fails when upstream adds or removes a color role: give the new role a value in both palettes. Run `grep -rhoE "[^ \"']*text-primary(/[0-9]+)?[ \"']" apps/web/src/components | sort | uniq -c` and compare the variants with the selector list of `TUTOR_THEME_CSS`. Check in `apps/web/src/index.css` that `--primary` is still `--app-theme-message-action`. Raise `TUTOR_THEME_VERSION` after each palette change.

Events that cost more:

1. Upstream merges the workspace redesign (PRs #28839 to #28845). Sets A, B and C then need a new port. Hold the fork on the last tag before the merge until a decision.
2. `ORCHESTRATION_PROTOCOL_VERSION` rises above 2. A remote server on the new version then refuses the fork client until the fork is rebased and built again.
3. Upstream changes the wrapper in `ThreadRouteView.tsx` or adds a second render site for `ThreadRouteView`.

## Acceptance checks

Run from the repo root unless a line says otherwise. `vp` is not on `PATH`, so use `pnpm exec vp`.

```sh
node scripts/fork/apply-pane-hunks.ts --check
git diff --stat v0.1.11 -- apps/web/src ':!apps/web/src/panes'
pnpm exec vp run --filter @t3tools/web typecheck
pnpm exec vp run --filter @t3tools/desktop typecheck
FORK_FILES="apps/web/src/panes apps/web/test/panes.renders.tsx apps/web/test/paneThreadShell.ts \
  scripts/fork apps/desktop/src/ipc/forkChannels.ts apps/desktop/src/ipc/methods/forkHostDisk.ts \
  apps/desktop/src/ipc/methods/forkHostDisk.test.ts"
pnpm exec vp lint $FORK_FILES
pnpm exec vp fmt --check $FORK_FILES FORK.md
pnpm exec vp run knip:check
pnpm exec vp test run scripts/fork/apply-pane-hunks.test.ts
(cd apps/web && pnpm exec vp test run --project unit src/panes src/keybindings.test.ts \
  src/hooks/useHandleNewThread.test.ts src/components/settings src/lib)
(cd packages/shared && pnpm exec vp test run --config ../../vite.config.ts --dir .)
(cd apps/desktop && pnpm exec vp test run src/ipc)
(cd apps/web && pnpm exec vp test run --project browser src/panes)
(cd apps/web && pnpm exec vp test run --project renders test/panes.renders.tsx)
(cd apps/web && pnpm exec vp test run --project browser \
  src/components/ChatView.browser.test.tsx src/components/DiffPanel.browser.test.tsx \
  src/components/RightPanelTabs.browser.test.tsx src/components/Sidebar.shortcuts.browser.test.tsx \
  src/components/AppSidebarLayout.browser.test.tsx src/speech/useDictationShortcut.browser.test.tsx \
  src/components/settings/KeybindingsSettings.browser.test.tsx \
  src/components/preview/PreviewView.browser.test.tsx \
  src/components/files/FileBrowserPanel.browser.test.tsx \
  src/components/chat/DraftHeroHeadline.browser.test.tsx)
(cd apps/web && pnpm exec vp test run --project browser \
  src/components/chat/ChatHeader src/components/chat/ThreadDetails \
  src/components/chat/ProviderModelPicker src/components/Sidebar.browser.test.tsx \
  src/components/sidebar src/components/settings src/components/ComposerPromptEditorTiptap \
  src/components/chat/useComposer src/components/chat/CollapsedComposerPromptPreview)
```

The last command runs the upstream browser tests of the files that the sets `r3-*` edit: the chat header, the thread details, the model picker, the sidebar, the settings pages and the composer editor.

In zsh, `$FORK_FILES` does not split into words. Use `${=FORK_FILES}` there, or run the two lines in `bash`.

The browser tests need Playwright Chromium: `(cd apps/web && pnpm exec playwright install chromium)`.

Put a new browser test of the fork in one of the files that exist. The files of one folder run at the same time, and each test has 15 seconds. On 2026-11-18, with a tenth file in `apps/web/src/panes` (two tests of the scroll key) and a load average of 14 to 20 on this Mac, the test of `paneTerminal.browser.test.tsx` reached that limit in 7 of 8 runs of the folder. It passed alone. With the two tests moved into `panes.browser.test.tsx` (nine files), 3 of 3 runs of the folder passed under the same load. At the ship of round 3 on the same day, with the same nine files and a load average of 9 to 30 (another app of the user took more than one CPU core), that test reached the limit in 3 of 4 runs of the folder. Each time the other 38 tests passed. The test passed alone, and all 39 tests passed in one run of the folder with `--no-file-parallelism`. On a loaded machine, add that flag to the command. A pane that a test closes through the store must wait for the route of its draft first (`lastRouteKey`), as two tests now do: a close before that leaves a late route, which mounts the other pane again.

On 2026-11-18 on `dale-nix` (NixOS, Linux, headless Chromium), after round 4: the folder ran with `--no-file-parallelism`, and 41 of 41 tests in 9 files passed. The two tests of `mod+arrowdown` pressed the Meta key before, which is no `mod` key on Linux, and both failed there. They now press the `mod` key of the platform (`ControlOrMeta`). After round 4b on the same box, `panes.browser.test.tsx` ran alone with `--no-file-parallelism`, and 16 of 16 tests passed. The lists below are from macOS. They were not checked on Linux.

Known test failures on macOS at `v0.1.10` plus this fork (19 tests). The repo's pre-push check `vp run check:changed` therefore fails on this branch. Compare its failures with these two lists.

7 tests fail on stock `v0.1.10` too. Proof: with every upstream file of the fork restored from the tag (the 17 hunk files of that time and the 4 identity files), the same 7 tests failed on this Mac. The proof was not repeated after `AppearanceSettingsPanel.tsx` and `settingsSearch.ts` became hunk files. They are not part of the fork's acceptance set.

- `apps/web/src/components/ChatView.browser.test.tsx`, "a shortcut conditioned on rightPanelOpen sees the thread's open right panel". It fails when its whole file runs, and passes alone. Cause: the test presses Ctrl+T and supplies its own `ctrl+t` rules, but the fake server config of the first test in the file stays for the whole file. On Linux, Ctrl is `mod`, so the stock `mod+t` default serves the test. In this fork `mod+t` is `layout.newTab`, so this test is likely to fail on Linux too. This is not verified.
- `packages/shared/src/shell.test.ts` (1): "captures values when the profile replaces PATH and a DEBUG trap echoes commands".
- `apps/desktop/src/app/DesktopLinuxUrlHandler.test.ts` (2): "installs both app id spellings without creating an icon cache" and "replaces same-length stale icons and refreshes an existing cache once". The two app id spellings differ only in letter case, and the macOS file system ignores case.
- `scripts/build-npm-launcher.test.ts` (1): "publishes a launcher that downloads, verifies, caches, and runs the release executable". On macOS `/var` is a link to `/private/var`.
- `apps/web/src/components/ChatMarkdown.permissions.browser.test.tsx` (2): "tells the native menu for ... whether the keyboard opened it" (Shift+F10).

12 upstream tests hardcode the stock identity and fail after the identity commit. They are not edited, to keep the carried diff small.

- `apps/desktop/src/app/DesktopUserData.test.ts` (2), `DesktopAppIdentity.test.ts` (1), `DesktopClerk.test.ts` (6): 9 tests expect `t3code-v2`.
- `apps/desktop/src/app/DesktopEnvironment.test.ts` (1): "keeps implicit development state separate from production state" expects `/Users/alice/.t3/dev` and receives `/Users/alice/.tutor3/dev`.
- `scripts/build-desktop-artifact.test.ts` (2): the tests expect `com.t3tools.t3code`.

Do not run `i18n:generate` in the fork. It rewrites translation files that upstream changes often. The fork strings are English only.

## Packaged-app checklist (by hand)

No automated test covers the Electron app.

1. One tab, one pane: compare with the stock app side by side. No visible difference.
2. Two panes, sidebar expanded and collapsed: the traffic lights and the sidebar button do not cover a tab. The window drags by the tab bar. Pane headers do not drag the window.
3. The panel toggles sit at the top right of each pane. Open the right panel and the terminal drawer in both panes.
4. The diff panel in a passive pane shows that pane's thread.
5. Type `/` and `@` in the composer of the right pane. The menu opens above that composer.
6. Every key of the Keys table, also with terminal focus. Give attention to `ctrl+tab`, `ctrl+alt+arrow` and `mod+alt+arrow`: macOS or the Electron shell can take them first.
7. Rebind one pane key in Settings > Keybindings. The new key works and the tab bar tooltip shows it.
8. Quit and start the app with two tabs. The layout returns. The launch draft replaces no pane.
9. Send in pane 1. Then stop a running turn in pane 2 while pane 1 streams.
10. Start the Codex sign-in flow. See "Untested assumptions", item 5.
11. Split right, split down, and open two new tabs. Each new pane shows the new-thread screen with the caret in its composer. Text typed in one pane shows in no other pane.
12. Make a 2x2 grid of new-thread screens in a small window. No headline covers a pane header.
13. Open the right panel in a pane of 720 px or more. Drag a divider until the pane is narrower: the panel and its toggle go away and the chat column fills the pane. `mod+alt+b` does nothing there. Click a file link in the chat, and send `/side question`: each gives a message, nothing opens, and the `/side` text stays in the composer. Drag back: the panel and the toggle return, with the surface that was open before.
14. Open a browser surface in two panes. Zoom or reload in one pane. The other pane does not change. Click inside the page of the passive pane: that pane takes the focus mark.
15. Quit and start the app with drafts in several panes. Each pane shows its own draft again.
16. Settings > Keybindings, search "diff": one row, on the moved key, with no conflict mark.
17. With 3 tabs, in the light theme and in the dark theme: the selected tab has a medium weight and a line in the primary color. A hovered tab has neither. A click on the edge of a tab selects it.
18. Two panes with long threads. Scroll the passive pane up, click its "Scroll to end" button, then type. The text goes to that pane's composer. Do the same with the microphone button.
19. Open the diff panel in two panes with threads of two projects. Click a file row in the passive pane: the file opens on the first click, and no file list of the other project shows.
20. Open a pull request surface in two panes. `mod+shift+k` copies the number of the focused pane's pull request.
21. Send with `mod+alt+enter` in one pane and move pane focus at once. The follow-up draft opens in the pane that sent.
22. Make a 2x2 grid in a window of about 1470 x 900 pt. Split one pane down and one pane right. Each split works. A refused split names both sizes in its toast.
23. Split until a tab holds 12 panes. In a pane below 320 px of height, the header is lower, the composer has one line, the bottom bar shows under it, and none covers another. Type and send in such a pane. Type a prompt of 12 lines there: the composer stays under the header and the send button stays in view. In a new-thread pane of that size, scroll up over the composer: the project picker comes into view. Repeat with "Split pane density" set to Normal and to Very compact.
24. With 12 panes, move focus with `ctrl+alt+arrow` and type. Look for lag.
25. In a 2x2 grid, open the terminal drawer of each pane with its header button. Run a command in each. Press `mod+j`: only the drawer of the focused pane closes and opens. With terminal focus, `mod+d` splits the terminal and the tab still has four panes.
26. Drag a divider until a pane with an open drawer is below 320 px of height: the terminal takes the pane below the header. Type a command. Close the drawer: the composer is back and takes text. Drag the divider back: the drawer is under the composer again.
27. In a pane of 720 px or more, open a Terminal surface in the right panel and the drawer beside it. Maximize the panel, close the drawer, and press `mod+j`: the panel returns beside the chat and the drawer shows.
28. With one pane, the chat has the stock text size. Split the pane: every pane has smaller text and smaller gaps, and no pane loads again. Close panes until one is left: the stock look is back. Settings > Appearance has the rows "Chat density" and "Split pane density", and their values stay after a restart of the app.
29. In a 2x2 grid of started threads on different branches, each pane shows the bottom bar with its own branch. With one tab and one pane, a started thread has no bottom bar while the stock "composer context" setting is off.
30. Settings > Appearance has the section "Tutor3" after "Interface", with nine switches and "Preview links". Change each switch, quit and start the app: each value stays.
31. Turn each switch of "Tutor3" off and remove each template. With one tab and one pane, compare the sidebar footer, the model picker and the composer with the stock app. No visible difference.
32. "Show environment resources" on: the sidebar footer has one line for each connected environment. The line of the Mac also shows free disk space. The line of `dale-nix` shows memory only.
33. "Show account quota" on: the model picker lists each Claude account of the thread's environment with its quota left. Start a new thread: its account is the one with the mark "most left".
34. "Collapse long pastes" on: paste 14 lines in the composer of a pane. One chip shows. Click it: the text shows. Paste with Cmd+Shift+V: plain text, no chip.
35. Do the packaged-app check of the section "Settle on merge and preview links".
36. Scroll a long thread up and press `mod+arrowdown` with focus on the page: the chat scrolls to its end. Type a prompt, move the caret into the text and press the key: the caret goes to the end of the prompt. Press again: the chat scrolls. With terminal focus the key belongs to the terminal. With two panes, only the focused pane scrolls.
37. Send a prompt and press `ctrl+c` in the next seconds, before the agent runs a tool: the turn stops, the message leaves the timeline and its text is in the composer. No dialog shows. Send a prompt, wait until a tool ran or 15 seconds passed, and press `ctrl+c`: the turn stops and the message stays. With no running turn, and with selected text, `ctrl+c` stops nothing and Cmd+C copies. On Windows and Linux `ctrl+c` copies selected text. With terminal focus `ctrl+c` belongs to the terminal. With two panes, only the turn of the focused pane stops.
38. Put the caret in the sidebar search field and press `mod+l`: the caret is at the end of the composer, and typed text goes there. Repeat from a button of the sidebar or of the timeline (reach it with Tab), from the file browser and from the diff panel. With two panes, the caret goes to the composer of the focused pane only. With focus in a terminal the key works on macOS. On Windows and Linux Ctrl+L clears the terminal. Open a browser preview and click its toolbar: `mod+l` focuses the URL field. Click inside its page: `mod+l` focuses the URL field too. With an open dialog or menu the key does nothing. Hold the key for two seconds: nothing more happens.
39. Start the app with a new profile: the colors are the dark Tutor palette, also when macOS is in light mode. Settings > Appearance shows "Dark" and "Tutor" as selected. Set "Color scheme" to Light and to Dark: the send button is yellow in both, and the open thread row is pale yellow. Select "T3 Code": the stock colors show. Quit and start again: the stock colors stay. Check the title bar and the window background in both palettes.
40. Open a thread with more than 10 user turns, so that its start shows "Load earlier turns". Press `mod+pageup` again and again: each press puts the next older message of the user at the top of the chat. At the oldest loaded message, one press loads older turns and ends on the next older message. Go on to the first message of the thread. Press `mod+pagedown`: the next message, and after the last one the end of the chat. With two panes, only the focused pane scrolls. With terminal focus the keys belong to the terminal.
41. Open a thread whose pull request has CI that runs: its sidebar row shows an amber mark, the name of a running lane and a time that grows each minute. Hover it: the tooltip lists the lanes. Make a lane fail: the row shows a red mark and the name of the failed lane. Turn auto-merge on for the pull request on GitHub: the row shows "auto" in the next minute. Turn "Show CI status in the sidebar" off: the row shows the stock badge only.
42. Turn "Show the arcade" on in Settings > Appearance > Tutor3: the sidebar footer shows "Arcade". Open it and play each of the three games: Snake with the arrow keys, Shooter with left, right and Space, Runner with Space to jump and the down arrow or S to drop and to roll under a bar. Press W and D: no letter shows in the composer. Click in the composer: the game pauses. Turn the switch off: the button leaves.
43. Open a thread that watches a pull request whose checks run: its sidebar row does not show "Waiting", and the banner over the composer reads "Running · Watching pull request #N". Turn "Watched pull requests do not hold a thread" off in Settings > Appearance > Tutor3 and reload the window: the row shows "Waiting". Turn the setting on again.
44. Open a thread that a pull request watch woke several times with comment-only updates: the chat shows one line "N earlier pull request updates" and the newest update under it. Click the line: the earlier updates show. Click it again: they fold. Press `mod+pageup`: the jump still goes to the last message that you sent. Turn "Fold pull request updates in the chat" off in Settings > Appearance > Tutor3: each update turn shows. Turn the setting on again.
45. Start a Claude turn that starts two `delegate_task` subagents. The "Working for" line shows `· N tokens in context`, equal to the "Context" row of the thread details. Each working subagent row shows its tokens, and the group line shows their sum. A subagent of Claude's own Agent tool shows no number. With "Show token use of running work" off, all of these are gone.
46. Split two threads, one with an open pull request whose CI fails. Its pane shows the chip with a red mark and no second badge. Hover shows the failed lanes. Make the pane narrower than 720 px and click: the pull request opens in the browser. Turn the setting off: the stock badge returns.
47. With the app's own environment and `dale-nix` connected, open a new thread: the line `on <environment>` shows under the headline. Type text and choose `dale-nix`: the project becomes the same repository there, the text stays, and the project picker lists `dale-nix` projects only. Send: the thread runs on `dale-nix`. With the switch off the line is gone.
48. Open the palette with Cmd+K and press Cmd+F: the palette stays open, no find bar shows, and the filter menu opens. Choose an environment and a project: the chip shows both, and the thread list holds only threads of that project. Escape closes the menu, a second Escape closes the palette, and the next Cmd+K shows no chip. With the palette closed, Cmd+F opens the find bar. With "Filter in the command palette" off, the button is gone.
49. Make two panes with threads A and B. With focus in the B pane, click A in the sidebar: the focused pane shows A, the other pane keeps A, its scroll position and no focus mark. Type in one pane: the text shows in both, and the caret stays. Send once: one message. Close one pane: the other keeps the thread. Quit and start: both panes show A. Turn the setting off and click a thread that the other pane shows: that pane takes the focus.
50. The sidebar footer has a music note directly after the Usage button, and no pane has one. With Spotify closed, click the note: the popup says that Spotify does not run, and Spotify does not start. Open Spotify and play a track. Click the note: macOS asks one time to let Tutor3 control Spotify. Allow it. The popup shows the track name and the artist. Press Pause, Next and Previous: Spotify follows each. Move the volume slider: the Spotify volume follows. Press Escape. Put the caret in the composer and press Cmd+Option+M: the popup opens with focus on play/pause. Tab reaches next, the slider, previous. Space pauses. Press Cmd+Option+M again: the popup closes and the caret is in the composer. Deny the permission in System Settings > Privacy & Security > Automation: the popup names that setting. Collapse the sidebar and press Cmd+Option+M: nothing opens. Turn "Show the music control" off: the note leaves.
51. Open a thread on `dale-nix` that runs in a worktree: the bottom bar shows the environment and the branch, and no folder item between them. Open a thread in a local checkout: "Local checkout" shows. Turn "Hide the worktree folder in the bottom bar" off and open another thread: the folder name shows again.
52. Send a prompt with a long pasted text and press `ctrl+c` at once: the text is in the composer at the key press, with no wait, and it shows one time after the message leaves the timeline. In the arcade, play Runner: Space makes a short jump, the down arrow or S drops fast and rolls, and a bar from the top passes only in a roll.
53. Run a turn longer than 10 seconds. After it ends, the footer of its last agent message shows the time and "· worked <the last value of Working for>" with no pointer on it. A short answer shows no label. With the switch off, the label is gone and the footer shows only under the pointer.
54. Open two panes of 720 px or more, with a thread of `dale-claude2` and a thread of `dale-claude3` on `dale-nix`, each with a `https://claude.ai/code/artifact/...` link. Click the link in the first pane: its right panel opens a browser tab with a badge "<account name> account" before the address, on the claude.ai sign-in page. Sign in to that account by hand: the artifact shows. Click the link in the second pane and sign in to the other account: both artifacts show side by side. Settings > Browser > "Browser profiles" lists both profiles. Quit Tutor3, start it, click both links: both artifacts show with no sign-in. Click a link a second time: no second tab opens. Cmd+click a link: the system browser opens. Split to panes under 720 px and click a link: the artifact shows in the floating preview of that pane, with no "too narrow" message. Click another link (not an artifact) in the chat: it opens as the stock setting "Open links in" says. Turn "Open artifact links in the app" off: the artifact link opens as each other link does.
55. With a Claude model selected, type "run this with ultracode please" in the composer. "ultracode" shows in the action color with a soft background from its last letter. Copy, undo and the sent text are unchanged. Pick a model of another provider and the word is plain at once. Turn off "Style Claude keywords in the input" and the word is plain with Claude too.
56. Open two panes. Each pane header has an X at its right end, after the stock controls, and nothing overlaps. Click the X of the pane that has no focus: that pane closes, and the other pane keeps its thread. With one pane, no X shows. Scroll a chat up in a pane: no chat text shows under the composer or under the bar below it. In the sidebar footer, click "Machines": the lines of the machines hide. Click it again: they show. Quit and start the app: the closed state stays.
57. In a split pane, click an artifact link. The floating preview is about 70% of the pane and the page is readable. Drag the corner grip: the size changes. Drag the preview out of its pane: drop zones show on each pane, on each tab and for a new tab. Drop on a side of another pane: a browser pane opens there with the address row and the account badge, and it has no X of the pane kind over its own buttons. Move the browser pane by its header to a tab. Press "Back to floating preview". Press "Open in a split pane" and "Move to a new tab" on the floating preview. Turn off "Browser panes" and "Larger floating preview with a resize grip": the floating preview is stock.
58. With two panes, press the free part of a pane header and drag: drop zones show. Drop on a side of the other pane, on a tab, and on "New tab": the pane moves there with its typed text. Escape cancels. A click on a header button stays a click.
59. Finish a turn in a thread you do not look at. The Mac menu bar shows the icon with "1", in a light and a dark menu bar. A click lists the thread, and a pick opens it. Close the window with Cmd+W: the number goes away. Turn on "Play a sound when a thread finishes", click once in the app, and finish a turn in another thread: one soft sound plays.
60. Turn on the "Context window" item of the thread details. Hover the "Context" row: a popover shows the total, the limit, the growth by turn and the latest request.
61. Select text in an agent message: the empty input shows it in quotes with a Tab hint. Press Tab: the text is in the input. Select other text and right-click it: the menu has "Fill input", "Append to input" and "Copy", and each works. In a split pane, a selection shows only in the input of its own pane.
62. In a `dale-nix` thread, send a message, wait for a long turn, sleep the laptop for some minutes, wake it, open the thread and press Up in the empty input: the message comes back. In two panes, click chat text in one pane, move to the other pane and back by the pane keys, press Up: the message comes back.
63. Open two claude.ai artifact links in a wide pane: two browser tabs in the right panel. Drag one tab inside the strip: it reorders. Drag it out of the panel to the left half of the pane: a browser pane shows that page, signed in. Open a side chat with `/side`, drag its tab to the empty end of the tab strip: a new tab shows the side chat. In a narrow pane, the floating preview of an artifact shows a bar on its top edge: drag it to move the preview, and out of the pane to the zones. Hover the bar and click each button of the row.
64. Start a Claude turn that runs a workflow in the background, and let the turn end while the workflow works. The background work bar at the end of the chat shows the workflow's tokens before its time, the same number as the workflow row. The fold line of the turn shows "Worked for ... · N tokens", and the footer of the turn shows its time with no tokens. When the workflow ends, the bar leaves, the fold line has no number, and the footer shows "· N tokens". With "Show token use of running work" off, the bar and the fold line are stock.

## Known differences from stock in multi mode

1. Pane headers do not drag the window. The tab bar does.
2. A toast still appears for a thread that is visible in a passive pane.
3. A pane narrower than 720 px has no right panel: no toggle in its header, no panel, and no right-panel keys. A request for a panel surface there (a file link, the diff of a turn, `/side`) gives a message and opens nothing. The panel returns when the pane is 720 px or wider. Stock decides its sheet layout from the window width, which is still the rule for a wide pane in a window of 980 px or less. See "Small panes".
4. A pane with no thread exists only when no project exists. It takes a draft when a project loads. While such a pane has focus, the sidebar highlight and the URL stay on the previous thread, and a click on that highlighted thread does nothing.
5. Panes have no split button of their own. Use the keys or the tab bar buttons. In single mode the first split is keyboard only. A pane of a tab with 2+ panes has a close button in the top right corner of its header (Dale asked on 2026-11-20: "also need an x to close panes"). It is `apps/web/src/panes/PaneCloseButton.tsx`, mounted by `PaneCell`, with no upstream edit. `panes.css` moves the stock header controls 1.75rem to the left (`--workspace-controls-right: 2.5rem`) and makes the header reserve that much more room (`[data-chat-header] > .pr-24`). A tab with one pane has no such button: the close button of its tab closes it. Rebase check: the header must still reserve the room of its controls with the class `pr-24`, and the stock controls must still read `--workspace-controls-right`.
6. With 2+ tabs, the sidebar's hold-Cmd number hints show thread numbers, but `mod+1` to `mod+9` select tabs.
7. Only the active tab is mounted. A tab switch loads its panes again. Scroll positions and terminal viewports of the old tab are not kept.
8. F6 cycles the sidebar and the focused pane only. `ctrl+alt+arrow` or a click reaches the other panes.
9. Each pane owns its draft (see "Panes and drafts"). With 2+ panes or 2+ tabs, two stock flows therefore make a new draft where stock uses the open draft again: New thread (`mod+n`) on an empty draft, and a pull request checkout from a draft. The pane then shows the new draft, and the branch, worktree and mode picked on the old empty draft are not carried over. A draft with text stays in the sidebar. One tab with one pane works as stock.
10. On pages with no thread (pull requests, issues, project pages) the grid and the tab bar are absent. The layout returns with the next thread route.
11. Where `mod` is Ctrl (Windows, Linux), `ctrl+alt+arrowleft` and `ctrl+alt+arrowright` are both "focus pane" and "previous or next tab". The focus rule wins with 2+ panes.
12. The new-thread screen in a pane centers the headline and the composer as one block. Stock centers the composer and puts the headline above it. A pane too short for the block shows it from the top and scrolls.
13. A pane narrower than 640 px uses the stock phone gutters for the timeline and the composer, and the stock phone size of the new-thread headline. A pane below 320 px of height has a 40 px header, a one-line composer and the strip close under it, and its new-thread screen shows the project picker without the question above it. A new-thread screen that does not fit its pane shows the composer, and the rest scrolls into view from above. In a pane, a long prompt stops under the pane header, and the model button shows no effort word below 280 px of width.
14. After a restart, a pane whose draft is gone takes a new draft in the project that was used last. The project of the lost draft is not known then.
15. A focus key goes to the neighbor that had focus last on that side. On an even split with no such neighbor, it goes to the first pane in tree order (top or left).
16. The same draft can be open in two tabs after a sidebar click on it. After a restart only the first of those panes shows it, and the other pane takes a new draft.
17. A tab that is not mounted and holds a thread that was deleted is labeled "Thread" until the tab opens. Its pane then takes a new draft. A thread that the shell does not list can still exist, so the label does not say "New thread" before that.
18. In a pane below 320 px of height, an open terminal drawer covers the timeline and the composer. Stock keeps the composer above the drawer at every window height. Close the drawer to see the chat.
19. With 2+ panes or 2+ tabs, a terminal drawer that opens restores a maximized right panel of its thread. In stock, and with one tab and one pane, the panel stays maximized and the drawer does not show.
20. In a terminal drawer narrower than 400 px, the terminal list is 5.5rem wide. Stock uses 9rem at every width.
21. A pane keeps the strip under the composer after a thread starts, and a narrow strip keeps the branch name (see "Bottom bar in panes"). Stock shows the strip of a started thread only with the "composer context" setting on.
22. With "Free a pane when its thread settles" on, a pane whose thread settles after its pull request merged takes a new draft thread. Stock keeps the settled thread open. One tab with one pane keeps it too.

Differences from stock that do not depend on the number of panes: the fork settings that are on by default (see "Fork settings"), the key `mod+arrowdown`, which scrolls the chat to its end where stock has no key, the key `ctrl+c`, which stops a running turn and takes back a message that was sent a moment ago, where stock has no key, and the key `mod+l`, which puts the caret in the composer where stock has that key only for the URL field of a focused browser preview (see "Keys").

## Untested assumptions

1. Electron: the tab bar as a window drag region, the traffic lights against the tab bar, and the no-drag rule for headers inside a pane. The layout was checked in headless Chromium only.
2. Keys that the Electron shell or macOS can take first: `ctrl+tab`, `ctrl+alt+arrow`, `mod+alt+arrow`. Every key with real terminal focus.
3. Terminals: a pane keeps hidden terminal drawers for threads it showed before (`apps/web/src/components/chat/ChatTerminalDrawers.tsx`). One terminal session can then mount in two panes. A read-only check in a dev stack saw no effect on focus, typing or the terminal size with one session mounted two times. The cost with many such mounts was not measured. Deferred: `maxHiddenThreadCount: 0` in multi mode, which is one more hunk file.
4. Frames: a press inside an `iframe` of a passive pane focuses that pane (window `blur`, then the active element). The same rule is written for the Electron `<webview>` of the browser preview. It was not run in the packaged app.
5. Identity sites that still hold stock values: `apps/desktop/src/app/DesktopEnvironment.ts` (`com.t3tools.t3code`), `packages/shared/src/codexAuthHandoff.ts` (a `t3code://auth/codex` return URL, a scheme the fork app does not register) and `packages/shared/src/managedPolicyFile.ts`. The Codex auth return may open the stock app.
6. Hunk sets C1 to C8, D, E, L, N and O have no automated test of the hunk itself. The packaged-app checklist covers them by hand. The pane browser tests cover B5 (a stock window key acts in the focused pane only, also `terminal.toggle`), C10, C12 and C15 (the narrow pane has no panel, no toggle and no panel keys, and refuses a request for a surface) and the pane navigation of set B. C17 (`/side` in a narrow pane) has a unit test of the reason only: the fake test environment does not offer side chats. It was run in a dev stack on 2026-11-18: the message showed, the text stayed, and no side chat thread was made. The render scenario `apps/web/test/panes.renders.tsx` covers C16. The `paneNarrow` part of C4 to C6 (the preview key and the desktop menu action) and C11 have no automated test. Unit tests cover the code behind set D (`resolvePaneThreadRef`) and behind C13 and C14 (`startNewThreadInPane`), not the call sites. Sets F3 and K were reproduced by a reviewer before the fix, and have no test of their own. The two browser tests of the stop key cover the two hunks of `r4-stop-turn`.
7. `contain: layout` on a pane anchors the three inline `fixed` elements of the chat view to the pane. A future inline `fixed` element in upstream would also anchor to the pane.
8. Divider drag has no automated test. The clamp logic has unit tests in `apps/web/src/panes/paneTree.test.ts`.
9. Performance: "Render cost" in "Small panes" has the measured counts for 12 panes. The times are from the React development build on a loaded machine. A production build and the packaged app were not measured. Threads with long tool output, 12 running turns at one time, and 12 open terminals were not measured.
10. The fork strings are English only and are in no translation catalog. No i18n command was run with them (see "Acceptance checks": `i18n:generate` must not run in the fork).
11. A deleted thread in a passive pane: the pane relies on the stock missing-thread redirect. The browser test covers the same redirect for a draft that is gone. The fake test environment cannot delete a thread.
12. Thread find keeps one timeline for the whole app (`apps/web/src/components/chat/threadFindStore.ts`). With two panes, find in the focused pane can lose its start position when the other pane rendered last. Not fixed: the fix is a hunk in one more upstream file.
13. An async step of a chat view that started while its pane had focus, such as a send that fails later, keeps its own pane's composer. A reviewer reproduced that "send and new thread" followed at once by a focus move put the follow-up draft in the other pane. Hunks C13 and C14 now open that draft in the pane that sent. The fix has a unit test of the pane action. The reviewer's script was not run again against it.
14. A press on a stock keep-focus control in a passive pane: the browser test uses a stand-in button that cancels `pointerdown`, not the real "Scroll to end" or microphone button.
15. A stored layout with 2+ panes wins over an empty draft on the first thread route of a session. If the session starts on a page with no thread and the user then asks for a new thread, that first empty draft is not shown. A second request works.

16. Small panes were checked in headless Chromium only, with the web header: in the light theme in the browser tests, and in the dark theme in a dev stack at 200 x 140 px and 304 x 216 px. The Electron header has other classes (`drag-region`, `px-3 sm:px-5`) and was not seen at 200 x 140 px. The model button was measured with two labels only ("6 Astra Medium" and the Replay names). A Claude model label was not seen.
17. In a pane below 320 px of height, a pending approval or question above the composer was not checked. It can need more height than the pane has. While a terminal drawer covers such a pane, an approval that arrives does not show until the drawer closes.
18. A pane that becomes narrow while its right panel holds a browser preview or a terminal: the surface unmounts with the panel and mounts again when the pane is wide. A panel terminal kept its session and took a command after the pane was wide again (dev stack, headless Chromium). The effect on a page that is loading was not checked. Stock keeps a focus request for a panel terminal that is not mounted (`focusActivePanelTerminal` in `apps/web/src/lib/terminalFocus.ts`), so focus can move to that terminal when the pane becomes wide. This was not seen and not tested.
19. The terminal was checked in a dev stack in headless Chromium, with real shells, in the light theme. `apps/web/src/panes/paneTerminal.browser.test.tsx` uses a stand-in for the terminal surface, and covers the layout and the focus rules only. The packaged Electron app was not checked. The narrow terminal list (below 400 px) has no automated test.
20. The first frame of a pane: `PaneCell` takes its first size class from the grid box (or from the window, as an upper limit) and measures its own box before the paint. A reload of a layout whose window is wide and whose pane is narrow can still mount the stored-open right panel and remove it before the paint. A frame probe in a dev stack saw no frame with a panel in a narrow pane after a split, a tab switch and a reload.
21. The guard of the right panel store (`paneNarrowPanel.ts`) was run with "Changes" of the thread details and with `/side`. A file link, a terminal link, an attachment and the device panel go through the same store actions and were not clicked.
22. The features of round 3 were run together in one dev stack, in headless Chromium, on this Mac (see "Fork settings"). Each feature section has its own list of items that were not verified. None of them was run in the packaged Electron app or against `dale-nix`.
23. `apps/web/src/panes/paneContextStrip.browser.test.tsx` closed a new pane through the store before the navigation to its draft had ended. The late route then put the draft in the pane that was left. The test failed in 3 of 5 runs of the whole folder, and now waits for the route. The pane keys do not have this order: `closeFocusedPane` navigates after it closes, and the later navigation wins. A close of a pane through the tab bar in the same instant was not run.
24. The stop key (`layout.stopTurn`) ran in the unit tests and in two browser tests with the fake environment only. In those tests the test code plays the server: it emits the events of the stopped run and of the rollback. It also ran against a real server with the Replay provider (see "Checked on 2026-11-18" in the section "Keys"). Not run: a real provider such as Claude or Codex, the packaged app, macOS, and a real copy with Ctrl+C on Windows or Linux. A first turn that the key stops before its provider turn starts has no rewind target, so it ends as "stop only" after the 10 s wait. This is read in the server code and was not run. How each provider adapter other than the Replay adapter rolls back a turn that was stopped before it wrote output was not run. A provider that reports an error item for a stopped turn would make each take back end as "stop only". The focus rule reads focus only: the fork still takes the key while a spreadsheet or a browser page shows in the panel and focus is in the chat. The focus rule ran with a text field in a plain element that has the stock attribute, not with the stock spreadsheet viewer, browser page or mini player. A send of a second message in the moment the stopped run settles ran in the unit table only.
25. The focus-input key (`layout.focusInput`) ran in the unit tests, in one browser test with the fake environment, and in a dev stack from a sidebar button with one pane and with two panes, each in headless Chromium on Linux, where `mod` is Ctrl. That test presses the key from a button of the tab bar. It also covers one of the four states in which stock disables the prompt editor: a question that allows only its fixed answers. The other three states (an answer that the client sends, a draft that needs a project, speech input) did not run. The rules for a browser preview, a floating layer, a hidden composer and terminal focus ran in the unit tests only, where the test supplies the answer of each DOM reader. Not run with the real DOM: focus in the sidebar search field (a sidebar button ran), in the file browser, in the diff panel and in a pull request surface, a browser preview (the URL key, and the key that the desktop app forwards from a preview page), an open dialog or menu, a maximized right panel, a short pane with an open drawer, and a real terminal (on Linux Ctrl+L must still clear it). Not run at all: macOS, where the key is Cmd+L, the packaged app, and a second press in a browser with an address bar. The stock app menu has no item on Cmd+L (read in `apps/desktop/src`), so no menu takes the key first. This was not seen in the app.
26. The Tutor theme was seen in headless Chromium on Linux only, in five views: a new thread, a thread with a waiting approval, and the Appearance settings page, in the light palette and in the dark palette. Not seen: the packaged Electron app and its title bar, a diff, the terminal, the right panel, a dialog, an error or warning banner, and the pane tab bar. The style rule for `text-primary` covers the variants that the stock markup has at `v0.1.10`. A yellow border or a yellow 2 px line on white (`border-primary`, the selected tab) has a low contrast and was not changed.
27. The message-jump keys (`layout.previousMessage`, `layout.nextMessage`) ran in unit tests and in a dev stack with the Replay provider, in headless Chromium on Linux (see "Keys"). They have no browser test. The turns of that thread were short: one message and one answer of a few words. A row that the list did not measure yet has an estimated position, so in a thread with long turns a jump over rows that never rendered was not seen.
28. The CI status of a sidebar row ran in unit tests and in one browser test with the fake environment, where the test code answers the summary request and the checks request. It did not run against a real server or a real pull request. The 38 px fault of the message-jump keys (checklist item 40) was seen in the Mac app only. The fix was not seen there: in a dev stack on Linux the fault did not show before the fix.
29. The arcade ran in a dev stack in headless Chromium only (see "Arcade"). The rules of the three games have unit tests. The board has no browser test, and nobody played a long game: the balance of the shooter and of the runner at high scores was not seen.
30. The hold of a pull request watch (section "Pull request watch") ran in unit tests only, with a task as a stock server sends it. No test and no dev stack had a real watched pull request, so the label of a real thread on `dale-nix` was not seen. The fix for the wake on an edited comment is not in the fork.
31. The fold of pull request updates ran in unit tests and in one browser test with the fake environment, where the test builds the notification items. It did not run against a real server or a real watched pull request, so the outcome `updated` of a real comment-only wake was read in the server code only. The rows of a real update turn (for example a turn with stock-collapsed work after a reload) were not seen.
32. Token use of running work was checked with token reports from the fake server of the browser tests only. Not run: a real provider, a workflow, a Codex subagent, and the count of child thread subscriptions in a browser client with many working subagents.
33. The pull request chip with a real pull request and a real server: the running time, auto-merge, a stack, and the click that opens the right panel. The chip hunk has an anchor of its own (`{trailing}`).
34. The environment control of a new thread ran with two servers on one machine and no turn. Not checked: the Mac app with `dale-nix`, a send after a move, attachments through a move, Auto balance.
35. The palette filter with two or more real environments, with a project that has a copy in two environments, on macOS (`cmd+f`) and in the packaged app. The environment step ran only in a browser test with made-up environments. The setting was added at the merge and has no test of its own.
36. Mirror panes ran in unit tests and in browser tests with the fake environment only. Not run: a dev stack, the packaged app, a real server or provider, a running turn in a mirror, an approval in both panes, the right panel, the terminal drawer and the paste chips of a mirror, three panes on one thread.
37. The music control ran on Linux only: unit tests with a stand-in for `osascript`, and one browser test with a stand-in for the bridge. No AppleScript line ran against Spotify. Not seen: the text that the state script returns, a track name with unusual characters, the error text and code when macOS refuses (-1743 is assumed), what `is running` returns on a Mac with no Spotify, the permission question and whether `NSAppleEventsUsageDescription` is enough for an ad-hoc signed app, Cmd+Option+M in the packaged app, a podcast or a local file as the track.
38. The hidden worktree folder of the bottom bar has a unit test of its rule only. The style rule that hides the item and its separator ran in no browser.
39. The stop key returns the text at the key press (changed on 2026-11-19): this ran in unit tests and in the two browser tests with the fake environment. Not run: a real server, where the delay that Dale saw comes from, and attachments of a taken back message.
40. The file `threadCiStatus.ts` was renamed to `ciStatus.ts`, and `pullRequestChip.ts` to `prChipState.ts`, because each differed from its component file (`ThreadCiStatus.tsx`, `PullRequestChip.tsx`) by letter case and extension only. On the case-insensitive disk of a Mac an import without extension could resolve to the wrong file. Whether the earlier Mac build had that fault was not checked.
41. The working time label with a real server: a turn continued after a restart, a usage limit or a manual "continue", a wake by a background task, and a wake by a pull request watch. Unit tests use hand-made run records.
42. Artifact links (section "Artifact links") ran on Linux only: unit tests, and one browser test with a stand-in for the one question about the desktop bridge. No Electron `<webview>` opened claude.ai, no sign-in was made, and the partition of a profile and its cookies on disk were read in the stock desktop code only. Not seen: whether claude.ai accepts a sign-in in the app's `<webview>` (Google sign-in and passkeys can refuse an embedded browser), the badge in the real tab chrome, the floating preview with a real page in a narrow pane, and a real remote environment.
43. The fork finds "ultracode" with the stock rule of "ultrathink". The rule of Claude Code itself was not read, and no real turn with the word ran. Also not run: the packaged Electron app, right-to-left text, and input method composition.
44. The larger floating preview and the browser pane (section "Browser pane") ran on Linux only, with no Electron. The page size that the fork writes to `fittedSourceContent`, the grip and the drop zones above the webview layer, and pointer capture over a page were read in the stock code only. No `<webview>` and no claude.ai page ran. A browser pane whose thread is deleted stays with the title "Thread". The close key does nothing on a browser pane that is the last pane of the last tab.
45. The close button of a pane, the smaller gap under the bottom bar and the "Machines" header were seen in headless Chromium, where the header has the web classes. The Mac app uses the Electron header classes (`drag-region`, `px-3 sm:px-5`), which no run showed.
46. The chat pane drag ran in headless Chromium only. A press on the header of a passive pane keeps the stock blur, so a covering terminal takes the keys (fixed at the merge, `paneTerminal.browser.test.tsx`).
47. The menu bar item (Electron `Tray`, the template icon at 1x and 2x, the title beside it, the menu) and the finish sound through real speakers were never seen. This work was built on Linux.
48. The context breakdown shows provider reports only, by turn, not by kind. It was not seen with a real provider.
49. Selection to input ran in headless Chromium only. The native context menu of the Mac app, a side chat and a split pane with two threads were not seen.
50. The input history memory ran in unit tests only. No real reconnect with a bounded snapshot ran.
51. The drag of right-panel tabs and the hold bar of the floating preview ran in headless Chromium only, with no page in a webview. A drag over a browser pane page, a real side chat, the sheet and the maximized panel were not seen.
52. Live token use (section "Live token use") ran in unit tests and in one browser test with the fake environment only, where the test code sends the provider turn and its `turnTokenUsage`. Not run: a real provider, a real workflow, a thread on `dale-nix` with a stock `v0.1.10` server, the packaged app, and a bar with two or more subagents.

## Credits

The pane code was written new for this fork. No code was copied from a pull request. These open upstream pull requests were references for the design:

- #32253 by BonJenn (split-pane view for up to six conversations): the gate of composer focus by pane. The fork keeps it as a fallback that is not applied.
- #30868 by necip-yolcu and #32309 by Yousef-Senada (two threads side by side): the app-wide composer handle follows the focused pane.
- #28845 by maria-rcks (workspace panes): the `layout.*` command names, where that pull request has an equivalent command.

T3 Code is MIT licensed. The `LICENSE` file is unchanged.

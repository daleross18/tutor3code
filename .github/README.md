# Tutor3

Tutor3 is a fork of [T3 Code](https://github.com/pingdotgg/t3code) `v0.1.11`. It is a separate Mac app. It runs beside the stock T3 Code app and does not share data with it.

- The code is on the `main` branch.
- [FORK.md](../FORK.md) describes each change in full, and how the fork is built.
- Each addition has a switch in Settings > Appearance > Tutor3.

## Install on a Mac

The build is for a Mac with Apple silicon. It has no Apple developer signature and no auto-update.

1. Download the `.dmg` file. Leave it in **Downloads**.
2. Run this command in Terminal:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/daleross18/tutor3code/main/scripts/fork/install-tutor3.sh | bash
   ```

   The script finds the newest Tutor3 `.dmg` in Downloads, quits Tutor3 if it runs, copies the app to **Applications**, removes the download mark, signs the app on this Mac, and starts it. The stock T3 Code app keeps running. For a `.dmg` in another folder, run the script with its path: `curl -fsSL <the URL above> | bash -s -- <path to the .dmg>`.

To update, download the new `.dmg` and run the same command. Threads, environments and settings stay: they are in `~/.tutor3`.

After each install, macOS asks whether Tutor3 may use its Keychain item. Click **Always Allow**. The question comes back with the next install, because each build has a new local signature.

Builds before 2026-11-23 kept their data in `~/.t3-panes`. The install script moves it to `~/.tutor3` one time, with the saved sign-ins.

If the script fails, install by hand:

1. Open the `.dmg` and drag **Tutor3** into **Applications**.
2. macOS blocks an app that has no developer signature. Run these two commands in Terminal:

   ```sh
   xattr -dr com.apple.quarantine /Applications/Tutor3.app
   codesign --force --deep --sign - /Applications/Tutor3.app
   ```

3. If an older build ran on this Mac before 2026-11-23, move its data once, with Tutor3 quit:

   ```sh
   mv ~/.t3-panes ~/.tutor3
   mv ~/Library/Application\ Support/t3code-panes ~/Library/Application\ Support/tutor3
   ```

   Sign in to claude.ai again in Tutor3 after a move by hand.

4. Start Tutor3.

## Connect it

- **This Mac:** Tutor3 starts its own local server. A provider must be installed and signed in on the Mac, for example Claude Code or Codex.
- **A remote machine:** the machine must run a T3 Code server (a stock `0.1.10` or `0.1.11` server works). Run `t3 pair` on that machine. Then, in Tutor3, use **Add environment** and enter the host and the pairing code.

## What is different from stock T3 Code 0.1.11

Layout:

- Split panes: split right with Cmd+D and down with Cmd+Shift+D. Each pane has its own thread, draft and input.
- Tabs: Cmd+T opens a tab. Each tab holds its own pane layout.
- The pane layout and the tabs are saved across a restart.
- Each pane of a tab with two or more panes has a close button (X). Cmd+W also closes a pane.
- Ctrl+Option+arrow moves the focus between panes. Cmd+1 to Cmd+9 select a tab.
- In a tab with two or more panes, each pane without focus is a little faded, so the pane with focus stands out.
- Double-click a tab to rename it, or right-click it and choose "Rename tab". An empty name gives the tab its automatic name again.
- The same thread can be open in two panes.
- A pane whose pull request merged, and whose thread settled, takes a new thread.
- A narrow or short pane uses a compact header and input.
- Chat density: Normal, Compact or Very compact, with a separate density for split panes.
- The floating browser preview can become a pane: drag it to a side of a pane, to a tab, or to a new tab.
- Drag a pane by its header to a side of another pane, to a tab, or to a new tab.
- Drag a browser tab or a side chat tab out of the right panel: it becomes a pane in the same places. A drop on the empty end of the tab strip opens a new tab.

Chat and input:

- Ctrl+C stops the turn of the focused pane. A message that was sent a moment ago returns to the input.
- Text that you select in a chat shows in the empty input. Tab puts it there. A right click on it gives "Fill input" and "Append to input".
- The Up key recalls sent messages also after a reconnect or a sleep, and after a return to a pane.
- Cmd+Down scrolls the chat to its end. Cmd+L puts the caret in the input.
- Cmd+PageUp and Cmd+PageDown go to the previous and the next user message.
- A finished turn shows its total working time and the tokens it used.
- Running work shows its token count.
- While a thread still works, the background work bar and the "Worked for" line show the tokens used so far.
- The Context row of the thread details shows how the context grew, turn by turn, on hover or click.
- Repeated pull request update turns fold into one line.
- A watched pull request does not keep its thread in "Working".
- The words "ultracode" and "ultrathink" have a color in the input when the model is a Claude model.
- A long paste can collapse into a chip (off by default).

Bars and sidebar:

- The bar under the input stays in each pane after a thread starts, and shows the environment and the branch.
- That bar shows the pull request of the thread: state, number, checks and auto-merge.
- That bar hides the worktree folder when the server gave the folder its name.
- No chat text shows under the input in a pane.
- The sidebar shows the CI status of the pull request of each thread.
- The Mac menu bar shows the number of finished threads that you have not opened. A click lists them.
- A sound can play when a thread finishes (off by default).
- The sidebar footer shows the free memory of each connected machine, and the free disk space of the Mac. The header "Machines" hides it.

New threads and search:

- The new-thread screen has a control to choose the environment.
- The model picker shows the quota of each Claude account. A new thread uses the account with the most quota left.
- The command palette (Cmd+K) has a filter by environment and project. Cmd+F opens it.
- A thread can show a preview link, from one URL template for each repository.

Claude artifacts:

- A claude.ai artifact link opens in the app. Each Claude account has its own signed-in browser profile.
- The floating preview of an artifact starts at about 70% of its pane, and has a grip to change its size and a bar on its top edge to move it.

Look and identity:

- The default theme is "Tutor" (dark). The theme "T3 Code" gives the stock colors.
- The app has its own name, icon and data folder (`~/.tutor3`).

With one tab, one pane, and each Tutor3 switch off, the app looks and behaves like stock T3 Code.

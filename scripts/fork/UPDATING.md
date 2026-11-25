# Updating Tutor3 to a new T3 Code release

A runbook for an agent that moves the fork to a newer upstream stable tag. FORK.md has the background: "Rebase to a new stable tag" and "Upstream edits (hunk list)". This file has the order of work and what went wrong before.

## Rules

- Work in a separate git worktree next to the repo (`git worktree add ../tutor3code-wt-<tag> -b wt/rebase-<tag> main`). `main` changes only at the end.
- Every upstream edit is a hunk in `scripts/fork/apply-pane-hunks.ts`. Never hand-edit an upstream file. Fork code lives in fork-owned new files (FORK.md "Where the fork code lives").
- No edits to `apps/server`. Remote machines run a stock server that can be older than the client (`dale-nix` ran 0.1.10 while the client moved to 0.1.11).
- Push only when the owner says so. A push of `main` is a force push.
- One heavy job at a time (install, typecheck, tests, dev stack), under `nice -n 10`.

## Steps

1. Pick the tag: `git fetch origin --tags`, then the newest stable `vX.Y.Z` (not a nightly). Note the old tag (the base of `main`) and the number of upstream commits between them.
2. Make sure `main` is three commits on the old tag: `git log --oneline <old tag>..main | wc -l` prints 3. If not, run `scripts/fork/squash.sh <old tag>` first.
3. In the worktree: `git rebase --onto <new tag> <old tag> wt/rebase-<tag>`. The identity commit and the new-files commit normally apply. The hunks commit conflicts.
4. At the conflict, take the upstream side of every conflicted file, then apply the hunks again:

   ```sh
   git checkout --ours -- $(git diff --name-only --diff-filter=U)
   node scripts/fork/apply-pane-hunks.ts
   ```

   For each hunk that reports `missing`, compare the code around the old anchor (`git show <old tag>:<path>`) with the new code. Change the anchor and the replacement so the fork behavior stays the same. "pending" hunks in the same file wait for the missing one. A hunk whose job upstream now does is dropped, with a note. Each anchor must be stock text of the new tag that no other hunk uses. To start a file again: `git show <new tag>:<path> > <path>`, then run the codemod.

5. `node scripts/fork/apply-pane-hunks.ts --check` must pass. Then `pnpm install --frozen-lockfile` (the lockfile is upstream's).
6. Typecheck `apps/web`, `apps/desktop`, `packages/contracts` and `packages/shared`. Fix errors in fork files to match the new upstream API. An error in an upstream file means a hunk is wrong.
7. fmt, lint (`--report-unused-disable-directives`) and knip. New upstream lint rules can flag fork code. Example: 0.1.11 added `t3code/no-untranslated-copy`, and the fork excludes `apps/web/src/panes/**` with hunk set `r13-english-copy`.
8. Tests: the `apps/web` unit tests of `src/panes`, `scripts/fork/apply-pane-hunks.test.ts`, the desktop `fork*.test.ts`, and the shared pane tests. Run the pane browser tests in two batches (`ls src/panes/*.browser.test.tsx | head -12`, then `tail -n +13`). One run of the whole folder hangs.
9. `git add -A && GIT_EDITOR=true git rebase --continue`, then `scripts/fork/squash.sh <new tag>`. It must print 3 commits and no tree difference.
10. Review before push. Typecheck does not catch these three kinds of break. Check each one.
    - **Old server.** Diff `packages/contracts` and `packages/client-runtime` between the tags. Each new RPC, setting or route that the client uses must be checked against a capability flag of the server config. Example: 0.1.11 read a missing `enablePreviewTunnel` as true, so browser tabs of a 0.1.10 server broke. Hunk set `r14-old-server` checks `capabilities.previewTunnelSetting` and `capabilities.issues`.
    - **DOM and CSS that the fork reads.** Grep the new tree for each selector, data attribute, aria label and class name in `apps/web/src/panes` (`*.css`, `querySelector`, `closest`). Example: 0.1.11 translated the aria label that `panes.css` selected, and a click on assistant text now focuses the message body, not the chat scroller (`paneFocusMemory.ts`).
    - **Hunk meaning.** For each changed hunk, and each hunk file that upstream changed a lot (`git diff --stat <old> <new> -- <hunk files>`), the fork behavior must be the same as on the old tag. One tab, one pane and every fork setting off must still be stock.
11. Smoke test in a dev stack with its own home: `T3CODE_DEV_AUTH_TOKEN=$(openssl rand -hex 32) node scripts/dev-runner.ts dev --home-dir <scratch dir> --no-seed`. Wait for `pairingUrl` in the log. With Playwright (from `apps/web`) and the Replay provider (`window.t3dev.replay("multi-turn")`):
    - split a pane with Ctrl+D, and close a pane with its X;
    - select chat text, press Tab, then right-click it to fill the input;
    - check that the page shows no error.

    Stop the stack by its own task, and delete the scratch home.

12. Update FORK.md and `.github/README.md`:
    - the base tag where it names the current base;
    - the hunk table rows that changed, the totals line and the carried-diff table;
    - a dated note under "Rebase to a new stable tag": the tag, the number of upstream commits, each hunk that changed and why, each fork fix.
13. With the owner's yes: move `main` to the result (`git reset --hard wt/rebase-<tag>` on `main`, after `git update-ref refs/backup/main-pre-<tag> main`), push with `git push --force-with-lease=main:<old remote tip> fork main`, then remove the worktree.
14. Give the owner the laptop build prompt with the new commit, the new base tag and the new hunk count. The Mac app is built on the laptop only.

## Squash at any time

`scripts/fork/squash.sh <base tag>` rebuilds the three commits from the current branch and checks that the tree is the same. Run it before each push.

- The identity commit keeps the files it already had.
- Each file that the base tag does not have goes into the new-files commit.
- Each other change goes into the hunks commit. A later change to an identity file (bundle id, app name) also lands there. Move it into the identity commit by hand when that matters.

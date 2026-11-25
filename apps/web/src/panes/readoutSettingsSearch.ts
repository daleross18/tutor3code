import type { SettingsSearchItem } from "../components/settings/settingsSearch";

/** The environment and account rows of the fork section in Settings > Appearance. */
export const READOUT_SETTINGS_SEARCH_ITEMS = [
  {
    id: "environment-resources",
    title: "Show environment resources",
    to: "/settings/appearance",
    searchTerms: ["free disk space memory ram sidebar footer machine box"],
  },
  {
    id: "account-quota",
    title: "Show account quota",
    to: "/settings/appearance",
    searchTerms: ["claude usage limits 5-hour 7-day weekly fable model picker account"],
  },
  {
    id: "new-threads-most-quota",
    title: "New threads use the account with the most quota left",
    to: "/settings/appearance",
    searchTerms: ["claude usage limits headroom account pick automatic default provider"],
  },
  {
    id: "ci-status",
    title: "Show CI status in the sidebar",
    to: "/settings/appearance",
    searchTerms: ["checks lanes pull request running failed auto-merge merge github actions"],
  },
  {
    id: "pr-watch-hold",
    title: "Watched pull requests do not hold a thread",
    to: "/settings/appearance",
    searchTerms: ["pr watch waiting working checks pending done settled background monitor"],
  },
  {
    id: "pr-update-fold",
    title: "Fold pull request updates in the chat",
    to: "/settings/appearance",
    searchTerms: ["pr watch ci progress comments wake collapse condense hide timeline turns"],
  },
  {
    id: "work-tokens",
    title: "Show token use of running work",
    to: "/settings/appearance",
    searchTerms: ["tokens context usage working subagent subagents turn timeline running agent"],
  },
  {
    id: "pr-chip",
    title: "Show the pull request in the bottom bar",
    to: "/settings/appearance",
    searchTerms: ["pr chip ci checks status composer strip pane split auto-merge number"],
  },
  {
    id: "draft-environment",
    title: "Choose the environment on a new thread",
    to: "/settings/appearance",
    searchTerms: ["machine host run on remote project follows draft new thread screen picker"],
  },
  {
    id: "mirror-panes",
    title: "Open a thread in the current pane when another pane shows it",
    to: "/settings/appearance",
    searchTerms: ["mirror same thread two panes split focus switch session duplicate"],
  },
  {
    id: "music-control",
    title: "Show the music control",
    to: "/settings/appearance",
    searchTerms: ["spotify music player play pause next previous volume sidebar footer song"],
  },
  {
    id: "hide-worktree-folder",
    title: "Hide the worktree folder in the bottom bar",
    to: "/settings/appearance",
    searchTerms: ["worktree folder name label id pwd path bottom bar strip branch redundant"],
  },
  {
    id: "palette-filter",
    title: "Filter in the command palette",
    to: "/settings/appearance",
    searchTerms: ["command palette search filter environment project find key cmd f"],
  },
  {
    id: "worked-time",
    title: "Show the working time of a finished turn",
    to: "/settings/appearance",
    searchTerms: ["worked for duration elapsed total time turn done finished footer message"],
  },
  {
    id: "artifact-links",
    title: "Open artifact links in the app",
    to: "/settings/appearance",
    searchTerms: ["claude artifact link browser account signed in session cookies profile"],
  },
  {
    id: "thread-artifacts",
    title: "List artifacts in the thread details",
    to: "/settings/appearance",
    searchTerms: ["claude.ai artifact page published link copy open details menu"],
  },
  {
    id: "claude-keywords",
    title: "Style Claude keywords in the input",
    to: "/settings/appearance",
    searchTerms: ["ultracode ultrathink keyword highlight color composer prompt typing claude"],
  },
  {
    id: "large-floating-preview",
    title: "Larger floating preview with a resize grip",
    to: "/settings/appearance",
    searchTerms: [
      "artifact preview floating inset size resize grip handle bigger small browser hold bar move pip",
    ],
  },
  {
    id: "browser-panes",
    title: "Browser panes",
    to: "/settings/appearance",
    searchTerms: [
      "artifact preview browser split pane tab drag drop zone move floating inset right panel side chat",
    ],
  },
  {
    id: "drag-panes",
    title: "Drag panes to move them",
    to: "/settings/appearance",
    searchTerms: [
      "drag drop move pane chat header split side tab new tab rearrange reorder tabs layout",
    ],
  },
  {
    id: "context-breakdown",
    title: "Show a context breakdown",
    to: "/settings/appearance",
    searchTerms: ["context window tokens breakdown usage turn cache input output free hover popup"],
  },
  {
    id: "menu-bar-unread",
    title: "Show unread finished threads in the menu bar",
    to: "/settings/appearance",
    searchTerms: ["mac menubar tray status item count number badge done completed unseen"],
  },
  {
    id: "finish-sound",
    title: "Play a sound when a thread finishes",
    to: "/settings/appearance",
    searchTerms: ["audio chime ding beep notification alert done completed turn ends"],
  },
  {
    id: "selection-to-input",
    title: "Offer selected text to the input",
    to: "/settings/appearance",
    searchTerms: [
      "select selection highlight quote fill append paste tab right click context menu",
    ],
  },
  {
    id: "keep-prompt-history",
    title: "Keep input history after a reconnect",
    to: "/settings/appearance",
    searchTerms: ["up arrow recall previous message prompt history reload reconnect sleep"],
  },
  {
    id: "fade-unfocused-panes",
    title: "Fade panes without focus",
    to: "/settings/appearance",
    searchTerms: ["dim faded unfocused inactive passive split pane veil focus highlight"],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

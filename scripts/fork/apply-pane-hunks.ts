#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off

/**
 * Applies the pane fork's edits to upstream files, each as a text anchor and its replacement, so
 * a rebase regenerates the edits instead of merging them. Flags: `--sets A,B,D` and `--check`.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

export interface Hunk {
  readonly id: string;
  /** Path from the repository root. */
  readonly file: string;
  /** Must occur exactly once in the file before the edit. */
  readonly anchor: string;
  /** Must occur exactly once in the file after the edit. */
  readonly replacement: string;
}

/**
 * `missing` and `repeated` are errors: upstream rewrote the site, and the anchor needs review.
 * `pending` is an edit that the file does not carry yet.
 */
export type HunkState = "applied" | "pending" | "missing" | "repeated";

export interface HunkResult {
  readonly hunk: Hunk;
  readonly state: HunkState;
}

const CHAT_ROUTE = "apps/web/src/routes/_chat.tsx";
const THREAD_ROUTE_VIEW = "apps/web/src/components/ThreadRouteView.tsx";
const CHAT_VIEW = "apps/web/src/components/ChatView.tsx";
const DIFF_PANEL = "apps/web/src/components/DiffPanel.tsx";
const TIMELINE_VIEWPORT = "apps/web/src/components/chat/timelineViewport.ts";
const RIGHT_PANEL_TABS = "apps/web/src/components/RightPanelTabs.tsx";
const SERVER_STATE = "apps/web/src/state/server.ts";
const COMPOSER_FOCUS_REDIRECT = "apps/web/src/components/chat/composerFocusRedirect.ts";
const PREVIEW_VIEW = "apps/web/src/components/preview/PreviewView.tsx";
const FILE_BROWSER_PANEL = "apps/web/src/components/files/FileBrowserPanel.tsx";
const KEYBINDINGS_SETTINGS = "apps/web/src/components/settings/KeybindingsSettings.tsx";
const APPEARANCE_SETTINGS = "apps/web/src/components/settings/AppearanceSettingsPanel.tsx";
const SETTINGS_SEARCH = "apps/web/src/components/settings/settingsSearch.ts";
const DRAFT_HERO_HEADLINE = "apps/web/src/components/chat/DraftHeroHeadline.tsx";
const RIGHT_PANEL_SURFACE_CONTENT = "apps/web/src/components/chat/RightPanelSurfaceContent.tsx";
const CONTRACTS_KEYBINDINGS = "packages/contracts/src/keybindings.ts";
const SHARED_KEYBINDINGS = "packages/shared/src/keybindings.ts";
const WEB_KEYBINDINGS_TEST = "apps/web/src/keybindings.test.ts";
const DICTATION_SHORTCUT_TEST = "apps/web/src/speech/useDictationShortcut.browser.test.tsx";
const CHAT_HEADER = "apps/web/src/components/chat/ChatHeader.tsx";
const THREAD_DETAILS_PR_ROWS = "apps/web/src/components/chat/ThreadDetailsPrRows.tsx";
const THREAD_DETAILS_USAGE = "apps/web/src/components/chat/ThreadDetailsUsage.tsx";
const CHAT_COMPOSER = "apps/web/src/components/chat/ChatComposer.tsx";
const COMPOSER_CONTEXT_PRESENTATION = "apps/web/src/components/composerContextPresentation.tsx";
const SIDEBAR_CHROME = "apps/web/src/components/sidebar/SidebarChrome.tsx";
const DESKTOP_PRELOAD = "apps/desktop/src/preload.ts";
const DESKTOP_IPC_HANDLERS = "apps/desktop/src/ipc/DesktopIpcHandlers.ts";
const CONTRACTS_IPC = "packages/contracts/src/ipc.ts";
const MODEL_PICKER_CONTENT = "apps/web/src/components/chat/ModelPickerContent.tsx";
const PENDING_BACKGROUND_WORK = "packages/shared/src/orchestrationV2PendingBackgroundWork.ts";
const MESSAGES_TIMELINE_VIEW = "apps/web/src/components/chat/MessagesTimeline.tsx";
const HANDLE_NEW_THREAD = "apps/web/src/hooks/useHandleNewThread.ts";
const SEED_DRAFT_MODEL_SELECTION = "apps/web/src/lib/seedDraftModelSelection.ts";
const APP_INIT = "apps/web/src/appInit.tsx";
const SIDEBAR_THREAD_ROW = "apps/web/src/components/sidebar/SidebarThreadRow.tsx";
const COMPOSER_COMMAND_KEY = "apps/web/src/components/chat/composerCommandKey.ts";
const TIMELINE_WORK_GROUP_ROWS = "apps/web/src/components/chat/TimelineWorkGroupRows.tsx";
const V2_LIFECYCLE_ROW = "apps/web/src/components/chat/V2LifecycleRow.tsx";
const TIMELINE_V2_EVENT_ROW = "apps/web/src/components/chat/TimelineV2EventRow.tsx";
const BRANCH_TOOLBAR = "apps/web/src/components/BranchToolbar.tsx";
const BRANCH_TOOLBAR_ENV_MODE_SELECTOR = "apps/web/src/components/BranchToolbarEnvModeSelector.tsx";
const COMMAND_PALETTE = "apps/web/src/components/CommandPalette.tsx";
const BUILD_DESKTOP_ARTIFACT = "scripts/build-desktop-artifact.ts";
const TIMELINE_ASSISTANT_ROWS = "apps/web/src/components/chat/TimelineAssistantRows.tsx";
const CHAT_MARKDOWN = "apps/web/src/components/ChatMarkdown.tsx";
const THREAD_PREVIEW_MINI_PLAYER = "apps/web/src/components/preview/ThreadPreviewMiniPlayer.tsx";
const VITE_CONFIG = "vite.config.ts";
const PREVIEW_RUNTIME = "apps/web/src/browser/previewRuntime.ts";
const PORT_FORWARDS = "apps/web/src/state/portForwards.ts";
const SOURCE_CONTROL_SETTINGS = "apps/web/src/components/settings/SourceControlSettings.tsx";
const THREAD_ACTIVITY_BANNERS = "apps/web/src/components/chat/ThreadActivityBanners.tsx";
const REOPEN_CLOSED_VIEW_SHORTCUT = "apps/web/src/components/ReopenClosedViewShortcut.tsx";
const PREVIEW_MANAGER = "apps/desktop/src/preview/Manager.ts";
const THREAD_DETAILS_PANEL = "apps/web/src/components/chat/ThreadDetailsPanel.tsx";
const THREAD_DETAILS_CARD = "apps/web/src/components/chat/ThreadDetailsCard.tsx";

export const HUNK_SETS: Readonly<Record<string, ReadonlyArray<Hunk>>> = {
  // The pane host takes the place of the one thread view.
  A: [
    {
      id: "A1",
      file: CHAT_ROUTE,
      anchor: `import { ThreadRouteView } from "../components/ThreadRouteView";\n`,
      replacement: `import { PaneHost } from "../panes/PaneHost";\n`,
    },
    {
      id: "A2",
      file: CHAT_ROUTE,
      anchor: `<ThreadRouteView target={shownTarget} background={modalOpen} />`,
      replacement: `<PaneHost target={shownTarget} background={modalOpen} />`,
    },
  ],
  // A thread view in a pane: the host owns the inset, and a passive pane is a background thread.
  B: [
    {
      id: "B1",
      file: THREAD_ROUTE_VIEW,
      anchor: `import { Navigate, useNavigate } from "@tanstack/react-router";\n`,
      replacement: `import { Navigate, useNavigate } from "../panes/paneNavigation";\n`,
    },
    {
      id: "B2",
      file: THREAD_ROUTE_VIEW,
      anchor: `import { SidebarInset } from "./ui/sidebar";\n`,
      replacement: `import { PaneCellInset, usePanePassive } from "../panes/paneContext";\n`,
    },
    {
      id: "B3",
      file: THREAD_ROUTE_VIEW,
      anchor: `  const navigate = useNavigate();\n`,
      replacement: `  const navigate = useNavigate();\n  const panePassive = usePanePassive();\n`,
    },
    {
      id: "B4",
      file: THREAD_ROUTE_VIEW,
      anchor: `    <SidebarInset\n`,
      replacement: `    <PaneCellInset\n`,
    },
    {
      id: "B5",
      file: THREAD_ROUTE_VIEW,
      anchor: `<BackgroundThreadContext value={background}>`,
      replacement: `<BackgroundThreadContext value={background || panePassive}>`,
    },
    {
      id: "B6",
      file: THREAD_ROUTE_VIEW,
      anchor: `    </SidebarInset>\n`,
      replacement: `    </PaneCellInset>\n`,
    },
  ],
  // Window-level listeners of a chat view stand down in a passive pane.
  C: [
    {
      id: "C1",
      file: CHAT_VIEW,
      anchor: `    () => (embedded ? undefined : subscribeSnapShotComposerFocus(focusComposerStable)),\n    [embedded, focusComposerStable],\n`,
      replacement: `    () =>\n      embedded || backgroundThread\n        ? undefined\n        : subscribeSnapShotComposerFocus(focusComposerStable),\n    [embedded, backgroundThread, focusComposerStable],\n`,
    },
    {
      id: "C2",
      file: CHAT_VIEW,
      anchor: `      embedded ||\n      !activeThread?.id ||\n      terminalUiState.terminalOpen ||\n`,
      replacement: `      embedded ||\n      backgroundThread ||\n      !activeThread?.id ||\n      terminalUiState.terminalOpen ||\n`,
    },
    {
      id: "C3",
      file: CHAT_VIEW,
      anchor: `    activeThread?.id,\n    embedded,\n    focusComposerStable,\n`,
      replacement: `    activeThread?.id,\n    embedded,\n    backgroundThread,\n    focusComposerStable,\n`,
    },
    {
      id: "C4",
      file: CHAT_VIEW,
      anchor: `    isServerThread,\n    embedded,\n    isGitRepo,\n`,
      replacement: `    isServerThread,\n    embedded: embedded || backgroundThread || paneNarrow,\n    isGitRepo,\n`,
    },
    {
      id: "C5",
      file: CHAT_VIEW,
      anchor: `    if (embedded || backgroundThread) return;\n    return window.desktopBridge?.onMenuAction(`,
      replacement: `    if (embedded || backgroundThread || paneNarrow) return;\n    return window.desktopBridge?.onMenuAction(`,
    },
    {
      id: "C6",
      file: CHAT_VIEW,
      anchor: `    backgroundThread,\n    toggleRightPanelStable,\n    toggleRightPanelMaximizedStable,\n    closeActiveRightPanelSurfaceStable,\n  ]);\n`,
      replacement: `    backgroundThread,\n    paneNarrow,\n    toggleRightPanelStable,\n    toggleRightPanelMaximizedStable,\n    closeActiveRightPanelSurfaceStable,\n  ]);\n`,
    },
    {
      id: "C7",
      file: CHAT_VIEW,
      anchor: `  usePasteToFocusComposer(embedded ? null : activeThreadId, composerRef);\n`,
      replacement: `  usePasteToFocusComposer(embedded || backgroundThread ? null : activeThreadId, composerRef);\n`,
    },
    {
      id: "C8",
      file: CHAT_VIEW,
      anchor: `{embedded ? null : <LinkPullRequestDialogHost />}`,
      replacement: `{embedded || backgroundThread ? null : <LinkPullRequestDialogHost />}`,
    },
    // A pane too narrow for the panel beside the chat column has no right panel: no toggle, no
    // panel, no panel keys. The stored panel state stays, so the panel returns in a wide pane.
    // Stock decides its narrow layout from the window width, which a pane does not have.
    {
      id: "C9",
      file: CHAT_VIEW,
      anchor: `import { DraftHeroHeadline } from "./chat/DraftHeroHeadline";\n`,
      replacement: `import { DraftHeroHeadline } from "./chat/DraftHeroHeadline";\nimport { panePanelShortcuts, usePaneNarrow, usePaneScrollToEnd } from "../panes/paneContext";\nimport { paneNarrowSideChatReason } from "../panes/paneNarrowPanel";\n`,
    },
    {
      id: "C10",
      file: CHAT_VIEW,
      anchor: `  const rightPanelOpen = rightPanelState.isOpen;\n`,
      replacement: `  const paneNarrow = usePaneNarrow(activeThreadRef);\n  const rightPanelOpen = rightPanelState.isOpen && !paneNarrow;\n`,
    },
    {
      id: "C11",
      file: CHAT_VIEW,
      anchor: `    enabled: settings.proactivePanelsEnabled && !shouldUsePlanSidebarSheet && !embedded,\n`,
      replacement: `    enabled:\n      settings.proactivePanelsEnabled && !shouldUsePlanSidebarSheet && !embedded && !paneNarrow,\n`,
    },
    {
      id: "C12",
      file: CHAT_VIEW,
      anchor: `      showThreadPanelControl={!inlineRightPanelOwnsTitleBar}\n`,
      replacement: `      showThreadPanelControl={!inlineRightPanelOwnsTitleBar}\n      showRightPanelControl={!paneNarrow}\n`,
    },
    // A new thread that a pane asks for after it lost focus, such as the follow-up draft of "send
    // and new thread", opens in that pane. Through the URL it would open in the focused pane.
    {
      id: "C13",
      file: CHAT_VIEW,
      anchor: `import { useNewThreadHandler } from "../hooks/useHandleNewThread";\n`,
      replacement: `import { useNewThreadHandler } from "../hooks/useHandleNewThread";\nimport { usePaneNewThreadHandler } from "../panes/paneNavigation";\n`,
    },
    {
      id: "C14",
      file: CHAT_VIEW,
      anchor: `  const handleNewThread = useNewThreadHandler();\n`,
      replacement: `  const handleNewThread = usePaneNewThreadHandler(useNewThreadHandler());\n`,
    },
    // The right-panel keys of a narrow pane do nothing (see C9 to C12).
    {
      id: "C15",
      file: CHAT_VIEW,
      anchor: `      ...rightPanelShortcuts,\n`,
      replacement: `      ...panePanelShortcuts(rightPanelShortcuts, paneNarrow),\n`,
    },
    // A side chat is a right-panel surface. `/side` in a narrow pane gives the reason and sends
    // nothing: stock would start the side chat and its turn where no panel shows it.
    {
      id: "C17",
      file: CHAT_VIEW,
      anchor: `                ? gt("Available once the thread's worktree is set up.")\n                : null;\n`,
      replacement: `                ? gt("Available once the thread's worktree is set up.")\n                : paneNarrowSideChatReason(paneNarrow);\n`,
    },
    // A pane focus move changes the window location. Only the focused pane reads it.
    {
      id: "C16",
      file: CHAT_VIEW,
      anchor: `import { useLocation, useNavigate } from "@tanstack/react-router";\n`,
      replacement: `import { useNavigate } from "@tanstack/react-router";\nimport { useLocation } from "../panes/paneNavigation";\n`,
    },
  ],
  // The route-bound diff panel reads its own pane's thread, not the route's. The edit is at the
  // one caller: the hook file must stay free of pane imports for hooks/useHandleNewThread.test.ts.
  D: [
    {
      id: "D1",
      file: DIFF_PANEL,
      anchor: `import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";\n`,
      replacement: `import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";\nimport { usePaneThreadRef } from "../panes/paneContext";\n`,
    },
    {
      id: "D2",
      file: DIFF_PANEL,
      anchor: `  const routeThreadRef = useThreadRouteRef();\n`,
      replacement: `  const routeThreadRef = usePaneThreadRef(useThreadRouteRef());\n`,
    },
  ],
  // A scroll key with focus on the body scrolls the focused pane's timeline only.
  E: [
    {
      id: "E1",
      file: TIMELINE_VIEWPORT,
      anchor: `import { isInSideChatPane } from "../../lib/sideChatPane";\n`,
      replacement: `import { isInSideChatPane } from "../../lib/sideChatPane";\nimport { isInPassivePane } from "../../panes/paneDom";\n`,
    },
    {
      id: "E2",
      file: TIMELINE_VIEWPORT,
      anchor: `          isInSideChatPane(scrollNode))) ||\n`,
      replacement: `          isInSideChatPane(scrollNode) ||\n          isInPassivePane(scrollNode))) ||\n`,
    },
  ],
  // The new-surface key and the launcher's letter keys act in the focused pane's right panel only.
  F: [
    {
      id: "F1",
      file: RIGHT_PANEL_TABS,
      anchor: `import { surfaceShortcutKey } from "~/lib/surfaceShortcutKey";\n`,
      replacement: `import { surfaceShortcutKey } from "~/lib/surfaceShortcutKey";\nimport { usePanePassive } from "../panes/paneContext";\nimport { isInPassivePane } from "../panes/paneDom";\n`,
    },
    {
      id: "F2",
      file: RIGHT_PANEL_TABS,
      anchor: `    if (event.defaultPrevented || event.isComposing) return;\n    if (\n      resolveShortcutCommand(event, props.keybindings, {\n`,
      replacement: `    if (event.defaultPrevented || event.isComposing || isInPassivePane(tabListRef.current)) return;\n    if (\n      resolveShortcutCommand(event, props.keybindings, {\n`,
    },
    {
      id: "F3",
      file: RIGHT_PANEL_TABS,
      anchor: `  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {\n    const action = surfaceShortcutActionForKey(availableActions, event);\n    if (!action) return;\n`,
      replacement: `  const panePassive = usePanePassive();\n  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {\n    const action = surfaceShortcutActionForKey(availableActions, event);\n    if (!action || panePassive) return;\n`,
    },
  ],
  // Every reader of the merged keybinding list gets the stock keys that the pane keys moved.
  G: [
    {
      id: "G1",
      file: SERVER_STATE,
      anchor: `import { connectionAtomRuntime } from "../connection/runtime";\n`,
      replacement: `import { connectionAtomRuntime } from "../connection/runtime";\nimport { withPaneKeybindings } from "../panes/paneKeybindings";\n`,
    },
    {
      id: "G2",
      file: SERVER_STATE,
      anchor: `    mergeWithDefaultKeybindings(get(customAtom) ?? []),\n`,
      replacement: `    withPaneKeybindings(mergeWithDefaultKeybindings(get(customAtom) ?? [])),\n`,
    },
  ],
  // The pane and tab commands are keybinding commands, so the bundled server accepts them.
  H: [
    {
      id: "H1",
      file: CONTRACTS_KEYBINDINGS,
      anchor: `import { ForwardCompatibleArray, TrimmedString } from "./baseSchemas.ts";\n`,
      replacement: `import { ForwardCompatibleArray, TrimmedString } from "./baseSchemas.ts";\nimport { PANE_KEYBINDING_COMMANDS } from "./paneKeybindings.ts";\n`,
    },
    {
      id: "H2",
      file: CONTRACTS_KEYBINDINGS,
      anchor: `  ...THREAD_KEYBINDING_COMMANDS,\n] as const;\n`,
      replacement: `  ...THREAD_KEYBINDING_COMMANDS,\n  ...PANE_KEYBINDING_COMMANDS,\n] as const;\n`,
    },
  ],
  // The pane defaults are the last defaults: a later rule wins its chord and supplies the label.
  I: [
    {
      id: "I1",
      file: SHARED_KEYBINDINGS,
      anchor: `} from "@t3tools/contracts";\n\nexport {\n  EVENT_CODE_SHORTCUT_KEYS,\n`,
      replacement: `} from "@t3tools/contracts";\nimport { PANE_DEFAULT_KEYBINDINGS } from "./paneKeybindings.ts";\n\nexport {\n  EVENT_CODE_SHORTCUT_KEYS,\n`,
    },
    {
      id: "I2",
      file: SHARED_KEYBINDINGS,
      anchor: `command: "usage.period.quarter", when: "usagePageOpen" },\n];\n`,
      replacement: `command: "usage.period.quarter", when: "usagePageOpen" },\n  ...PANE_DEFAULT_KEYBINDINGS,\n];\n`,
    },
  ],
  // Type-to-focus of the focused pane ignores the launcher and the maximized panel of a passive
  // pane.
  K: [
    {
      id: "K1",
      file: COMPOSER_FOCUS_REDIRECT,
      anchor: `import { surfaceShortcutKey } from "~/lib/surfaceShortcutKey";\n`,
      replacement: `import { surfaceShortcutKey } from "~/lib/surfaceShortcutKey";\nimport { isInPassivePane } from "../../panes/paneDom";\n`,
    },
    {
      id: "K2",
      file: COMPOSER_FOCUS_REDIRECT,
      anchor: `  const launcherKeys = document\n    .querySelector(\`[\${SURFACE_LAUNCHER_KEYS_ATTRIBUTE}]\`)\n    ?.getAttribute(`,
      replacement: `  const launcherKeys = Array.from(document.querySelectorAll(\`[\${SURFACE_LAUNCHER_KEYS_ATTRIBUTE}]\`))\n    .find((launcher) => !isInPassivePane(launcher))\n    ?.getAttribute(`,
    },
    {
      id: "K3",
      file: COMPOSER_FOCUS_REDIRECT,
      anchor: `  if (document.querySelector('[data-chat-column-maximized-away="true"]')) return false;\n`,
      replacement: `  if (\n    Array.from(document.querySelectorAll('[data-chat-column-maximized-away="true"]')).some(\n      (column) => !isInPassivePane(column),\n    )\n  )\n    return false;\n`,
    },
  ],
  // A preview action or a desktop preview menu action runs in the focused pane only.
  L: [
    {
      id: "L1",
      file: PREVIEW_VIEW,
      anchor: `import { subscribePreviewAction } from "./previewActionBus";\n`,
      replacement: `import { subscribePreviewAction } from "./previewActionBus";\nimport { isInPassivePane } from "../../panes/paneDom";\n`,
    },
    {
      id: "L2",
      file: PREVIEW_VIEW,
      anchor: `    (action: Parameters<Parameters<typeof subscribePreviewAction>[0]>[0]) => {\n      switch (action) {\n`,
      replacement: `    (action: Parameters<Parameters<typeof subscribePreviewAction>[0]>[0]) => {\n      if (isInPassivePane(urlInputRef.current)) return;\n      switch (action) {\n`,
    },
    {
      id: "L3",
      file: FILE_BROWSER_PANEL,
      anchor: `import { type PreviewAction, subscribePreviewAction } from "../preview/previewActionBus";\n`,
      replacement: `import { type PreviewAction, subscribePreviewAction } from "../preview/previewActionBus";\nimport { isInPassivePane } from "../../panes/paneDom";\n`,
    },
    {
      id: "L4",
      file: FILE_BROWSER_PANEL,
      anchor: `    if (action === "find" && searchInputRef.current?.getClientRects().length) focusSearch();\n`,
      replacement: `    if (isInPassivePane(searchInputRef.current)) return;\n    if (action === "find" && searchInputRef.current?.getClientRects().length) focusSearch();\n`,
    },
  ],
  // Settings lists the keys that work, and sends a pane key only to a server that knows it.
  M: [
    {
      id: "M1",
      file: KEYBINDINGS_SETTINGS,
      anchor: `import { formatShortcutLabel } from "../../keybindings";\n`,
      replacement: `import { formatShortcutLabel } from "../../keybindings";\nimport { paneKeybindingTargets, withoutDeadPaneChords } from "../../panes/paneKeybindings";\n`,
    },
    {
      id: "M2",
      file: KEYBINDINGS_SETTINGS,
      anchor: `  const merged = mergeWithDefaultKeybindings(serverKeybindings ?? []);\n`,
      replacement: `  const merged = withoutDeadPaneChords(mergeWithDefaultKeybindings(serverKeybindings ?? []));\n`,
    },
    {
      id: "M3",
      file: KEYBINDINGS_SETTINGS,
      anchor: `        connectedEnvironments.map((target) =>\n          upsertKeybinding(`,
      replacement: `        paneKeybindingTargets(input.command, connectedEnvironments).map((target) =>\n          upsertKeybinding(`,
    },
    {
      id: "M4",
      file: KEYBINDINGS_SETTINGS,
      anchor: `        connectedEnvironments.map((target) =>\n          removeKeybindingMutation(`,
      replacement: `        paneKeybindingTargets(row.command, connectedEnvironments).map((target) =>\n          removeKeybindingMutation(`,
    },
  ],
  // Settings > Appearance shows the two density rows after "Chat width", and search finds them.
  "r2-density-settings": [
    {
      id: "r2-density-settings-1",
      file: APPEARANCE_SETTINGS,
      anchor: `import { ThreadDetailsItemsRow } from "./ThreadDetailsItemsRow";\n`,
      replacement: `import { ThreadDetailsItemsRow } from "./ThreadDetailsItemsRow";\nimport { PaneDensitySettingsRows } from "../../panes/PaneDensitySettings";\n`,
    },
    {
      id: "r2-density-settings-2",
      file: APPEARANCE_SETTINGS,
      anchor: `        <ThreadDetailsItemsRow />\n`,
      replacement: `        <PaneDensitySettingsRows />\n        <ThreadDetailsItemsRow />\n`,
    },
    {
      id: "r2-density-settings-3",
      file: SETTINGS_SEARCH,
      anchor: `import type { ResolvedSettingsScope } from "./settingsScope";\n`,
      replacement: `import type { ResolvedSettingsScope } from "./settingsScope";\nimport { PANE_SETTINGS_SEARCH_ITEMS } from "../../panes/paneSettingsSearch";\n`,
    },
    {
      id: "r2-density-settings-4",
      file: SETTINGS_SEARCH,
      anchor: `    searchTerms: [msg("wide full width column layout messages composer monitor")],\n  },\n`,
      replacement: `    searchTerms: [msg("wide full width column layout messages composer monitor")],\n  },\n  ...PANE_SETTINGS_SEARCH_ITEMS,\n`,
    },
  ],
  // "or start without a project" focuses the project picker of its own pane.
  N: [
    {
      id: "N1",
      file: DRAFT_HERO_HEADLINE,
      anchor: `document.querySelector<HTMLElement>("[data-draft-project-trigger]")?.focus();`,
      replacement: `document\n                      .querySelector<HTMLElement>(\n                        '[data-draft-project-trigger]:not([data-pane-focused="false"] *)',\n                      )\n                      ?.focus();`,
    },
  ],
  // The pull request copy-number key copies the pull request of the focused pane's panel.
  O: [
    {
      id: "O1",
      file: RIGHT_PANEL_SURFACE_CONTENT,
      anchor: `import { type RightPanelSurface, useRightPanelStore } from "../../rightPanelStore";\n`,
      replacement: `import { usePanePassive } from "../../panes/paneContext";\nimport { type RightPanelSurface, useRightPanelStore } from "../../rightPanelStore";\n`,
    },
    {
      id: "O2",
      file: RIGHT_PANEL_SURFACE_CONTENT,
      anchor: `  const { surface, threadRef, visible, onCloseSurface } = props;\n`,
      replacement: `  const { surface, threadRef, visible, onCloseSurface } = props;\n  const panePassive = usePanePassive();\n`,
    },
    {
      id: "O3",
      file: RIGHT_PANEL_SURFACE_CONTENT,
      anchor: `shortcutsEnabled={visible && props.activeSurfaceId === surface.id}`,
      replacement: `shortcutsEnabled={visible && !panePassive && props.activeSurfaceId === surface.id}`,
    },
  ],
  // Stock drops the strip under the composer (checkout mode, branch) when a thread starts,
  // unless a setting keeps it. A pane keeps it wherever more than one pane or tab exists.
  "r2-bottombar-context-strip": [
    {
      id: "r2-bottombar-context-strip-1",
      file: CHAT_VIEW,
      anchor: `import { BranchToolbar, type BranchToolbarHandle } from "./BranchToolbar";\n`,
      replacement: `import { BranchToolbar, type BranchToolbarHandle } from "./BranchToolbar";\nimport { usePaneKeepsContextStrip } from "../panes/paneContextStrip";\n`,
    },
    {
      id: "r2-bottombar-context-strip-2",
      file: CHAT_VIEW,
      anchor: `  const showComposerContextStrip =\n    !embedded &&\n    shouldShowComposerContextStrip({\n      isDraftHeroState,\n      persistInActiveThreads: settings.persistComposerContextStrip,\n`,
      replacement: `  const paneKeepsContextStrip = usePaneKeepsContextStrip();\n  const showComposerContextStrip =\n    !embedded &&\n    shouldShowComposerContextStrip({\n      isDraftHeroState,\n      persistInActiveThreads: settings.persistComposerContextStrip || paneKeepsContextStrip,\n`,
    },
  ],
  // The stock "scroll to end" of the chat view goes to the fork's key handler, which runs it for
  // the focused pane on the layout.scrollToEnd key. The import is part of hunk C9.
  "r3-scroll-to-end": [
    {
      id: "r3-scroll-to-end-1",
      file: CHAT_VIEW,
      anchor: `  const scrollToEndSummary =\n`,
      replacement: `  usePaneScrollToEnd(scrollToEnd, !embedded && !backgroundThread);\n  const scrollToEndSummary =\n`,
    },
  ],
  // The chat view gives its stock stop and its stock "Revert and keep changes" to the fork's key
  // handler, which runs them for the focused pane on the layout.stopTurn key. Every name in the
  // call is a stock local of the chat view.
  "r4-stop-turn": [
    {
      id: "r4-stop-turn-1",
      file: CHAT_VIEW,
      anchor: `import { ExpandedImageDialogHost, openExpandedImagePreview } from "./chat/ExpandedImageDialog";\n`,
      replacement: `import { ExpandedImageDialogHost, openExpandedImagePreview } from "./chat/ExpandedImageDialog";\nimport { usePaneStopTurn } from "../panes/usePaneStopTurn";\n`,
    },
    {
      id: "r4-stop-turn-2",
      file: CHAT_VIEW,
      anchor: `  const onCompactContext = () => {\n`,
      replacement: `  usePaneStopTurn(\n    {\n      environmentId,\n      routeThreadRef,\n      routeThreadKey,\n      serverProjection,\n      activeThread,\n      activeRunningTurnId,\n      activeActivityRun,\n      canInterruptRunningThread,\n      onInterruptStable,\n      promptRef,\n      composerRef,\n      composerDraftTarget,\n      setThreadError,\n      phase,\n      isSendBusy,\n      sendInFlightRef,\n      optimisticUserMessages,\n      supportsConversationRollback,\n      activeEnvironmentUnavailable,\n      serverVisibleTurnItems,\n      timelineEntries,\n      turnDiffSummaries,\n      availableRevertTurnCounts,\n      threadStartCheckpointAvailable,\n    },\n    !embedded && !backgroundThread,\n  );\n  const onCompactContext = () => {\n`,
    },
  ],
  // The Tutor theme is the default look. The call runs before the stock adoption of the
  // environment default theme, so a default theme of the environment still wins.
  "r5-tutor-theme": [
    {
      id: "r5-tutor-theme-1",
      file: APP_INIT,
      anchor: `import { startDefaultThemeAdoption } from "./hooks/useDefaultTheme";\n`,
      replacement: `import { startDefaultThemeAdoption } from "./hooks/useDefaultTheme";\nimport { adoptTutorTheme } from "./panes/tutorTheme";\n`,
    },
    {
      id: "r5-tutor-theme-2",
      file: APP_INIT,
      anchor: `  startDefaultThemeAdoption();\n`,
      replacement: `  adoptTutorTheme();\n  startDefaultThemeAdoption();\n`,
    },
  ],
  // The chat view gives its timeline list, its stock "load earlier turns" and its stock viewport
  // callback to the fork's key handler, for the layout.previousMessage and layout.nextMessage
  // keys. Every name in the call is a stock local of the chat view.
  "r5-message-jump": [
    {
      id: "r5-message-jump-1",
      file: CHAT_VIEW,
      anchor: `import type { MessagesTimelineHistoryControls } from "./chat/MessagesTimeline";\n`,
      replacement: `import type { MessagesTimelineHistoryControls } from "./chat/MessagesTimeline";\nimport { usePaneMessageJump } from "../panes/usePaneMessageJump";\n`,
    },
    {
      id: "r5-message-jump-2",
      file: CHAT_VIEW,
      anchor: `  const { onResume, isResuming } = useComposerResume({\n`,
      replacement: `  const attachPaneTimelineViewport = usePaneMessageJump(\n    {\n      legendListRef,\n      threadHistoryControls,\n      routeThreadKey,\n      scrollToEnd,\n      attachTimelineViewport,\n    },\n    !embedded && !backgroundThread,\n  );\n  const { onResume, isResuming } = useComposerResume({\n`,
    },
    {
      id: "r5-message-jump-3",
      file: CHAT_VIEW,
      anchor: `                  onViewportAttach={attachTimelineViewport}\n`,
      replacement: `                  onViewportAttach={attachPaneTimelineViewport}\n`,
    },
  ],
  // The meta line of a sidebar row shows the CI lanes and the auto-merge state of the open pull
  // request, after the stock pull request badge.
  "r6-ci-status": [
    {
      id: "r6-ci-status-1",
      file: SIDEBAR_THREAD_ROW,
      anchor: `import type { SidebarThreadSummary } from "../../types";\n`,
      replacement: `import type { SidebarThreadSummary } from "../../types";\nimport { ThreadCiStatus } from "../../panes/ThreadCiStatus";\n`,
    },
    {
      id: "r6-ci-status-2",
      file: SIDEBAR_THREAD_ROW,
      anchor: `      {terminalStatusIcon}\n      {prBadge}\n`,
      replacement: `      {terminalStatusIcon}\n      {prBadge}\n      <ThreadCiStatus thread={thread} />\n`,
    },
  ],
  // A pull request watch does not hold its thread in the Tutor3 client (setting
  // releaseWatchedPullRequests). The shared rule reads a switch that only the client turns off,
  // so the bundled server keeps the stock rule.
  "r7-pr-watch-hold": [
    {
      id: "r7-pr-watch-hold-1",
      file: PENDING_BACKGROUND_WORK,
      anchor: `import { resolveT3McpToolId } from "./t3McpToolPresentation.ts";\n`,
      replacement: `import { awaitedTaskHolds, pullRequestWatchHoldsThread } from "./panePullRequestWatchHold.ts";\nimport { resolveT3McpToolId } from "./t3McpToolPresentation.ts";\n\nexport { setPullRequestWatchHoldsThread } from "./panePullRequestWatchHold.ts";\n`,
    },
    {
      id: "r7-pr-watch-hold-2",
      file: PENDING_BACKGROUND_WORK,
      anchor: `    (task) => task.awaited === true || backgroundWorkKindHoldsCompletion(task.kind),\n`,
      replacement: `    (task) => awaitedTaskHolds(task) || backgroundWorkKindHoldsCompletion(task.kind),\n`,
    },
    {
      id: "r7-pr-watch-hold-3",
      file: PENDING_BACKGROUND_WORK,
      anchor: `            ...(link.watch.checksPending === false &&\n            link.watch.until !== "merged" &&\n            link.snapshot?.state !== "merged"\n              ? {}\n`,
      replacement: `            ...(!pullRequestWatchHoldsThread() ||\n            (link.watch.checksPending === false &&\n              link.watch.until !== "merged" &&\n              link.snapshot?.state !== "merged")\n              ? {}\n`,
    },
    {
      id: "r7-pr-watch-hold-4",
      file: APP_INIT,
      anchor: `import { startThreadNotifications } from "./components/ThreadNotificationCoordinator";\n`,
      replacement: `import { startThreadNotifications } from "./components/ThreadNotificationCoordinator";\nimport { startPullRequestWatchHoldSetting } from "./panes/pullRequestWatchHold";\n`,
    },
    {
      id: "r7-pr-watch-hold-5",
      file: APP_INIT,
      anchor: `  startModelPreferencesMigration();\n`,
      replacement: `  startPullRequestWatchHoldSetting();\n  startModelPreferencesMigration();\n`,
    },
  ],
  // The chat shows the quiet update turns of a pull request watch as one line (setting
  // foldPullRequestUpdates). The fork hook takes the stock rows and gives back rows, so the
  // list, the minimap and the scroll code read one array.
  "r7-pr-watch-fold": [
    {
      id: "r7-pr-watch-fold-1",
      file: MESSAGES_TIMELINE_VIEW,
      anchor: `import { useStableHandoffRuns, useIncrementalTimelineRows, useStableRows } from "./useTimelineRows";\n`,
      replacement: `import { useStableHandoffRuns, useIncrementalTimelineRows, useStableRows } from "./useTimelineRows";\nimport { usePullRequestUpdateFold } from "../../panes/usePullRequestUpdateFold";\n`,
    },
    {
      id: "r7-pr-watch-fold-2",
      file: MESSAGES_TIMELINE_VIEW,
      anchor: `  const rows = useStableRows(rawRows, listIdentityKey);\n`,
      replacement: `  const rows = usePullRequestUpdateFold(\n    useStableRows(rawRows, listIdentityKey),\n    visibleExpandedRunIds,\n    activeFindMatch?.entryId ?? null,\n  );\n`,
    },
  ],
  // The timeline shows the tokens of running work (setting showWorkTokens): beside the stock
  // "Working for" label, in the row of a subagent, and as a total on a subagent group line.
  "r7-work-tokens": [
    {
      id: "r7-work-tokens-1",
      file: TIMELINE_WORK_GROUP_ROWS,
      anchor: `import { TimelineRowTimestamp, ActivityShimmerOverlay } from "./TimelineRowParts";\n`,
      replacement: `import { TimelineRowTimestamp, ActivityShimmerOverlay } from "./TimelineRowParts";\nimport { RunningTurnTokens } from "../../panes/WorkTokenLabels";\n`,
    },
    {
      id: "r7-work-tokens-2",
      file: TIMELINE_WORK_GROUP_ROWS,
      anchor: `          {shimmer ? <ActivityShimmerOverlay>{label}</ActivityShimmerOverlay> : null}\n        </span>\n`,
      replacement: `          {shimmer ? <ActivityShimmerOverlay>{label}</ActivityShimmerOverlay> : null}\n        </span>\n        <RunningTurnTokens />\n`,
    },
    {
      id: "r7-work-tokens-3",
      file: V2_LIFECYCLE_ROW,
      anchor: `import { T3Wordmark } from "../T3Wordmark";\n`,
      replacement: `import { T3Wordmark } from "../T3Wordmark";\nimport { SubagentWorkTokens } from "../../panes/WorkTokenLabels";\n`,
    },
    {
      id: "r7-work-tokens-4",
      file: V2_LIFECYCLE_ROW,
      anchor: `      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">\n        {props.event ? props.event.timestamp : <SubagentElapsed agent={timing} />}\n`,
      replacement: `      <SubagentWorkTokens parentRef={props.parentRef} subagentId={props.subagentId} />\n      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">\n        {props.event ? props.event.timestamp : <SubagentElapsed agent={timing} />}\n`,
    },
    {
      id: "r7-work-tokens-5",
      file: TIMELINE_V2_EVENT_ROW,
      anchor: `import { subagentGroupTiming } from "./TimelineV2EventRow.logic";\n`,
      replacement: `import { subagentGroupTiming } from "./TimelineV2EventRow.logic";\nimport { SubagentGroupWorkTokens } from "../../panes/WorkTokenLabels";\n`,
    },
    {
      id: "r7-work-tokens-6",
      file: TIMELINE_V2_EVENT_ROW,
      anchor: `              {statusSummary}\n`,
      replacement: `              {statusSummary}\n              <SubagentGroupWorkTokens\n                environmentId={ctx.activeThreadEnvironmentId}\n                agents={agents}\n              />\n`,
    },
  ],
  // The strip under the composer shows the pull request of its thread with the CI state, as its
  // last item (setting showPullRequestChip). The strip is the composer layout of the toolbar.
  "r7-pane-pr-chip": [
    {
      id: "r7-pane-pr-chip-1",
      file: BRANCH_TOOLBAR,
      anchor: `import { ComposerContextLabel } from "./ComposerContextLabel";\n`,
      replacement: `import { ComposerContextLabel } from "./ComposerContextLabel";\nimport { PullRequestChip } from "../panes/PullRequestChip";\n`,
    },
    {
      id: "r7-pane-pr-chip-2",
      file: BRANCH_TOOLBAR,
      anchor: `      {trailing}\n`,
      replacement: `      {trailing}\n      <PullRequestChip environmentId={environmentId} threadId={threadId} />\n`,
    },
  ],
  // The filter by environment and project of the command palette: the key of the stock find
  // command opens it while the palette is open, and a button in the search field does the same.
  "r7-palette-filter": [
    {
      id: "r7-palette-filter-1",
      file: COMMAND_PALETTE,
      anchor: `import { useCommandPaletteThreadItems } from "./CommandPaletteThreadItems";\n`,
      replacement: `import { useCommandPaletteThreadItems } from "./CommandPaletteThreadItems";\nimport { usePaletteFilter } from "../panes/usePaletteFilter";\n`,
    },
    {
      id: "r7-palette-filter-2",
      file: COMMAND_PALETTE,
      anchor: `    isSearchFailed: isThreadSearchFailed,\n  } = useCommandPaletteThreadItems({ activeThread: activeThread ?? null, threadSearchQuery });\n`,
      replacement: `    isSearchFailed: isThreadSearchFailed,\n    paletteFilter,\n  } = usePaletteFilter(\n    useCommandPaletteThreadItems({ activeThread: activeThread ?? null, threadSearchQuery }),\n    { available: paletteMode === "root", projectGroups },\n  );\n`,
    },
    {
      id: "r7-palette-filter-3",
      file: COMMAND_PALETTE,
      anchor: `    projectSearchItems: projectSearchItems,\n`,
      replacement: `    projectSearchItems: paletteFilter.narrow(projectSearchItems),\n`,
    },
    {
      id: "r7-palette-filter-4",
      file: COMMAND_PALETTE,
      anchor: `      inputAccessory={inputAccessory}\n`,
      replacement: `      inputAccessory={inputAccessory ?? paletteFilter.accessory}\n`,
    },
    {
      id: "r7-palette-filter-5",
      file: COMMAND_PALETTE,
      anchor: `        onKeyDown: handleKeyDown,\n`,
      replacement: `        onKeyDown: (event) => {\n          if (!paletteFilter.takeKey(event)) handleKeyDown(event);\n        },\n        ...paletteFilter.inputProps,\n`,
    },
  ],
  // The music control: one button after the Usage button of the sidebar footer, and two desktop
  // bridge methods that run fixed AppleScript for the Spotify app. macOS shows its permission
  // question for Apple events only to an app whose Info.plist says why it sends them.
  "r7-music-control": [
    {
      id: "r7-music-control-1",
      file: SIDEBAR_CHROME,
      anchor: `            onClick={handleUsageClick}\n          />\n`,
      replacement: `            onClick={handleUsageClick}\n          />\n          <ForkSidebarUtilityItems />\n`,
    },
    {
      id: "r7-music-control-2",
      file: CONTRACTS_IPC,
      anchor: `} from "./desktopAppActivation.ts";\n`,
      replacement: `} from "./desktopAppActivation.ts";\nimport type { SpotifyCommand, SpotifyCommandResult, SpotifyStateResult } from "./forkSpotify.ts";\n\nexport type * from "./forkSpotify.ts";\n`,
    },
    {
      id: "r7-music-control-3",
      file: CONTRACTS_IPC,
      anchor: `  getLocalEnvironmentBearerToken: () => Promise<string>;\n`,
      replacement: `  /** Fork: the Spotify app of the app's own Mac, through AppleScript. */\n  getSpotifyState?: () => Promise<SpotifyStateResult>;\n  sendSpotifyCommand?: (command: SpotifyCommand) => Promise<SpotifyCommandResult>;\n  getLocalEnvironmentBearerToken: () => Promise<string>;\n`,
    },
    {
      id: "r7-music-control-4",
      file: DESKTOP_PRELOAD,
      anchor: `import * as IpcChannels from "./ipc/channels.ts";\n`,
      replacement: `import * as IpcChannels from "./ipc/channels.ts";\nimport * as MusicChannels from "./ipc/forkChannels.ts";\n`,
    },
    {
      id: "r7-music-control-5",
      file: DESKTOP_PRELOAD,
      anchor: `  getClientSettings: () => ipcRenderer.invoke(IpcChannels.GET_CLIENT_SETTINGS_CHANNEL),\n`,
      replacement: `  getSpotifyState: () => ipcRenderer.invoke(MusicChannels.GET_SPOTIFY_STATE_CHANNEL),\n  sendSpotifyCommand: (command) =>\n    ipcRenderer.invoke(MusicChannels.SEND_SPOTIFY_COMMAND_CHANNEL, command),\n  getClientSettings: () => ipcRenderer.invoke(IpcChannels.GET_CLIENT_SETTINGS_CHANNEL),\n`,
    },
    {
      id: "r7-music-control-6",
      file: DESKTOP_IPC_HANDLERS,
      anchor: `import * as PreviewIpc from "./methods/preview.ts";\n`,
      replacement: `import { getSpotifyState, sendSpotifyCommand } from "./methods/forkSpotify.ts";\nimport * as PreviewIpc from "./methods/preview.ts";\n`,
    },
    {
      id: "r7-music-control-7",
      file: DESKTOP_IPC_HANDLERS,
      anchor: `  yield* ipc.handle(getLocalEnvironmentBearerToken);\n`,
      replacement: `  yield* ipc.handle(getSpotifyState);\n  yield* ipc.handle(sendSpotifyCommand);\n  yield* ipc.handle(getLocalEnvironmentBearerToken);\n`,
    },
    {
      id: "r7-music-control-8",
      file: BUILD_DESKTOP_ARTIFACT,
      anchor: `        NSCameraUsageDescription:\n`,
      replacement: `        NSAppleEventsUsageDescription:\n          "Tutor3 controls the Spotify app on this Mac when you use the music control.",\n        NSCameraUsageDescription:\n`,
    },
  ],
  // The bottom bar shows no folder item for a worktree that the server named (setting
  // hideWorktreeFolder). The fork gives that item an empty label, and worktreeLabel.css hides it.
  "r7-worktree-label": [
    {
      id: "r7-worktree-label-1",
      file: BRANCH_TOOLBAR_ENV_MODE_SELECTOR,
      anchor: `import { PreviousWorktreeItemContent } from "./PreviousWorktreeItemContent";\n`,
      replacement: `import { PreviousWorktreeItemContent } from "./PreviousWorktreeItemContent";\nimport { paneWorktreeLabel } from "../panes/worktreeLabel";\n`,
    },
    {
      id: "r7-worktree-label-2",
      file: BRANCH_TOOLBAR_ENV_MODE_SELECTOR,
      anchor: `            : resolveLockedWorkspaceLabel(activeWorktreePath, effectiveEnvMode, m)}\n        </ComposerContextLabel>\n`,
      replacement: `            : paneWorktreeLabel(\n                resolveLockedWorkspaceLabel(activeWorktreePath, effectiveEnvMode, m),\n              )}\n        </ComposerContextLabel>\n`,
    },
  ],
  // The footer of the last agent message of a finished turn shows the working time of the turn,
  // after the stock time (setting showWorkedTime).
  "r7-worked-time": [
    {
      id: "r7-worked-time-1",
      file: TIMELINE_ASSISTANT_ROWS,
      anchor: `import { vcsEnvironment } from "../../state/vcs";\n`,
      replacement: `import { vcsEnvironment } from "../../state/vcs";\nimport { WorkedTimeLabel } from "../../panes/WorkedTimeLabel";\n`,
    },
    {
      id: "r7-worked-time-2",
      file: TIMELINE_ASSISTANT_ROWS,
      anchor: `            {formatChatTimestampTooltip(message.updatedAt, ctx.timestampFormat, m)}\n          </TooltipPopup>\n        </Tooltip>\n      )}\n`,
      replacement: `            {formatChatTimestampTooltip(message.updatedAt, ctx.timestampFormat, m)}\n          </TooltipPopup>\n        </Tooltip>\n      )}\n      <WorkedTimeLabel message={message} />\n`,
    },
  ],
  // A Claude artifact link of a chat opens in the app's browser, in the browser profile of the
  // thread's Claude account (setting artifactLinksInApp, FORK.md "Artifact links").
  "r7-artifact-links": [
    {
      id: "r7-artifact-links-1",
      file: CHAT_MARKDOWN,
      anchor: `import { useOpenLink } from "../browser/useOpenLink";\n`,
      replacement: `import { useOpenLink } from "../browser/useOpenLink";\nimport { artifactLinkProfile, openArtifactLinkInApp } from "../panes/openArtifactLink";\n`,
    },
    {
      id: "r7-artifact-links-2",
      file: CHAT_MARKDOWN,
      anchor: `            if (event.defaultPrevented) return;\n            if (\n              resolveLinkTarget({\n`,
      replacement: `            if (event.defaultPrevented) return;\n            if (openArtifactLinkInApp(event, href, threadRef)) return;\n            if (\n              resolveLinkTarget({\n`,
    },
    {
      id: "r7-artifact-links-3",
      file: CHAT_MARKDOWN,
      anchor: `    return openUrlInPreview({ threadRef, url, openPreview }).then((result) => {\n`,
      replacement: `    return openUrlInPreview({\n      threadRef,\n      url,\n      openPreview,\n      ...artifactLinkProfile(threadRef, url),\n    }).then((result) => {\n`,
    },
  ],
  // The composer gives its selected provider to the fork's editor wrapper, which styles the
  // words "ultracode" and "ultrathink" for a Claude provider (setting styleClaudeKeywords). The
  // prop is one of the wrapper, so this set needs the import of the set r3-paste-collapse.
  "r7-ultracode-style": [
    {
      id: "r7-ultracode-style-1",
      file: CHAT_COMPOSER,
      anchor: `                    literalText={isLiteralPendingAnswer}\n`,
      replacement: `                    literalText={isLiteralPendingAnswer}\n                    keywordProvider={selectedProvider}\n`,
    },
  ],
  // The stock floating preview mounts one fork element in its button row: the larger first size,
  // the page size that follows the frame, the buttons and the drag that open a browser pane
  // (settings largeFloatingPreview and browserPanes, FORK.md "Browser pane").
  "r8-browser-pane": [
    {
      id: "r8-browser-pane-1",
      file: THREAD_PREVIEW_MINI_PLAYER,
      anchor: `import { showPreviewPopup } from "./showPreviewPopup";\n`,
      replacement: `import { showPreviewPopup } from "./showPreviewPopup";\nimport { FloatingPreviewExtras } from "../../panes/FloatingPreviewExtras";\n`,
    },
    {
      id: "r8-browser-pane-2",
      file: THREAD_PREVIEW_MINI_PLAYER,
      anchor: `              {pillActions}\n`,
      replacement: `              {pillActions}\n              <FloatingPreviewExtras threadRef={threadRef} miniPlayer={miniPlayer} />\n`,
    },
  ],
  // The stock "Context" row of the thread details renders through the fork, which opens a
  // breakdown of the context on hover and on click (setting showContextBreakdown, FORK.md
  // "Context breakdown"). The fork gets the stock row component and renders it unchanged.
  "r9-context-breakdown": [
    {
      id: "r9-context-breakdown-1",
      file: THREAD_DETAILS_USAGE,
      anchor: `import { ThreadDetailsSection } from "./ThreadDetailsSection";\n`,
      replacement: `import { ThreadDetailsSection } from "./ThreadDetailsSection";\nimport { ContextBreakdownRow } from "../../panes/ContextBreakdown";\n`,
    },
    {
      id: "r9-context-breakdown-2",
      file: THREAD_DETAILS_USAGE,
      anchor: `        <UsageRow\n          label={gt("Context", { $context: "context window row label" })}\n`,
      replacement: `        <ContextBreakdownRow\n          row={UsageRow}\n          usage={usage}\n          label={gt("Context", { $context: "context window row label" })}\n`,
    },
  ],
  // Upstream tests of the defaults: dictation moved from mod+shift+d, the split-down key, to
  // mod+shift+u.
  J: [
    {
      id: "J1",
      file: WEB_KEYBINDINGS_TEST,
      anchor: `        context: { terminalFocus: false },\n      }),\n      "composer.dictation",\n`,
      replacement: `        context: { terminalFocus: false },\n      }),\n      "layout.splitDown",\n`,
    },
    {
      id: "J2",
      file: DICTATION_SHORTCUT_TEST,
      anchor: `      key: "D",\n      code: "KeyD",\n`,
      replacement: `      key: "U",\n      code: "KeyU",\n`,
    },
    {
      id: "J3",
      file: DICTATION_SHORTCUT_TEST,
      anchor: `{ code: "KeyD" }));\n  press();\n  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }));\n`,
      replacement: `{ code: "KeyU" }));\n  press();\n  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyU" }));\n`,
    },
  ],
  // The preview link of a thread, in the chat header and under its pull request row.
  "r3-thread": [
    {
      id: "r3-thread-1",
      file: CHAT_HEADER,
      anchor: `import { GuestShareIndicator } from "./GuestShareControls";\n`,
      replacement: `import { GuestShareIndicator } from "./GuestShareControls";\nimport { ThreadPreviewLinkButton } from "../../panes/ThreadPreviewLink";\n`,
    },
    {
      id: "r3-thread-2",
      file: CHAT_HEADER,
      anchor: `      {isServerThread ? <GuestShareIndicator threadRef={activeThreadRef} /> : null}\n`,
      replacement: `      {isServerThread ? <ThreadPreviewLinkButton threadRef={activeThreadRef} /> : null}\n      {isServerThread ? <GuestShareIndicator threadRef={activeThreadRef} /> : null}\n`,
    },
    {
      id: "r3-thread-3",
      file: THREAD_DETAILS_PR_ROWS,
      anchor: `import { ThreadDetailsPrRow } from "./ThreadDetailsPrRow";\n`,
      replacement: `import { ThreadDetailsPrRow } from "./ThreadDetailsPrRow";\nimport { ThreadPreviewLinkRow } from "../../panes/ThreadPreviewLink";\n`,
    },
    {
      id: "r3-thread-4",
      file: THREAD_DETAILS_PR_ROWS,
      anchor: `  const currentRow = <ThreadDetailsPrRow {...row} onStopWatching={stopWatching(currentLink)} />;\n`,
      replacement: `  const currentRow = (\n    <>\n      <ThreadDetailsPrRow {...row} onStopWatching={stopWatching(currentLink)} />\n      <ThreadPreviewLinkRow threadRef={threadRef} />\n    </>\n  );\n`,
    },
  ],
  // "Collapse long pastes": the chat composer mounts the fork's editor wrapper, and the stock
  // chip registry draws the chip of a collapsed paste.
  "r3-paste-collapse": [
    {
      id: "r3-paste-collapse-1",
      file: CHAT_COMPOSER,
      anchor: `  ComposerPromptEditorTiptap as ComposerPromptEditor,\n} from "../ComposerPromptEditorTiptap";\n`,
      replacement: `} from "../ComposerPromptEditorTiptap";\nimport { PasteCollapseEditor as ComposerPromptEditor } from "../../panes/PasteCollapseEditor";\n`,
    },
    {
      id: "r3-paste-collapse-2",
      file: COMPOSER_CONTEXT_PRESENTATION,
      anchor: `import { ComposerContextActionsContext } from "./composerContextActions";\n`,
      replacement: `import { ComposerContextActionsContext } from "./composerContextActions";\nimport { renderPasteCollapseChip } from "../panes/PasteCollapseChip";\n`,
    },
    {
      id: "r3-paste-collapse-3",
      file: COMPOSER_CONTEXT_PRESENTATION,
      anchor: `  fallback: (_kind, _entry, context) => <UnresolvedContextChip label={context.label} />,\n`,
      replacement: `  fallback: (kind, _entry, context) =>\n    renderPasteCollapseChip(kind, context.label) ?? <UnresolvedContextChip label={context.label} />,\n`,
    },
  ],
  // The sidebar footer shows free disk space and memory of each connected environment. The
  // stock server reports memory only, so the desktop app reads the disk of its own machine.
  "r3-environment-resources": [
    {
      id: "r3-environment-resources-1",
      file: SIDEBAR_CHROME,
      anchor: `import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";\n`,
      replacement: `import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";\nimport { ForkSidebarFooter, ForkSidebarUtilityItems } from "../../panes/ForkSidebarFooter";\n`,
    },
    {
      id: "r3-environment-resources-2",
      file: SIDEBAR_CHROME,
      anchor: `      <SidebarUtilityMenu />\n    </SidebarFooter>\n`,
      replacement: `      <ForkSidebarFooter />\n      <SidebarUtilityMenu />\n    </SidebarFooter>\n`,
    },
    {
      id: "r3-environment-resources-3",
      file: CONTRACTS_IPC,
      anchor: `  getHostEnvironmentId?: () => Promise<string | null>;\n`,
      replacement: `  getHostEnvironmentId?: () => Promise<string | null>;\n  /** Fork: the volume that holds the home directory of the app's own machine. */\n  getHostDiskSpace?: () => Promise<{ availableBytes: number; totalBytes: number } | null>;\n`,
    },
    {
      id: "r3-environment-resources-4",
      file: DESKTOP_PRELOAD,
      anchor: `import { mergeLegacyLocalStorage } from "./legacyLocalStorageMerge.ts";\n`,
      replacement: `import { mergeLegacyLocalStorage } from "./legacyLocalStorageMerge.ts";\nimport { GET_HOST_DISK_SPACE_CHANNEL } from "./ipc/forkChannels.ts";\n`,
    },
    {
      id: "r3-environment-resources-5",
      file: DESKTOP_PRELOAD,
      anchor: `  getHostEnvironmentId: () => ipcRenderer.invoke(IpcChannels.GET_HOST_ENVIRONMENT_ID_CHANNEL),\n`,
      replacement: `  getHostEnvironmentId: () => ipcRenderer.invoke(IpcChannels.GET_HOST_ENVIRONMENT_ID_CHANNEL),\n  getHostDiskSpace: () => ipcRenderer.invoke(GET_HOST_DISK_SPACE_CHANNEL),\n`,
    },
    {
      id: "r3-environment-resources-6",
      file: DESKTOP_IPC_HANDLERS,
      anchor: `} from "./methods/localEnvironment.ts";\n`,
      replacement: `} from "./methods/localEnvironment.ts";\nimport { getHostDiskSpace } from "./methods/forkHostDisk.ts";\n`,
    },
    {
      id: "r3-environment-resources-7",
      file: DESKTOP_IPC_HANDLERS,
      anchor: `  yield* ipc.handle(getHostEnvironmentId);\n`,
      replacement: `  yield* ipc.handle(getHostEnvironmentId);\n  yield* ipc.handle(getHostDiskSpace);\n`,
    },
  ],
  // The model picker lists the quota of each Claude account, and the two stock flows that give
  // a draft its first model ask the fork for the account with the most quota left.
  "r3-account-quota": [
    {
      id: "r3-account-quota-1",
      file: MODEL_PICKER_CONTENT,
      anchor: `import { ModelPickerSidebar } from "./ModelPickerSidebar";\n`,
      replacement: `import { ModelPickerSidebar } from "./ModelPickerSidebar";\nimport { AccountQuotaList } from "../../panes/AccountQuotaList";\n`,
    },
    {
      id: "r3-account-quota-2",
      file: MODEL_PICKER_CONTENT,
      anchor: `            {props.listFooter}\n`,
      replacement: `            <AccountQuotaList\n              instanceEntries={instanceEntries}\n              activeInstanceId={props.activeInstanceId}\n              model={props.model}\n            />\n            {props.listFooter}\n`,
    },
    {
      id: "r3-account-quota-3",
      file: HANDLE_NEW_THREAD,
      anchor: `import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";\n`,
      replacement: `import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";\nimport { pickNewThreadAccount } from "../panes/newThreadAccount";\n`,
    },
    {
      id: "r3-account-quota-4",
      file: HANDLE_NEW_THREAD,
      anchor: `    const resolveModelSelectionOverride = (destinationDraftId: DraftId) =>\n      resolveNewThreadModelSelectionOverride({\n`,
      replacement: `    const resolveStockModelSelectionOverride = (destinationDraftId: DraftId) =>\n      resolveNewThreadModelSelectionOverride({\n`,
    },
    {
      id: "r3-account-quota-5",
      file: HANDLE_NEW_THREAD,
      anchor: `    const resolveDefaultEnvMode = async (): Promise<DraftThreadEnvMode> => {\n`,
      replacement: `    const resolveModelSelectionOverride = (id: DraftId) =>\n      pickNewThreadAccount(resolveStockModelSelectionOverride(id), id, projectRef);\n    const resolveDefaultEnvMode = async (): Promise<DraftThreadEnvMode> => {\n`,
    },
    {
      id: "r3-account-quota-6",
      file: SEED_DRAFT_MODEL_SELECTION,
      anchor: `import { hasExplicitComposerModelSelection } from "./chatThreadActions";\n`,
      replacement: `import { hasExplicitComposerModelSelection } from "./chatThreadActions";\nimport { pickNewThreadAccount } from "../panes/newThreadAccount";\n`,
    },
    {
      id: "r3-account-quota-7",
      file: SEED_DRAFT_MODEL_SELECTION,
      anchor: `  const selection = resolution.fallback ? resolution.selection : defaultSelection;\n`,
      replacement: `  const stockSelection = resolution.fallback ? resolution.selection : defaultSelection;\n  const selection = pickNewThreadAccount(stockSelection, draftId, projectRef);\n`,
    },
  ],
  // Settings > Appearance gets the fork section "Tutor3" after the stock "Interface" section,
  // which holds the density rows. It holds every setting of the sets r3-* above.
  "r3-settings": [
    {
      id: "r3-settings-1",
      file: APPEARANCE_SETTINGS,
      anchor: `import { TypographySection } from "./TypographySettings";\n`,
      replacement: `import { TypographySection } from "./TypographySettings";\nimport { ForkSettingsSection } from "../../panes/ForkSettingsSection";\n`,
    },
    {
      id: "r3-settings-2",
      file: APPEARANCE_SETTINGS,
      anchor: `      </SettingsSection>\n\n      <TypographySection />\n`,
      replacement: `      </SettingsSection>\n\n      <ForkSettingsSection />\n\n      <TypographySection />\n`,
    },
  ],
  // The new thread screen gets the environment control under its headline, and its project
  // picker lists the projects of the draft's environment (FORK.md "Environment of a new thread").
  "r7-draft-environment": [
    {
      id: "r7-draft-environment-1",
      file: DRAFT_HERO_HEADLINE,
      anchor: `import { TriageDraftHero } from "./TriageDraftHero";\n`,
      replacement: `import { TriageDraftHero } from "./TriageDraftHero";\nimport {\n  DraftEnvironmentChoice,\n  useDraftEnvironmentProjects,\n} from "../../panes/DraftEnvironmentChoice";\n`,
    },
    {
      id: "r7-draft-environment-2",
      file: DRAFT_HERO_HEADLINE,
      anchor: `  const menuEntries = projectPickerEntries.filter(\n`,
      replacement: `  const menuEntries = useDraftEnvironmentProjects(projectPickerEntries, activeProjectRef).filter(\n`,
    },
    {
      id: "r7-draft-environment-3",
      file: DRAFT_HERO_HEADLINE,
      anchor: `      {scratchWorkspaceRoot === null ? null : (\n`,
      replacement: `      <DraftEnvironmentChoice\n        draftId={draftId}\n        activeProjectRef={activeProjectRef}\n        entries={projectPickerEntries}\n      />\n      {scratchWorkspaceRoot === null ? null : (\n`,
    },
  ],
  // The Mac menu bar item with the count of unread finished threads, and the sound of a
  // finished thread: one start call of the web client, and one desktop bridge method. The
  // preload line uses the `MusicChannels` import of r7-music-control-4.
  "r9-menubar-sound": [
    {
      id: "r9-menubar-sound-1",
      file: APP_INIT,
      anchor: `import { startThreadVisitedMigration } from "./hooks/useThreadVisitedMigration";\n`,
      replacement: `import { startThreadVisitedMigration } from "./hooks/useThreadVisitedMigration";\nimport { startFinishedThreadSignals } from "./panes/finishedThreadSignals";\n`,
    },
    {
      id: "r9-menubar-sound-2",
      file: APP_INIT,
      anchor: `  startThreadVisitedMigration(appAtomRegistry);\n`,
      replacement: `  startThreadVisitedMigration(appAtomRegistry);\n  startFinishedThreadSignals(appAtomRegistry, router);\n`,
    },
    {
      id: "r9-menubar-sound-3",
      file: CONTRACTS_IPC,
      anchor: `  revealWindow: () => Promise<void>;\n`,
      replacement: `  revealWindow: () => Promise<void>;\n  /** Fork: the Mac menu bar item with the count of unread finished threads. Null removes it. */\n  setMenuBarUnread?: (\n    unread: { count: number; threads: ReadonlyArray<{ key: string; title: string }> } | null,\n  ) => Promise<void>;\n`,
    },
    {
      id: "r9-menubar-sound-4",
      file: DESKTOP_PRELOAD,
      anchor: `  revealWindow: () => ipcRenderer.invoke(IpcChannels.REVEAL_WINDOW_CHANNEL),\n`,
      replacement: `  revealWindow: () => ipcRenderer.invoke(IpcChannels.REVEAL_WINDOW_CHANNEL),\n  setMenuBarUnread: (unread) =>\n    ipcRenderer.invoke(MusicChannels.SET_MENU_BAR_UNREAD_CHANNEL, unread),\n`,
    },
    {
      id: "r9-menubar-sound-5",
      file: DESKTOP_IPC_HANDLERS,
      anchor: `import * as WebLinksIpc from "./methods/webLinks.ts";\n`,
      replacement: `import * as WebLinksIpc from "./methods/webLinks.ts";\nimport { setMenuBarUnread } from "./methods/forkMenuBarMethod.ts";\n`,
    },
    {
      id: "r9-menubar-sound-6",
      file: DESKTOP_IPC_HANDLERS,
      anchor: `  yield* ipc.handle(revealWindow);\n`,
      replacement: `  yield* ipc.handle(revealWindow);\n  yield* ipc.handle(setMenuBarUnread);\n`,
    },
  ],
  // Text selected in a chat shows as the placeholder of its empty input. Tab and a right click
  // use it (setting selectionToInput, FORK.md "Selection to input").
  "r10-selection-input": [
    {
      id: "r10-selection-input-1",
      file: CHAT_COMPOSER,
      anchor: `import { usePromptSuggestion } from "./usePromptSuggestion";\n`,
      replacement: `import { usePromptSuggestion } from "./usePromptSuggestion";\nimport { useSelectionInputOffer } from "../../panes/useSelectionInputOffer";\n`,
    },
    {
      id: "r10-selection-input-2",
      file: CHAT_COMPOSER,
      anchor: `      ? promptSuggestion\n      : null;\n`,
      replacement: `      ? promptSuggestion\n      : null;\n  const selectionInputOffer = useSelectionInputOffer({\n    formRef: composerFormRef,\n    promptRef,\n    prompt,\n    offerable:\n      !speechInput.freezesEditor &&\n      !isComposerApprovalState &&\n      !activePendingProgress &&\n      !projectSelectionRequired &&\n      !showProviderUnavailable,\n    replace: applyPromptReplacementStable,\n  });\n`,
    },
    {
      id: "r10-selection-input-3",
      file: CHAT_COMPOSER,
      anchor: `                              : (offeredPromptSuggestion ?? m(DEFAULT_COMPOSER_PLACEHOLDER))\n`,
      replacement: `                              : (selectionInputOffer ??\n                                offeredPromptSuggestion ??\n                                m(DEFAULT_COMPOSER_PLACEHOLDER))\n`,
    },
    {
      id: "r10-selection-input-4",
      file: CHAT_COMPOSER,
      anchor: `                      offeredPromptSuggestion !== null ? (\n`,
      replacement: `                      selectionInputOffer !== null || offeredPromptSuggestion !== null ? (\n`,
    },
  ],
  // The Up key recalls sent messages that a reconnect removed from the loaded timeline, and a
  // recalled message left in the draft continues the recall (setting keepPromptHistory,
  // FORK.md "Input history after a reconnect").
  "r11-prompt-history": [
    {
      id: "r11-prompt-history-1",
      file: CHAT_COMPOSER,
      anchor: `import { composerCommandKeyHandler } from "./composerCommandKey";\n`,
      replacement: `import { composerCommandKeyHandler } from "./composerCommandKey";\nimport { promptHistoryFor, useRememberPromptHistory } from "../../panes/promptHistoryMemory";\n`,
    },
    {
      id: "r11-prompt-history-2",
      file: CHAT_COMPOSER,
      anchor: `  const onComposerCommandKey = (key: string, event: KeyboardEvent, isTaskItem?: boolean) =>\n`,
      replacement: `  useRememberPromptHistory(composerDraftTarget, promptHistoryEntries);\n  const onComposerCommandKey = (key: string, event: KeyboardEvent, isTaskItem?: boolean) =>\n`,
    },
    {
      id: "r11-prompt-history-3",
      file: CHAT_COMPOSER,
      anchor: `      promptHistoryEntries,\n      promptHistoryPositionRef,\n`,
      replacement: `      promptHistoryEntries: promptHistoryFor(composerDraftTarget, promptHistoryEntries),\n      promptHistoryPositionRef,\n`,
    },
    {
      id: "r11-prompt-history-4",
      file: COMPOSER_COMMAND_KEY,
      anchor: `import { composerTargetKey } from "../../composerDraftStore";\n`,
      replacement: `import { composerTargetKey } from "../../composerDraftStore";\nimport { resumePromptHistoryPosition } from "../../panes/promptHistoryMemory";\n`,
    },
    {
      id: "r11-prompt-history-5",
      file: COMPOSER_COMMAND_KEY,
      anchor: `    const position = recalled?.targetKey === promptHistoryTargetKey ? recalled.position : null;\n`,
      replacement: `    const position = resumePromptHistoryPosition(\n      recalled?.targetKey === promptHistoryTargetKey ? recalled.position : null,\n      promptRef.current,\n    );\n`,
    },
  ],
  // A tab of the stock right panel drags out of the panel to the drop zones of the panes: a
  // browser tab becomes a browser pane, a side chat a chat pane (setting browserPanes, FORK.md
  // "Drag right-panel tabs"). A release outside the panel skips the stock reorder.
  "r12-panel-tab-drag": [
    {
      id: "r12-panel-tab-drag-1",
      file: RIGHT_PANEL_TABS,
      anchor: `import { observeResize } from "~/lib/observeResize";\n`,
      replacement: `import { observeResize } from "~/lib/observeResize";\nimport { panelTabLeftPanel, usePanelTabDragId } from "../panes/panelTabDrag";\n`,
    },
    {
      id: "r12-panel-tab-drag-2",
      file: RIGHT_PANEL_TABS,
      anchor: `    if (!over || active.id === over.id) return;\n`,
      replacement: `    if (panelTabLeftPanel() || !over || active.id === over.id) return;\n`,
    },
    {
      id: "r12-panel-tab-drag-3",
      file: RIGHT_PANEL_TABS,
      anchor: `  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({\n`,
      replacement: `  const panelTabDragId = usePanelTabDragId(surface);\n  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({\n`,
    },
    {
      id: "r12-panel-tab-drag-4",
      file: RIGHT_PANEL_TABS,
      anchor: `      data-active-tab={props.active}\n`,
      replacement: `      data-active-tab={props.active}\n      data-right-panel-surface={panelTabDragId}\n`,
    },
  ],
  // The fork's own copy is English only, so the v0.1.11 rule against untranslated copy skips the
  // pane code (FORK.md "Rebase to a new stable tag").
  "r13-english-copy": [
    {
      id: "r13-english-copy-1",
      file: VITE_CONFIG,
      anchor: `          "packages/client-runtime/src/rpc/**",\n        ],\n        rules: { "t3code/no-untranslated-copy": "error" },\n`,
      replacement: `          "packages/client-runtime/src/rpc/**",\n          "apps/web/src/panes/**",\n        ],\n        rules: { "t3code/no-untranslated-copy": "error" },\n`,
    },
  ],
  // A stock v0.1.10 server has no preview tunnel and no issue trackers. The v0.1.11 client asks
  // for both unless a capability gates it (FORK.md "Rebase to a new stable tag").
  "r14-old-server": [
    {
      id: "r14-old-server-1",
      file: PREVIEW_RUNTIME,
      anchor: `import { tunnelsEnvironmentLoopback } from "./browserTargetResolver";\n`,
      replacement: `import { tunnelsEnvironmentLoopback } from "./browserTargetResolver";\nimport { hasPreviewTunnelRoute } from "../panes/previewTunnelRoute";\n`,
    },
    {
      id: "r14-old-server-2",
      file: PREVIEW_RUNTIME,
      anchor: `    return config !== undefined && allowsPreviewTunnel(config);\n`,
      replacement: `    return config !== undefined && allowsPreviewTunnel(config) && hasPreviewTunnelRoute(config);\n`,
    },
    {
      id: "r14-old-server-3",
      file: PORT_FORWARDS,
      anchor: `import { tunnelsEnvironmentLoopback } from "../browser/browserTargetResolver";\n`,
      replacement: `import { tunnelsEnvironmentLoopback } from "../browser/browserTargetResolver";\nimport { hasPreviewTunnelRoute } from "../panes/previewTunnelRoute";\n`,
    },
    {
      id: "r14-old-server-4",
      file: PORT_FORWARDS,
      anchor: `  readonly serverConfig: Parameters<typeof allowsPreviewTunnel>[0] | null;\n}): boolean =>\n  previewBridge() !== undefined &&\n  tunnelsEnvironmentLoopback(environment.entry.target) &&\n  environment.serverConfig !== null &&\n  allowsPreviewTunnel(environment.serverConfig);\n`,
      replacement: `  readonly serverConfig:\n    | (Parameters<typeof allowsPreviewTunnel>[0] & Parameters<typeof hasPreviewTunnelRoute>[0])\n    | null;\n}): boolean =>\n  previewBridge() !== undefined &&\n  tunnelsEnvironmentLoopback(environment.entry.target) &&\n  environment.serverConfig !== null &&\n  allowsPreviewTunnel(environment.serverConfig) &&\n  hasPreviewTunnelRoute(environment.serverConfig);\n`,
    },
    {
      id: "r14-old-server-5",
      file: SOURCE_CONTROL_SETTINGS,
      anchor: `      {environmentId === null ? null : (\n        <IssueTrackerSettings key={environmentId} environmentId={environmentId} />\n`,
      replacement: `      {environmentId === null ||\n      environment?.serverConfig?.environment.capabilities.issues !== true ? null : (\n        <IssueTrackerSettings key={environmentId} environmentId={environmentId} />\n`,
    },
  ],
  // Token use while work runs (setting showWorkTokens): the stock background work bar shows the
  // tokens of the work it lists, and the fold line of a turn that still works shows its tokens.
  "r15-live-tokens": [
    {
      id: "r15-live-tokens-1",
      file: THREAD_ACTIVITY_BANNERS,
      anchor: `import { BackgroundWorkDetails } from "./BackgroundWorkDetails";\n`,
      replacement: `import { BackgroundWorkDetails } from "./BackgroundWorkDetails";\nimport { BackgroundWorkTokens } from "../../panes/WorkTokenLabels";\n`,
    },
    {
      id: "r15-live-tokens-2",
      file: THREAD_ACTIVITY_BANNERS,
      anchor: `      <>\n        {startedAtMs === null ? null : (\n`,
      replacement: `      <>\n        <BackgroundWorkTokens\n          environmentId={input.environmentId}\n          threadId={input.threadId}\n          tasks={input.tasks}\n          turnItems={input.turnItems}\n        />\n        {startedAtMs === null ? null : (\n`,
    },
    {
      id: "r15-live-tokens-3",
      file: MESSAGES_TIMELINE_VIEW,
      anchor: `} from "./timelineRowContext";\n`,
      replacement: `} from "./timelineRowContext";\nimport { LiveTurnTokens } from "../../panes/WorkTokenLabels";\n`,
    },
    {
      id: "r15-live-tokens-4",
      file: MESSAGES_TIMELINE_VIEW,
      anchor: `            {row.label}\n            {error ? \` · \${error}\` : ""}\n`,
      replacement: `            {row.label}\n            <LiveTurnTokens runId={row.runId} />\n            {error ? \` · \${error}\` : ""}\n`,
    },
  ],
  // A focused browser page takes every key press. The desktop app sends the tab keys back to
  // the app as menu actions while there are 2+ tabs, and gives the keyboard back to the app.
  "r16-browser-tab-keys": [
    {
      id: "r16-browser-tab-keys-1",
      file: REOPEN_CLOSED_VIEW_SHORTCUT,
      anchor: `import { readIssueListPreferences } from "./issue/issueListPreferences";\n`,
      replacement: `import { readIssueListPreferences } from "./issue/issueListPreferences";\nimport { usePreviewForwardedPaneShortcuts } from "../panes/previewPaneKeys";\n`,
    },
    {
      id: "r16-browser-tab-keys-2",
      file: REOPEN_CLOSED_VIEW_SHORTCUT,
      anchor: `  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers forwarded shortcut chords`,
      replacement: `  const paneShortcuts = usePreviewForwardedPaneShortcuts(keybindings);\n  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers forwarded shortcut chords`,
    },
    {
      id: "r16-browser-tab-keys-3",
      file: REOPEN_CLOSED_VIEW_SHORTCUT,
      anchor: `      .setForwardedShortcuts(\n        commands.flatMap((command) =>\n          effectiveShortcutsForCommand(keybindings, command, options).map((shortcut) => ({\n            command,\n            shortcut,\n          })),\n        ),\n      )\n`,
      replacement: `      .setForwardedShortcuts([\n        ...commands.flatMap((command) =>\n          effectiveShortcutsForCommand(keybindings, command, options).map((shortcut) => ({\n            command,\n            shortcut,\n          })),\n        ),\n        ...paneShortcuts,\n      ])\n`,
    },
    {
      id: "r16-browser-tab-keys-4",
      file: REOPEN_CLOSED_VIEW_SHORTCUT,
      anchor: `  }, [hasHistory, keybindings, terminalOpen]);\n`,
      replacement: `  }, [hasHistory, keybindings, paneShortcuts, terminalOpen]);\n`,
    },
    {
      id: "r16-browser-tab-keys-5",
      file: PREVIEW_MANAGER,
      anchor: `            forwarded.command === "preview.focusUrl"\n          ) {\n`,
      replacement: `            forwarded.command === "preview.focusUrl" ||\n            forwarded.command.startsWith("layout.")\n          ) {\n`,
    },
  ],
  "r17-thread-artifacts": [
    {
      id: "r17-thread-artifacts-1",
      file: THREAD_DETAILS_PANEL,
      anchor: `import { ThreadRelationshipsPanel } from "./ThreadRelationshipsControl";\n`,
      replacement: `import { ThreadRelationshipsPanel } from "./ThreadRelationshipsControl";\nimport { ThreadArtifactsSection } from "../../panes/ThreadArtifactsSection";\n`,
    },
    {
      id: "r17-thread-artifacts-2",
      file: THREAD_DETAILS_PANEL,
      anchor: `              {visible.usage ? <ThreadDetailsUsage {...props.usage} /> : null}\n`,
      replacement: `              {density === "full" && !props.draftId ? (\n                <ThreadArtifactsSection\n                  environmentId={props.environmentId}\n                  threadId={props.threadId}\n                />\n              ) : null}\n\n              {visible.usage ? <ThreadDetailsUsage {...props.usage} /> : null}\n`,
    },
    {
      id: "r17-thread-artifacts-3",
      file: THREAD_DETAILS_CARD,
      anchor: `"[data-thread-relationships-panel], [data-thread-side-chats-panel], [data-thread-details-pr-list], [data-thread-automations-panel], [data-thread-details-server-overflow]",`,
      replacement: `"[data-thread-relationships-panel], [data-thread-side-chats-panel], [data-thread-details-pr-list], [data-thread-automations-panel], [data-thread-details-server-overflow], [data-thread-artifacts-panel]",`,
    },
  ],
};

function countOccurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

export function hunkState(content: string, hunk: Hunk): HunkState {
  const replacements = countOccurrences(content, hunk.replacement);
  if (replacements > 1) return "repeated";
  const anchors = countOccurrences(content, hunk.anchor);
  if (replacements === 1) {
    // An anchor that is not part of the replacement means the old and the new text both exist.
    return anchors === countOccurrences(hunk.replacement, hunk.anchor) ? "applied" : "repeated";
  }
  if (anchors === 0) return "missing";
  return anchors === 1 ? "pending" : "repeated";
}

/** Applies each pending hunk. A hunk in an error state leaves the content as it is. */
export function applyHunks(
  content: string,
  hunks: ReadonlyArray<Hunk>,
): { readonly content: string; readonly results: ReadonlyArray<HunkResult> } {
  let next = content;
  const results = hunks.map((hunk): HunkResult => {
    const state = hunkState(next, hunk);
    if (state === "pending") next = next.replace(hunk.anchor, () => hunk.replacement);
    return { hunk, state };
  });
  return { content: next, results };
}

function selectHunks(setNames: ReadonlyArray<string>): ReadonlyArray<Hunk> {
  return setNames.flatMap((name) => {
    const hunks = HUNK_SETS[name];
    if (hunks === undefined) {
      throw new Error(
        `Unknown hunk set "${name}". Known sets: ${Object.keys(HUNK_SETS).join(", ")}`,
      );
    }
    return hunks;
  });
}

// A tree that is checked must carry every edit. Not 1: that code means an anchor needs review.
const PENDING_EXIT_CODE = 2;

/**
 * Returns the process exit code. Writes nothing when any hunk is in an error state. In check
 * mode a pending hunk fails the check, so the check cannot pass on a tree with no edits.
 */
export function run(input: {
  readonly root: string;
  readonly sets: ReadonlyArray<string>;
  readonly check: boolean;
  readonly log: (line: string) => void;
}): number {
  const hunksByFile = Map.groupBy(selectHunks(input.sets), (hunk) => hunk.file);
  const writes: Array<{ readonly path: string; readonly content: string }> = [];
  const allResults: Array<HunkResult> = [];
  for (const [file, hunks] of hunksByFile) {
    const path = NodePath.join(input.root, file);
    const before = NodeFS.readFileSync(path, "utf8");
    const { content, results } = applyHunks(before, hunks);
    allResults.push(...results);
    if (content !== before) writes.push({ path, content });
  }
  const isError = (state: HunkState) => state === "missing" || state === "repeated";
  const errors = allResults.filter(({ state }) => isError(state)).length;
  const pending = allResults.filter(({ state }) => state === "pending").length;
  // A pending hunk is written only by a run with no error and no check.
  const writing = errors === 0 && !input.check;
  for (const { hunk, state } of allResults) {
    input.log(
      `${hunk.id}  ${state === "pending" && writing ? "applied now" : state}  ${hunk.file}`,
    );
    if (isError(state)) input.log(`    anchor ${state}: ${JSON.stringify(hunk.anchor)}`);
  }
  if (errors > 0) {
    input.log(`${errors} hunk(s) need review. Nothing was written.`);
    return 1;
  }
  if (!input.check) {
    for (const write of writes) NodeFS.writeFileSync(write.path, write.content);
    return 0;
  }
  if (pending > 0) {
    input.log(`${pending} hunk(s) are pending. Run the script with no --check to apply them.`);
    return PENDING_EXIT_CODE;
  }
  return 0;
}

if (import.meta.main) {
  const { values } = NodeUtil.parseArgs({
    args: process.argv.slice(2),
    options: {
      check: { type: "boolean", default: false },
      sets: { type: "string" },
    },
  });
  process.exitCode = run({
    root: NodePath.resolve(import.meta.dirname, "../.."),
    sets: values.sets === undefined ? Object.keys(HUNK_SETS) : values.sets.split(","),
    check: values.check,
    log: (line) => console.log(line),
  });
}

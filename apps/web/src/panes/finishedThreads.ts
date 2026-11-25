import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { DesktopBridge, OrchestrationV2ThreadShell } from "@t3tools/contracts";
import { isMacPlatform } from "@t3tools/shared/keybindings";
import { monitorHoldsWakeCompletion } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";

import {
  hasUnseenCompletion,
  resolveSidebarRowStatus,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
} from "../components/Sidebar.logic";
import type { ThreadNotificationObservation } from "../components/ThreadNotificationCoordinator.logic";

export type MenuBarUnread = NonNullable<
  Parameters<NonNullable<DesktopBridge["setMenuBarUnread"]>>[0]
>;

export interface MenuBarBridge {
  readonly setMenuBarUnread: NonNullable<DesktopBridge["setMenuBarUnread"]>;
  readonly onMenuAction: DesktopBridge["onMenuAction"];
}

/** The Mac app has a menu bar item. A browser, and the app on another system, have none. */
export function menuBarBridge(): MenuBarBridge | null {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (bridge?.setMenuBarUnread === undefined) return null;
  return isMacPlatform(navigator.platform)
    ? { setMenuBarUnread: bridge.setMenuBarUnread, onMenuAction: bridge.onMenuAction }
    : null;
}

// The main process sends this menu action for a pick in the menu of the menu bar item
// (apps/desktop/src/ipc/methods/forkMenuBarMethod.ts).
const OPEN_THREAD_MENU_ACTION = "fork-open-thread:";

/** The thread key of a pick in the menu bar menu, or null for each other menu action. */
export function menuBarPickedThreadKey(action: string): string | null {
  return action.startsWith(OPEN_THREAD_MENU_ACTION)
    ? action.slice(OPEN_THREAD_MENU_ACTION.length)
    : null;
}

export const finishedThreadKey = (thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

/**
 * The stock rule of the sidebar for a thread that finished and that the user did not open
 * since: the "Done" mark of a row, and the unread dot of a closed folder.
 */
export function isUnreadFinished(
  thread: EnvironmentThreadShell,
  localLastVisitedAt: string | undefined,
): boolean {
  const row = {
    ...thread,
    lastVisitedAt: resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAt),
  };
  return resolveSidebarRowStatus(row) === "ready" && hasUnseenCompletion(row);
}

const MENU_BAR_THREAD_LIMIT = 10;

/** The count of the menu bar item, and its newest threads for the menu. */
export function menuBarUnread(unread: ReadonlyArray<EnvironmentThreadShell>): MenuBarUnread {
  const finishedAt = (thread: EnvironmentThreadShell) =>
    Date.parse(thread.latestRun?.completedAt ?? "") || 0;
  return {
    count: unread.length,
    threads: unread
      .toSorted((left, right) => finishedAt(right) - finishedAt(left))
      .slice(0, MENU_BAR_THREAD_LIMIT)
      .map((thread) => ({ key: finishedThreadKey(thread), title: thread.title })),
  };
}

/**
 * What the stock notification gate needs to know of a thread, read as the stock coordinator
 * reads it: idle, latest run completed, and no monitor that still holds the completion.
 */
export function finishObservation(
  thread: EnvironmentThreadShell,
  raw: Pick<OrchestrationV2ThreadShell, "latestRunBackgroundWake" | "pendingBackgroundTasks">,
): ThreadNotificationObservation {
  const settled =
    resolveSidebarThreadStatus(thread) === "ready" &&
    thread.latestRun?.status === "completed" &&
    !monitorHoldsWakeCompletion(raw);
  const completedAt = Date.parse(thread.latestRun?.completedAt ?? "");
  return {
    attention: null,
    requestId: null,
    settled,
    completedAt: settled && Number.isFinite(completedAt) ? completedAt : null,
    backgroundWake: raw.latestRunBackgroundWake === true,
  };
}

/** The user looks at this thread now: a sound for it tells them nothing. */
export function finishSoundIsNoise(input: {
  readonly threadKey: string;
  readonly focusedThreadKey: string | null;
  readonly windowFocused: boolean;
}): boolean {
  return input.windowFocused && input.threadKey === input.focusedThreadKey;
}

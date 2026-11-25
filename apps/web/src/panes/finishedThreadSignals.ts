import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import type { AtomRegistry } from "effect/reactivity";

import {
  createThreadNotificationGate,
  isSnoozedForNotification,
  type ThreadNotificationObservation,
} from "../components/ThreadNotificationCoordinator.logic";
import { getClientSettings } from "../hooks/useSettings";
import { environmentThreadShells } from "../state/threads";
import { hasNotificationSound } from "../threadNotifications";
import { useUiStateStore } from "../uiStateStore";
import {
  finishedThreadKey,
  finishObservation,
  finishSoundIsNoise,
  isUnreadFinished,
  menuBarBridge,
  menuBarPickedThreadKey,
  menuBarUnread,
  type MenuBarBridge,
} from "./finishedThreads";
import { createFinishSound, type ChimeAudioContext } from "./finishSound";
import { useReadoutSettingsStore, type ReadoutSettings } from "./readoutSettings";

type FinishSound = ReturnType<typeof createFinishSound>;

/** The thread of the route. With panes, the route follows the focused pane. */
function routeThreadKey(router: AnyRouter): string | null {
  const params = (router.state.matches.at(-1)?.params ?? {}) as {
    environmentId?: EnvironmentId;
    threadId?: ThreadId;
  };
  return params.environmentId === undefined || params.threadId === undefined
    ? null
    : scopedThreadKey(scopeThreadRef(params.environmentId, params.threadId));
}

/** Sends the unread finished threads to the menu bar item, at each change and not more. */
function watchMenuBar(
  registry: AtomRegistry.AtomRegistry,
  router: AnyRouter,
  bridge: MenuBarBridge,
): () => void {
  // A streamed turn replaces one shell at each tick. The other shells keep their answer.
  const answers = new WeakMap<
    EnvironmentThreadShell,
    { readonly key: string; readonly visitedAt: string | undefined; readonly unread: boolean }
  >();
  let sent: string | null = null;
  const send = () => {
    const visitedAtByKey = useUiStateStore.getState().threadLastVisitedAtById;
    const threads = registry.get(environmentThreadShells.navigationThreadShellsAtom);
    const unread = threads.filter((thread) => {
      let answer = answers.get(thread);
      const key = answer?.key ?? finishedThreadKey(thread);
      const visitedAt = visitedAtByKey[key];
      if (answer === undefined || answer.visitedAt !== visitedAt) {
        answer = { key, visitedAt, unread: isUnreadFinished(thread, visitedAt) };
        answers.set(thread, answer);
      }
      return answer.unread;
    });
    const next = menuBarUnread(unread);
    const encoded = JSON.stringify(next);
    if (encoded === sent) return;
    sent = encoded;
    void bridge.setMenuBarUnread(next).catch(() => undefined);
  };
  const stops = [
    registry.subscribe(environmentThreadShells.navigationThreadShellsAtom, send, {
      immediate: true,
    }),
    useUiStateStore.subscribe((state, previous) => {
      if (state.threadLastVisitedAtById !== previous.threadLastVisitedAtById) send();
    }),
    bridge.onMenuAction((action) => {
      const key = menuBarPickedThreadKey(action);
      const ref = key === null ? null : parseScopedThreadKey(key);
      if (ref === null) return;
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: ref.environmentId, threadId: ref.threadId },
      });
    }),
  ];
  return () => {
    for (const stop of stops) stop();
    void bridge.setMenuBarUnread(null).catch(() => undefined);
  };
}

interface SeenThread {
  readonly key: string;
  readonly raw: OrchestrationV2ThreadShell;
  readonly observation: ThreadNotificationObservation;
}

/**
 * Plays the sound at the event of the stock "Thread completed" notification: the stock gate
 * decides it, so a stopped turn, a snoozed thread and a monitor wake stay silent as in stock.
 */
function watchFinishSound(
  registry: AtomRegistry.AtomRegistry,
  router: AnyRouter,
  sound: FinishSound,
): () => void {
  const gate = createThreadNotificationGate<string>((key, kind) => {
    if (kind !== "completion") return;
    // The stock notification sound plays for the same event. One sound is enough.
    if (hasNotificationSound(getClientSettings().notificationMode)) return;
    const windowFocused = document.visibilityState === "visible" && document.hasFocus();
    if (
      finishSoundIsNoise({
        threadKey: key,
        focusedThreadKey: routeThreadKey(router),
        windowFocused,
      })
    )
      return;
    sound.play();
  });
  const seenByShell = new WeakMap<EnvironmentThreadShell, SeenThread>();
  let previous = new Map<string, SeenThread>();
  const observe = (threads: ReadonlyArray<EnvironmentThreadShell>) => {
    const next = new Map<string, SeenThread>();
    const changed: Array<{
      readonly thread: EnvironmentThreadShell;
      readonly prior: SeenThread | undefined;
      readonly seen: SeenThread;
    }> = [];
    const indexes = new Map<EnvironmentId, ReadonlyMap<ThreadId, OrchestrationV2ThreadShell>>();
    for (const thread of threads) {
      let index = indexes.get(thread.environmentId);
      if (index === undefined) {
        index = registry.get(
          environmentThreadShells.environmentThreadIndexAtom(thread.environmentId),
        );
        indexes.set(thread.environmentId, index);
      }
      const raw = index.get(thread.id);
      if (raw === undefined) continue;
      const kept = seenByShell.get(thread);
      if (kept?.raw === raw) {
        next.set(kept.key, kept);
        continue;
      }
      const key = kept?.key ?? finishedThreadKey(thread);
      const seen = { key, raw, observation: finishObservation(thread, raw) };
      seenByShell.set(thread, seen);
      next.set(key, seen);
      changed.push({ thread, prior: previous.get(key), seen });
    }
    previous = next;
    gate.retain(new Set(next.keys()));
    const now = Date.now();
    for (const { thread, prior, seen } of changed) {
      gate.observe(seen.key, prior?.observation, seen.observation, {
        archived: false,
        quiet: seen.raw.latestRunStopRequested === true,
        snoozed: isSnoozedForNotification(thread, seen.observation.completedAt, now),
      });
    }
  };
  const unsubscribe = registry.subscribe(
    environmentThreadShells.navigationThreadShellsAtom,
    observe,
    { immediate: true },
  );
  document.addEventListener("pointerdown", sound.unlock);
  document.addEventListener("keydown", sound.unlock);
  return () => {
    unsubscribe();
    gate.clear();
    document.removeEventListener("pointerdown", sound.unlock);
    document.removeEventListener("keydown", sound.unlock);
    sound.close();
  };
}

/**
 * The menu bar count of unread finished threads (setting `menuBarUnread`) and the sound of a
 * finished thread (setting `finishSound`). With both off it watches nothing and calls nothing.
 */
export function startFinishedThreadSignals(
  registry: AtomRegistry.AtomRegistry,
  router: AnyRouter,
  standIns: {
    readonly menuBarBridge?: () => MenuBarBridge | null;
    readonly createAudioContext?: () => ChimeAudioContext;
  } = {},
): () => void {
  const bridgeOf = standIns.menuBarBridge ?? menuBarBridge;
  const sound = createFinishSound(standIns.createAudioContext ?? (() => new AudioContext()));
  let stopMenuBar: (() => void) | null = null;
  let stopSound: (() => void) | null = null;
  const apply = (settings: Pick<ReadoutSettings, "menuBarUnread" | "finishSound">) => {
    const bridge = settings.menuBarUnread ? bridgeOf() : null;
    if (bridge !== null && stopMenuBar === null) {
      stopMenuBar = watchMenuBar(registry, router, bridge);
    } else if (bridge === null && stopMenuBar !== null) {
      stopMenuBar();
      stopMenuBar = null;
    }
    if (settings.finishSound && stopSound === null) {
      stopSound = watchFinishSound(registry, router, sound);
    } else if (!settings.finishSound && stopSound !== null) {
      stopSound();
      stopSound = null;
    }
  };
  apply(useReadoutSettingsStore.getState());
  const unsubscribe = useReadoutSettingsStore.subscribe(apply);
  return () => {
    unsubscribe();
    stopMenuBar?.();
    stopSound?.();
  };
}

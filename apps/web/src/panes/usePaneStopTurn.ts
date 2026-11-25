import { toServerClock } from "@t3tools/client-runtime/clock";
import type {
  EnvironmentThreadShell,
  ThreadRunSummary,
  ThreadStructure,
  ThreadStructureVisibleTurnItem,
} from "@t3tools/client-runtime/state/shell";
import type { ThreadCheckpointSummary } from "@t3tools/client-runtime/state/thread-checkpoints";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type MessageId,
  type RunId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import type { makeThreadErrorSetter } from "../components/ChatView.logic";
import { rewindToMessage } from "../components/chat/chatViewSend";
import { recallComposerMessage } from "../components/chat/composerPromptHistory";
import { useComposerDraftStore, type ComposerThreadTarget } from "../composerDraftStore";
import type { ComposerHandleRef } from "../composerHandleContext";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  deriveRevertTurnCountByUserMessageId,
  findRevertCheckpoint,
  type TimelineEntry,
} from "../session-logic";
import { assetEnvironment } from "../state/assets";
import { readEnvironmentScope } from "../state/session";
import { threadEnvironment } from "../state/threads";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import type { ChatMessage, SessionPhase } from "../types";
import {
  deriveStopSignal,
  laterSendIsPending,
  type PendingTakeBack,
  promptWithReturnedMessage,
  registerFocusedStopTurn,
  resolveTakeBack,
  runIsUntouched,
  TAKE_BACK_SETTLE_TIMEOUT_MS,
  unsettledRunIdOf,
  withAssistantMessageEntries,
} from "./paneStopTurn";

/** Stock locals of the chat view, under their stock names. */
export interface PaneStopTurnInput {
  readonly environmentId: EnvironmentId;
  readonly routeThreadRef: ScopedThreadRef;
  readonly routeThreadKey: string;
  readonly serverProjection: ThreadStructure | null;
  readonly activeThread: EnvironmentThreadShell | undefined;
  readonly activeRunningTurnId: RunId | null;
  readonly activeActivityRun: ThreadRunSummary | null;
  readonly canInterruptRunningThread: boolean;
  readonly onInterruptStable: () => unknown;
  readonly promptRef: { current: string };
  readonly composerRef: ComposerHandleRef;
  readonly composerDraftTarget: ComposerThreadTarget;
  readonly setThreadError: ReturnType<typeof makeThreadErrorSetter>;
  readonly phase: SessionPhase;
  readonly isSendBusy: boolean;
  readonly sendInFlightRef: { readonly current: boolean };
  readonly optimisticUserMessages: ReadonlyArray<ChatMessage>;
  readonly supportsConversationRollback: boolean;
  readonly activeEnvironmentUnavailable: boolean;
  readonly serverVisibleTurnItems: ReadonlyArray<ThreadStructureVisibleTurnItem>;
  readonly timelineEntries: ReadonlyArray<TimelineEntry>;
  readonly turnDiffSummaries: ReadonlyArray<ThreadCheckpointSummary>;
  readonly availableRevertTurnCounts: ReadonlySet<number>;
  readonly threadStartCheckpointAvailable: boolean;
}

/**
 * Gives the stock stop of a chat view to the `layout.stopTurn` key, for the chat view of the
 * focused pane only (`active`). A message sent a moment ago is taken back: its text returns to
 * the composer at the key press, and the conversation rewinds with the stock "Revert and keep
 * changes" when the server settled the stopped run, also after the pane lost focus.
 */
export function usePaneStopTurn(input: PaneStopTurnInput, active: boolean): void {
  const [pending, setPending] = useState<PendingTakeBack | null>(null);
  const [timedOut, setTimedOut] = useState<PendingTakeBack | null>(null);
  const settled = useRef<PendingTakeBack | null>(null);
  const revertThreadCheckpoint = useOrchestrationCommand(threadEnvironment.revertCheckpoint, {
    reportFailure: false,
  });
  const createAttachmentAssetUrl = useAtomQueryRunner(assetEnvironment.createUrl, {
    reportFailure: false,
    refresh: true,
  });

  const { promptRef, composerRef } = input;

  const messageOf = (messageId: MessageId): ChatMessage | undefined => {
    for (const entry of input.timelineEntries) {
      if (entry.kind === "message" && entry.message.id === messageId) return entry.message;
    }
    return undefined;
  };

  /** The stock end of a rewind, at the key press: the text shows with no wait for the server. */
  const returnToComposer = (message: ChatMessage) => {
    const { prompt: returned, mentions } = recallComposerMessage(message);
    if (returned.length === 0) return;
    const store = useComposerDraftStore.getState();
    const target = input.composerDraftTarget;
    const prompt = promptWithReturnedMessage(
      store.getComposerDraft(target)?.prompt ?? "",
      returned,
    );
    store.setPrompt(target, prompt);
    // The prompt already carries the chips. These add only their records.
    store.addThreadContexts(target, mentions.threadContexts, { appendReference: false });
    store.addEnvironmentContexts(target, mentions.environmentContexts, {
      appendReference: false,
    });
    promptRef.current = prompt;
    composerRef.current?.resetCursorState({ prompt, cursor: prompt.length });
    requestAnimationFrame(() => composerRef.current?.focusAtEnd());
  };

  /**
   * The stock rewind of "Revert and keep changes" (`useTimelineRewind`), without its last step.
   * The text is in the composer since the key press, so the message goes to the stock function
   * with no text: it then adds the attachments only, and the caret of the user stays.
   */
  const rewind = useStableCallback(async (turnCount: number, messageId: MessageId) => {
    const thread = input.activeThread;
    const message = messageOf(messageId);
    const threadKey = input.routeThreadKey;
    if (
      thread === undefined ||
      message === undefined ||
      useComposerDraftStore.getState().rewindingThreadKeys.has(threadKey) ||
      !readEnvironmentScope(input.environmentId, AuthOrchestrationOperateScope)
    ) {
      return;
    }
    useComposerDraftStore.setState((store) => ({
      rewindingThreadKeys: new Set(store.rewindingThreadKeys).add(threadKey),
    }));
    input.setThreadError(thread.id, null);
    const result = await rewindToMessage({
      message: { ...message, text: "" },
      environmentId: input.environmentId,
      routeThreadRef: input.routeThreadRef,
      threadId: thread.id,
      turnCount,
      restoreFiles: false,
      checkpoint: findRevertCheckpoint(input.serverProjection?.checkpoints ?? [], turnCount),
      draftTarget: input.composerDraftTarget,
      composerHasPendingAttachments: composerRef.current?.hasPendingAttachments() === true,
      createAssetUrl: createAttachmentAssetUrl,
      revertThreadCheckpoint,
    });
    useComposerDraftStore.setState((store) => {
      const remaining = new Set(store.rewindingThreadKeys);
      remaining.delete(threadKey);
      return { rewindingThreadKeys: remaining };
    });
    if (result.error !== null) input.setThreadError(thread.id, result.error);
  });

  const canStop = useStableCallback(() => input.canInterruptRunningThread);
  const stop = useStableCallback(() => {
    if (!input.canInterruptRunningThread) return;
    // What the stock `thread.stop` key does. Nothing else is stopped.
    void input.onInterruptStable();
    // A second press on the same run keeps a pending take back.
    if (
      pending !== null &&
      pending.threadKey === input.routeThreadKey &&
      pending.runId === input.activeRunningTurnId
    ) {
      return;
    }
    const signal = deriveStopSignal({
      projection: input.serverProjection,
      activeRunId: input.activeRunningTurnId,
      nowServerMs: toServerClock(input.environmentId, Date.now()),
    });
    if (signal.kind !== "take-back") {
      setPending(null);
      return;
    }
    const message = messageOf(signal.messageId);
    if (message !== undefined) returnToComposer(message);
    setPending({
      threadKey: input.routeThreadKey,
      runId: signal.runId,
      messageId: signal.messageId,
    });
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers this chat view's stop action outside React, for the fork's key handler (paneStopTurn.ts)
  useEffect(
    () => (active ? registerFocusedStopTurn({ canStop, stop }) : undefined),
    [active, canStop, stop],
  );

  const resolution =
    pending === null
      ? null
      : resolveTakeBack(pending, {
          threadKey: input.routeThreadKey,
          runs: input.serverProjection?.runs ?? [],
          runUntouched: runIsUntouched(
            input.serverProjection?.turnItems ?? [],
            pending.runId,
            pending.messageId,
          ),
          phase: input.phase,
          isSendBusy: input.isSendBusy,
          laterSendPending: laterSendIsPending(
            input.optimisticUserMessages,
            pending.messageId,
            input.sendInFlightRef.current,
          ),
          supportsConversationRollback: input.supportsConversationRollback,
          environmentUnavailable: input.activeEnvironmentUnavailable,
          // The call that the timeline makes for its "Edit from here" buttons. The entries
          // of the timeline hold the messages of the agent, and those of the chat view do not.
          revertTurnCount: deriveRevertTurnCountByUserMessageId({
            timelineEntries: withAssistantMessageEntries(
              input.timelineEntries,
              input.serverVisibleTurnItems,
            ),
            checkpoints: input.turnDiffSummaries,
            threadStartCheckpointAvailable: input.threadStartCheckpointAvailable,
            unsettledRunId: unsettledRunIdOf(input.activeActivityRun, input.activeRunningTurnId),
            availableRevertTurnCounts: input.availableRevertTurnCounts,
          }).get(pending.messageId),
          timedOut: timedOut === pending,
        });
  const waiting = resolution === null || resolution === "wait";
  const rewindTurnCount = typeof resolution === "object" ? (resolution?.rewind ?? null) : null;
  const { sendInFlightRef } = input;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the stopped run settles in a server event, not in a handler: the render that first sees it settled starts the stock rewind
  useEffect(() => {
    if (pending === null || waiting || settled.current === pending) return;
    // The rewind must start one time for one key press.
    settled.current = pending;
    setPending(null);
    // A send that started after the render is not in `resolveTakeBack`. It drops the take back.
    if (rewindTurnCount === null || sendInFlightRef.current) return;
    void rewind(rewindTurnCount, pending.messageId);
  }, [pending, waiting, rewindTurnCount, rewind, sendInFlightRef]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a timer bounds the wait for the server to settle the stopped run
  useEffect(() => {
    if (pending === null) return undefined;
    const timer = window.setTimeout(() => setTimedOut(pending), TAKE_BACK_SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);
}

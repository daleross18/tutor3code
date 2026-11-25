import type {
  ThreadRunSummary,
  ThreadStructure,
  ThreadStructureVisibleTurnItem,
} from "@t3tools/client-runtime/state/shell";
import {
  MessageId,
  ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE,
  RunId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it, vi } from "vite-plus/test";

import { deriveRevertTurnCountByUserMessageId, type TimelineEntry } from "../session-logic";
import {
  deriveStopSignal,
  focusedTurnStoppable,
  laterSendIsPending,
  type PendingTakeBack,
  registerFocusedStopTurn,
  resolveTakeBack,
  stopFocusedTurn,
  type TakeBackState,
  unsettledRunIdOf,
  withAssistantMessageEntries,
  promptWithReturnedMessage,
} from "./paneStopTurn";

type Projection = Pick<ThreadStructure, "runs" | "messages" | "turnItems">;
type Run = Projection["runs"][number];
type Message = Projection["messages"][number];
type TurnItem = Projection["turnItems"][number];

const RUN = RunId.make("run-2");
const OTHER_RUN = RunId.make("run-1");
const MESSAGE = MessageId.make("message-2");
const SENT_AT = DateTime.makeUnsafe("2026-03-17T19:12:28.000Z");
const SENT_AT_MS = DateTime.toEpochMillis(SENT_AT);

// The functions read a few fields of each record, so a fixture holds only those.
const run = (fields: Partial<Run> = {}) =>
  ({ id: RUN, ordinal: 2, userMessageId: MESSAGE, status: "running", ...fields }) as Run;
const message = (fields: Partial<Message> = {}) =>
  ({
    id: MESSAGE,
    role: "user",
    text: "Do it",
    createdBy: "user",
    createdAt: SENT_AT,
    ...fields,
  }) as Message;
const item = (type: string, fields: object = {}) =>
  ({ id: `item-${type}`, runId: RUN, type, status: "completed", ...fields }) as unknown as TurnItem;
const userItem = (fields: object = {}) =>
  item("user_message", { messageId: MESSAGE, inputIntent: "turn_start", ...fields });

const TAKE_BACK = { kind: "take-back", runId: RUN, messageId: MESSAGE };
const STOP = { kind: "stop" };

interface SignalInput {
  readonly items?: ReadonlyArray<TurnItem>;
  readonly run?: Partial<Run>;
  readonly message?: Partial<Message>;
  readonly ageMs?: number;
}

function signal(input: SignalInput = {}) {
  return deriveStopSignal({
    projection: {
      runs: [run({ id: OTHER_RUN, ordinal: 1, status: "completed" }), run(input.run)],
      messages: [message(input.message)],
      turnItems: [userItem(), ...(input.items ?? [])],
    },
    activeRunId: RUN,
    nowServerMs: SENT_AT_MS + (input.ageMs ?? 2_000),
  });
}

describe("deriveStopSignal", () => {
  it.each<[string, SignalInput]>([
    ["the run holds only its message", {}],
    // The ages are written as numbers: a row that read the constant would pass for any window.
    ["the message is 1 ms inside the window of 15 s", { ageMs: 14_999 }],
    ["the server clock is a second behind the estimate", { ageMs: -1_000 }],
    [
      "the agent wrote text and thought, and did nothing",
      { items: [item("reasoning"), item("assistant_message")] },
    ],
    [
      "the server ran the workspace setup",
      { items: [item("command_execution", { input: "Preparing workspace" })] },
    ],
    [
      "the user cancelled the workspace setup",
      {
        items: [
          item("error", {
            status: "cancelled",
            failure: { code: ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE },
          }),
        ],
      },
    ],
    [
      "the run holds records of the app only",
      {
        items: [
          item("checkpoint"),
          item("system_notice"),
          item("notification"),
          item("run_interrupt_request"),
          item("run_interrupt_result"),
        ],
      },
    ],
    ["a tool ran in another run", { items: [item("command_execution", { runId: OTHER_RUN })] }],
  ])("takes the message back when %s", (_name, input) => {
    expect(signal(input)).toEqual(TAKE_BACK);
  });

  it.each<[string, SignalInput]>([
    ["the message is as old as the window of 15 s", { ageMs: 15_000 }],
    ["the message is from long ago", { ageMs: 3_600_000 }],
    ["the message is from the future by the window of 15 s", { ageMs: -15_000 }],
    [
      "the message time cannot be read",
      { message: { createdAt: "not a time" as unknown as DateTime.Utc } },
    ],
    ["an agent sent the message", { message: { createdBy: "agent" } }],
    ["the app sent the message", { message: { createdBy: "system" } }],
    // Both carry `createdBy` "user", and the user typed neither.
    ["a scheduled task sent the message", { message: { scheduledTaskId: "task-1" as never } }],
    [
      "a guest sent the message",
      {
        message: {
          context: { version: 1, guest: { name: "Ada", text: "Do it" }, records: [] } as never,
        },
      },
    ],
    ["the run has no message", { message: { id: MessageId.make("other") } }],
    ["the run continues a run by hand", { run: { manualContinuationOfRunId: OTHER_RUN } }],
    ["the run continues a run after a restart", { run: { restartContinuationOfRunId: OTHER_RUN } }],
    [
      "the run continues a run after a usage limit",
      { run: { usageLimitContinuationOfRunId: OTHER_RUN } },
    ],
    ["the run is a delegated task", { run: { delegatedTaskId: "node-1" as never } }],
    [
      "the user steered the run with a second message",
      {
        items: [userItem({ messageId: MessageId.make("message-3"), inputIntent: "steer" })],
      },
    ],
    ["the run lists its message two times", { items: [userItem()] }],
    ["a command ran", { items: [item("command_execution", { input: "rm -rf build" })] }],
    ["the run failed with an error", { items: [item("error", { status: "failed" })] }],
    ["work of the run is collapsed", { items: [item("reasoning", { deferredWork: {} })] }],
    ["a newer server sent a type that this client does not know", { items: [item("new_kind")] }],
    ...[
      "file_change",
      "file_search",
      "web_search",
      "dynamic_tool",
      "subagent",
      "thread_created",
      "handoff",
      "fork",
      "approval_request",
      "user_input_request",
      "secret_request",
      "link_request",
      "todo_list",
      "proposed_plan",
      "compaction",
    ].map((type): [string, SignalInput] => [
      `the run holds a ${type} item`,
      { items: [item(type)] },
    ]),
  ])("only stops when %s", (_name, input) => {
    expect(signal(input)).toEqual(STOP);
  });

  it("only stops when the chat view has no run that the stop targets", () => {
    const projection: Projection = {
      runs: [run()],
      messages: [message()],
      turnItems: [userItem()],
    };
    const nowServerMs = SENT_AT_MS + 2_000;
    expect(deriveStopSignal({ projection, activeRunId: RUN, nowServerMs })).toEqual(TAKE_BACK);
    expect(deriveStopSignal({ projection, activeRunId: null, nowServerMs })).toEqual(STOP);
    expect(deriveStopSignal({ projection, activeRunId: OTHER_RUN, nowServerMs })).toEqual(STOP);
    expect(deriveStopSignal({ projection: null, activeRunId: RUN, nowServerMs })).toEqual(STOP);
    // The message turn item arrives one event after the run.
    expect(
      deriveStopSignal({
        projection: { ...projection, turnItems: [] },
        activeRunId: RUN,
        nowServerMs,
      }),
    ).toEqual(STOP);
  });
});

const pending: PendingTakeBack = {
  threadKey: "environment:thread",
  runId: RUN,
  messageId: MESSAGE,
};

function resolve(state: Partial<TakeBackState> & { readonly status?: Run["status"] } = {}) {
  const { status = "interrupted", ...rest } = state;
  return resolveTakeBack(pending, {
    threadKey: pending.threadKey,
    runs: [run({ id: OTHER_RUN, ordinal: 1, status: "completed" }), run({ status })],
    runUntouched: true,
    phase: "ready",
    isSendBusy: false,
    laterSendPending: false,
    supportsConversationRollback: true,
    environmentUnavailable: false,
    revertTurnCount: 1,
    timedOut: false,
    ...rest,
  });
}

describe("resolveTakeBack", () => {
  it.each<[string, Parameters<typeof resolve>[0], ReturnType<typeof resolveTakeBack>]>([
    ["the run is interrupted and the message has a target", {}, { rewind: 1 }],
    ["the target is the thread start", { revertTurnCount: 0 }, { rewind: 0 }],
    ["the target shows in the render of the timeout", { timedOut: true }, { rewind: 1 }],
    ["the runtime is gone after the stop", { phase: "disconnected" }, { rewind: 1 }],
    ["the run still prepares", { status: "preparing" }, "wait"],
    ["the run still starts", { status: "starting" }, "wait"],
    ["the run still runs", { status: "running" }, "wait"],
    ["the run waits for its checkpoint", { status: "waiting" }, "wait"],
    ["the chat view still shows a running turn", { phase: "running" }, "wait"],
    ["the send of the message is not acknowledged", { isSendBusy: true }, "wait"],
    ["the message has no target yet", { revertTurnCount: undefined }, "wait"],
    ["the environment is not connected", { environmentUnavailable: true }, "wait"],
    ["the run does not settle in time", { status: "running", timedOut: true }, "drop"],
    ["no target shows in time", { revertTurnCount: undefined, timedOut: true }, "drop"],
    ["the send stays busy", { isSendBusy: true, timedOut: true }, "drop"],
    ["the run completed before the stop", { status: "completed" }, "drop"],
    ["the run failed", { status: "failed" }, "drop"],
    ["the run was cancelled", { status: "cancelled" }, "drop"],
    ["another rewind rolled the run back", { status: "rolled_back" }, "drop"],
    ["the provider has no rollback", { supportsConversationRollback: false }, "drop"],
    ["a tool started after the key press", { runUntouched: false }, "drop"],
    [
      "a tool started while the run still stops",
      { status: "running", runUntouched: false },
      "drop",
    ],
    // The settled run clears `isSendBusy` while the server does not show the later send yet.
    ["the user sent again and the server does not show it yet", { laterSendPending: true }, "drop"],
    [
      "the user sent again while the run still stops",
      { status: "running", laterSendPending: true },
      "drop",
    ],
    ["the chat view shows another thread", { threadKey: "environment:other" }, "drop"],
    ["the run left the projection", { runs: [] }, "drop"],
    [
      "the user sent again, so a later run exists",
      {
        runs: [
          run({ status: "interrupted" }),
          run({ id: RunId.make("run-3"), ordinal: 3, status: "queued" }),
        ],
      },
      "drop",
    ],
  ])("when %s", (_name, state, resolution) => {
    expect(resolve(state)).toEqual(resolution);
  });
});

it.each([
  ["an empty composer takes the message", "", "fix the typo", "fix the typo"],
  ["a draft keeps its place before the message", "draft", "fix the typo", "draft\n\nfix the typo"],
  ["a message with no text changes nothing", "draft", "", "draft"],
])("promptWithReturnedMessage: %s", (_name, current, returned, expected) => {
  expect(promptWithReturnedMessage(current, returned)).toBe(expected);
});

describe("laterSendIsPending", () => {
  const LATER = MessageId.make("message-3");
  it.each<[string, ReadonlyArray<MessageId>, boolean, boolean]>([
    ["no send", [], false, false],
    ["the message of the take back, not yet shown by the server", [MESSAGE], false, false],
    ["a later message that the server does not show yet", [MESSAGE, LATER], false, true],
    ["a later message alone", [LATER], false, true],
    ["a send that has no optimistic message yet", [], true, true],
  ])("for %s", (_name, optimisticIds, sendInFlight, expected) => {
    const optimistic = optimisticIds.map((id) => ({ id }));
    expect(laterSendIsPending(optimistic, MESSAGE, sendInFlight)).toBe(expected);
  });
});

describe("withAssistantMessageEntries", () => {
  const row = (type: string, runId: RunId, id: string, visibility = "local") =>
    ({
      visibility,
      item: { id: `item-${id}`, type, runId, messageId: MessageId.make(id) },
    }) as unknown as ThreadStructureVisibleTurnItem;
  // The chat view builds its entries from the rows that are no text of the agent. An
  // optimistic message has no row yet.
  const userEntry = (userRow: ThreadStructureVisibleTurnItem, onServer = true): TimelineEntry => {
    const userRowItem = userRow.item as Extract<TurnItem, { type: "user_message" }>;
    return {
      id: userRowItem.messageId,
      kind: "message",
      createdAt: "2026-03-17T19:12:28.000Z",
      message: {
        id: userRowItem.messageId,
        role: "user",
        text: "",
        runId: userRowItem.runId,
        streaming: false,
        inputIntent: "turn_start",
        createdAt: "2026-03-17T19:12:28.000Z",
        updatedAt: "2026-03-17T19:12:28.000Z",
      },
      ...(onServer ? { projectedItem: userRow as never } : {}),
    };
  };
  const targetOf = (timelineEntries: ReadonlyArray<TimelineEntry>) =>
    deriveRevertTurnCountByUserMessageId({
      timelineEntries,
      checkpoints: [
        {
          runId: OTHER_RUN,
          checkpointTurnCount: 1,
          checkpointRef: "checkpoint-run-1" as never,
          status: "ready",
          files: [],
          assistantMessageId: null,
          completedAt: "2026-03-17T19:12:20.000Z",
        },
      ],
      // The loaded history starts inside the run before, so the thread start is not known.
      threadStartCheckpointAvailable: false,
      unsettledRunId: null,
    }).get(MESSAGE);

  it("gives the stock rewind target after a turn whose only loaded row is text of the agent", () => {
    const answer = row("assistant_message", OTHER_RUN, "answer-1");
    const sent = row("user_message", RUN, MESSAGE);
    const entries = [userEntry(sent)];
    expect(targetOf(entries)).toBeUndefined();
    const merged = withAssistantMessageEntries(entries, [answer, sent]);
    expect(merged.map((entry) => entry.id)).toEqual(["answer-1", MESSAGE]);
    expect(targetOf(merged)).toBe(1);
  });

  it("keeps the order of the rows, and adds no inherited message", () => {
    const first = row("user_message", OTHER_RUN, "message-1");
    const answer = row("assistant_message", OTHER_RUN, "answer-1");
    const sent = row("user_message", RUN, MESSAGE);
    const late = row("assistant_message", RUN, "answer-2");
    const inherited = row("assistant_message", RunId.make("run-0"), "answer-0", "inherited");
    const optimistic = userEntry(row("user_message", RUN, "message-3"), false);
    const entries = [userEntry(first), userEntry(sent), optimistic];
    const merged = withAssistantMessageEntries(entries, [inherited, first, answer, sent, late]);
    expect(merged.map((entry) => entry.id)).toEqual([
      "message-1",
      "answer-1",
      MESSAGE,
      "message-3",
      "answer-2",
    ]);
    // With no text of the agent the entries of the chat view are the entries of the timeline.
    expect(withAssistantMessageEntries(entries, [first, sent])).toBe(entries);
  });
});

describe("unsettledRunIdOf", () => {
  type LatestRun = Pick<ThreadRunSummary, "runId" | "status" | "completedAt">;
  const latest: LatestRun = {
    runId: RUN,
    status: "interrupted",
    completedAt: "2026-03-17T19:12:30.000Z",
  };
  it.each<[string, LatestRun | null, RunId | null, RunId | null]>([
    ["no run", null, null, null],
    ["a running run", latest, OTHER_RUN, OTHER_RUN],
    ["a settled latest run", latest, null, null],
    ["a latest run with no end time", { ...latest, completedAt: null }, null, RUN],
    ["a latest run that waits", { ...latest, status: "waiting" }, null, RUN],
  ])("names the unsettled run for %s", (_name, latestRun, runningRunId, runId) => {
    expect(unsettledRunIdOf(latestRun, runningRunId)).toBe(runId);
  });
});

describe("stopFocusedTurn", () => {
  it("asks and stops the chat view that registered last, and none after it left", () => {
    expect(focusedTurnStoppable()).toBe(false);
    const first = { canStop: () => true, stop: vi.fn() };
    const second = { canStop: () => false, stop: vi.fn() };
    const leaveFirst = registerFocusedStopTurn(first);
    expect(focusedTurnStoppable()).toBe(true);
    const leaveSecond = registerFocusedStopTurn(second);
    expect(focusedTurnStoppable()).toBe(false);
    stopFocusedTurn();
    expect(second.stop).toHaveBeenCalledOnce();
    // The pane that lost focus leaves after the pane that took it registered.
    leaveFirst();
    stopFocusedTurn();
    expect(second.stop).toHaveBeenCalledTimes(2);
    leaveSecond();
    stopFocusedTurn();
    expect(first.stop).not.toHaveBeenCalled();
    expect(second.stop).toHaveBeenCalledTimes(2);
  });
});

import { expect, it } from "vite-plus/test";

import {
  buildComposerPromptHistoryEntries,
  stepComposerPromptHistory,
} from "../components/chat/composerPromptHistory";
import type { TimelineEntry } from "../session-logic";
import type { ChatMessage } from "../types";
import { mergePromptHistory, resumePromptHistoryPosition } from "./promptHistoryMemory";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

function message(
  id: string,
  role: ChatMessage["role"],
  text: string,
  minute: number,
): TimelineEntry {
  const createdAt = `2026-11-23T10:${String(minute).padStart(2, "0")}:00.000Z`;
  return {
    id,
    kind: "message",
    createdAt,
    message: {
      id,
      role,
      text,
      runId: null,
      streaming: false,
      createdAt,
      updatedAt: createdAt,
    } as ChatMessage,
  };
}

const prompts = (entries: ReadonlyArray<TimelineEntry>) =>
  buildComposerPromptHistoryEntries(
    entries.flatMap((entry) => (entry.kind === "message" ? [entry.message] : [])),
  ).map((entry) => entry.prompt);

it("keeps the user messages that a fresh snapshot of the latest rows removed, in time order", () => {
  const first = message("m1", "user", "first", 1);
  const answer = message("m2", "assistant", "answer", 2);
  const second = message("m3", "user", "second", 3);
  const work = message("m4", "assistant", "still working", 9);
  expect(prompts(mergePromptHistory("thread-a", [first, answer, second]))).toEqual([
    "first",
    "second",
  ]);
  // After a reconnect the thread holds only its latest rows.
  expect(prompts(mergePromptHistory("thread-a", [work]))).toEqual(["first", "second"]);
  const third = message("m5", "user", "third", 10);
  expect(prompts(mergePromptHistory("thread-a", [work, third]))).toEqual([
    "first",
    "second",
    "third",
  ]);
  // Another thread does not see them.
  expect(mergePromptHistory("thread-b", [work])).toEqual([work]);
});

it("a recalled message left in the input continues the recall after a remount", () => {
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  const entries = buildComposerPromptHistoryEntries(
    [message("a", "user", "one", 1), message("b", "user", "two", 2)].flatMap((entry) =>
      entry.kind === "message" ? [entry.message] : [],
    ),
  );
  const position = resumePromptHistoryPosition(null, "two");
  expect(
    stepComposerPromptHistory({ direction: "backward", entries, position, currentPrompt: "two" })
      ?.prompt,
  ).toBe("one");
  // Typed text that matches no message stays as it is.
  expect(
    stepComposerPromptHistory({
      direction: "backward",
      entries,
      position: resumePromptHistoryPosition(null, "typed"),
      currentPrompt: "typed",
    }),
  ).toBeNull();
  expect(resumePromptHistoryPosition(null, "")).toBeNull();
  useReadoutSettingsStore.setState({ keepPromptHistory: false });
  expect(resumePromptHistoryPosition(null, "two")).toBeNull();
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
});

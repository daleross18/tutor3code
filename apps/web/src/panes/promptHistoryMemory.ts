import { useEffect } from "react";

import { composerTargetKey } from "../composerDraftStore";
import type { ComposerPromptHistoryPosition } from "../components/chat/composerPromptHistory";
import type { TimelineEntry } from "../session-logic";
import { useReadoutSettingsStore } from "./readoutSettings";

type ComposerThreadTarget = Parameters<typeof composerTargetKey>[0];
type MessageEntry = Extract<TimelineEntry, { kind: "message" }>;

// A reconnect gives a thread a fresh snapshot of its latest rows only, so its older user
// messages leave the timeline. The input history keeps the ones that this window saw.
const MAX_MESSAGES_PER_THREAD = 200;
const MAX_THREADS = 300;
const seenByTarget = new Map<string, Map<string, MessageEntry>>();

function isUserMessage(entry: TimelineEntry): entry is MessageEntry {
  return entry.kind === "message" && entry.message.role === "user" && !entry.message.streaming;
}

function recordPromptHistory(key: string, entries: ReadonlyArray<TimelineEntry>): void {
  let seen = seenByTarget.get(key);
  for (const entry of entries) {
    if (!isUserMessage(entry)) continue;
    if (seen === undefined) {
      seen = new Map();
      seenByTarget.set(key, seen);
    }
    seen.set(entry.message.id, entry);
  }
  if (seen === undefined) return;
  // Most recently used last, for the limit on the number of threads.
  seenByTarget.delete(key);
  seenByTarget.set(key, seen);
  if (seenByTarget.size > MAX_THREADS) {
    seenByTarget.delete(seenByTarget.keys().next().value!);
  }
  if (seen.size > MAX_MESSAGES_PER_THREAD) {
    const oldestFirst = [...seen.values()].toSorted((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    for (const entry of oldestFirst.slice(0, seen.size - MAX_MESSAGES_PER_THREAD)) {
      seen.delete(entry.message.id);
    }
  }
}

/** The timeline with the user messages that it lost since this window saw them, by time. */
export function mergePromptHistory(
  key: string,
  entries: ReadonlyArray<TimelineEntry>,
): ReadonlyArray<TimelineEntry> {
  recordPromptHistory(key, entries);
  const seen = seenByTarget.get(key);
  if (seen === undefined) return entries;
  const loaded = new Set<string>();
  for (const entry of entries) if (entry.kind === "message") loaded.add(entry.message.id);
  const lost = [...seen.values()].filter((entry) => !loaded.has(entry.message.id));
  if (lost.length === 0) return entries;
  return [...lost, ...entries].toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * A recalled message stays in the draft when the composer remounts, but the stock position of
 * the recall does not. A prompt with the text of a sent message resumes the recall from there.
 */
export function resumePromptHistoryPosition(
  position: ComposerPromptHistoryPosition | null,
  prompt: string,
): ComposerPromptHistoryPosition | null {
  if (position !== null || prompt.length === 0) return position;
  if (!useReadoutSettingsStore.getState().keepPromptHistory) return position;
  // The stock step finds an entry by this text when the id matches none.
  return { entryId: "", recalled: prompt };
}

/** The input history for the Up key: with the setting off, the stock timeline only. */
export function promptHistoryFor(
  target: ComposerThreadTarget,
  entries: ReadonlyArray<TimelineEntry>,
): ReadonlyArray<TimelineEntry> {
  if (!useReadoutSettingsStore.getState().keepPromptHistory) return entries;
  return mergePromptHistory(composerTargetKey(target), entries);
}

/** Records the user messages of the timeline while it holds them. */
export function useRememberPromptHistory(
  target: ComposerThreadTarget,
  entries: ReadonlyArray<TimelineEntry>,
): void {
  const enabled = useReadoutSettingsStore((settings) => settings.keepPromptHistory);
  const key = composerTargetKey(target);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- copies the user messages of the timeline into the window's history memory, outside React
  useEffect(() => {
    if (enabled) recordPromptHistory(key, entries);
  }, [enabled, key, entries]);
}

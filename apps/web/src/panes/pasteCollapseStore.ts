import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "../lib/storage";
import { followOtherWindows } from "./forkStorageSync";
import {
  carryPasteRanges,
  restorePasteRanges,
  type PasteRange,
  type StoredPasteRange,
} from "./pasteCollapse";

// Same reason as the density key: a stock server and the strict desktop settings schema know no
// such setting, so it stays in the fork's own browser storage.
export const PASTE_COLLAPSE_SETTINGS_STORAGE_KEY = "t3code-fork:paste-collapse:v1";
export const PASTE_CHIPS_STORAGE_KEY = "t3code-fork:paste-chips:v1";
const STORAGE_VERSION = 1;

// A draft that was sent or deleted leaves its entry behind; the oldest entries go first.
const MAX_SAVED_DRAFTS = 200;
// The store changes before the prompt of the same edit reaches a render, so the states of the
// last edits stay findable by their prompt.
const MAX_STATES = 4;

export interface PasteCollapseSettingsState {
  readonly collapseLongPastes: boolean;
  setCollapseLongPastes: (enabled: boolean) => void;
}

export const DEFAULT_COLLAPSE_LONG_PASTES = false;

/** The storage is a parameter so a test can open a second store on the same stored value. */
export function createPasteCollapseSettingsStore(storage: StateStorage) {
  return create<PasteCollapseSettingsState>()(
    persist(
      (set) => ({
        collapseLongPastes: DEFAULT_COLLAPSE_LONG_PASTES,
        setCollapseLongPastes: (enabled) => set({ collapseLongPastes: enabled }),
      }),
      {
        name: PASTE_COLLAPSE_SETTINGS_STORAGE_KEY,
        version: STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ collapseLongPastes }) => ({ collapseLongPastes }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          collapseLongPastes:
            typeof persistedState === "object" &&
            persistedState !== null &&
            Reflect.get(persistedState, "collapseLongPastes") === true,
        }),
      },
    ),
  );
}

/** The chips of one prompt, and the cursor pair of the edit that produced it. */
export interface PasteChipState {
  readonly prompt: string;
  readonly ranges: ReadonlyArray<PasteRange>;
  /** The collapsed cursor sent to the stock composer, and the editor's own cursor for it. */
  readonly cursor: { readonly prompt: number; readonly editor: number } | null;
}

export interface PasteChipEntry {
  /** Newest first. */
  readonly states: ReadonlyArray<PasteChipState>;
  /** Read from storage, and not yet compared with the prompt. */
  readonly restored: ReadonlyArray<StoredPasteRange> | null;
}

export type PasteChipView =
  | { readonly source: "none"; readonly ranges: ReadonlyArray<PasteRange>; readonly state: null }
  | {
      readonly source: "newest" | "recent";
      readonly ranges: ReadonlyArray<PasteRange>;
      readonly state: PasteChipState;
    }
  | {
      readonly source: "carried" | "restored";
      readonly ranges: ReadonlyArray<PasteRange>;
      readonly state: null;
    };

const NO_RANGES: ReadonlyArray<PasteRange> = [];
const NO_VIEW: PasteChipView = { source: "none", ranges: NO_RANGES, state: null };

/** The chips to show for a prompt. Pure: a prompt the store does not know keeps what a stock edit left. */
export function resolvePasteChipView(
  prompt: string,
  entry: PasteChipEntry | undefined,
): PasteChipView {
  if (entry === undefined) return NO_VIEW;
  const index = entry.states.findIndex((state) => state.prompt === prompt);
  if (index >= 0) {
    const state = entry.states[index]!;
    return { source: index === 0 ? "newest" : "recent", ranges: state.ranges, state };
  }
  const newest = entry.states[0];
  if (newest !== undefined) {
    return {
      source: "carried",
      ranges: carryPasteRanges(newest.prompt, prompt, newest.ranges),
      state: null,
    };
  }
  if (entry.restored === null) return NO_VIEW;
  return { source: "restored", ranges: restorePasteRanges(prompt, entry.restored), state: null };
}

export interface PasteChipStoreState {
  readonly entries: Readonly<Record<string, PasteChipEntry>>;
  /** Makes `state` the newest state of the draft. A draft with no chip left is forgotten. */
  record: (draftKey: string, state: PasteChipState) => void;
}

type SavedDrafts = Readonly<Record<string, ReadonlyArray<StoredPasteRange>>>;

function savedRanges(entry: PasteChipEntry): ReadonlyArray<StoredPasteRange> {
  const newest = entry.states[0];
  if (newest === undefined) return entry.restored ?? [];
  return newest.ranges.map((range) => [range.start, range.end, range.id] as const);
}

function isStoredPasteRange(value: unknown): value is StoredPasteRange {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    Number.isInteger(value[0]) &&
    Number.isInteger(value[1]) &&
    typeof value[2] === "string"
  );
}

/** A stored value of another shape is dropped; the prompt then shows as full text. */
export function sanitizeSavedPasteChips(stored: unknown): Record<string, PasteChipEntry> {
  const drafts =
    typeof stored === "object" && stored !== null ? Reflect.get(stored, "drafts") : null;
  if (typeof drafts !== "object" || drafts === null) return {};
  const entries: Record<string, PasteChipEntry> = {};
  for (const [draftKey, ranges] of Object.entries(drafts)) {
    if (!Array.isArray(ranges)) continue;
    const restored = ranges.filter(isStoredPasteRange);
    if (restored.length > 0) entries[draftKey] = { states: [], restored };
  }
  return entries;
}

export function createPasteChipStore(storage: StateStorage) {
  return create<PasteChipStoreState>()(
    persist(
      (set) => ({
        entries: {},
        record: (draftKey, state) => {
          set(({ entries }) => {
            const previous = entries[draftKey];
            const { [draftKey]: _replaced, ...rest } = entries;
            const hadChips = previous?.states[0] ? previous.states[0].ranges.length > 0 : false;
            if (state.ranges.length === 0 && !hadChips) return { entries: rest };
            // With no chip left, only the prompt before this edit is still worth finding.
            const states = [state, ...(previous?.states ?? [])].slice(
              0,
              state.ranges.length === 0 ? 2 : MAX_STATES,
            );
            const kept = Object.entries(rest).slice(1 - MAX_SAVED_DRAFTS);
            return {
              entries: { ...Object.fromEntries(kept), [draftKey]: { states, restored: null } },
            };
          });
        },
      }),
      {
        name: PASTE_CHIPS_STORAGE_KEY,
        version: STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ entries }): { drafts: SavedDrafts } => ({
          drafts: Object.fromEntries(
            Object.entries(entries)
              .map(([draftKey, entry]) => [draftKey, savedRanges(entry)] as const)
              .filter(([, ranges]) => ranges.length > 0),
          ),
        }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          entries: sanitizeSavedPasteChips(persistedState),
        }),
      },
    ),
  );
}

const browserStorage = () =>
  resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined);

export const usePasteCollapseSettingsStore = createPasteCollapseSettingsStore(browserStorage());
followOtherWindows(usePasteCollapseSettingsStore);
export const usePasteChipStore = createPasteChipStore(browserStorage());

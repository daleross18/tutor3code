import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "../lib/storage";
import { followOtherWindows } from "./forkStorageSync";

// A stock server knows no such setting, so it stays in the fork's own browser storage.
export const ARCADE_SETTINGS_STORAGE_KEY = "t3code-fork:arcade:v1";
// Not a setting: the app writes it by itself, so it has a key of its own.
export const ARCADE_SCORES_STORAGE_KEY = "t3code-fork:arcade-scores:v1";
const STORAGE_VERSION = 1;

export const DEFAULT_SHOW_ARCADE = false;

export interface ArcadeSettingsState {
  readonly showArcade: boolean;
  setShowArcade: (enabled: boolean) => void;
}

/** The storage is a parameter so a test can open a second store on the same stored value. */
export function createArcadeSettingsStore(storage: StateStorage) {
  return create<ArcadeSettingsState>()(
    persist(
      (set) => ({
        showArcade: DEFAULT_SHOW_ARCADE,
        setShowArcade: (enabled) => set({ showArcade: enabled }),
      }),
      {
        name: ARCADE_SETTINGS_STORAGE_KEY,
        version: STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ showArcade }) => ({ showArcade }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          showArcade:
            typeof persistedState === "object" &&
            persistedState !== null &&
            Reflect.get(persistedState, "showArcade") === true,
        }),
      },
    ),
  );
}

export const useArcadeSettingsStore = createArcadeSettingsStore(
  resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
);
followOtherWindows(useArcadeSettingsStore);

export type ArcadeGameId = "snake" | "shooter" | "runner";
export type ArcadeBestScores = Readonly<Record<ArcadeGameId, number>>;

/** The best score of each game in this browser profile. 0 for a game with no valid score. */
export function readBestScores(storage: Pick<Storage, "getItem"> | undefined): ArcadeBestScores {
  let stored: unknown = null;
  try {
    stored = JSON.parse(storage?.getItem(ARCADE_SCORES_STORAGE_KEY) ?? "null");
  } catch {
    // A value that is no JSON counts as no score.
  }
  const read = (id: ArcadeGameId) => {
    const best = typeof stored === "object" && stored !== null ? Reflect.get(stored, id) : 0;
    return typeof best === "number" && Number.isFinite(best) && best > 0 ? Math.floor(best) : 0;
  };
  return { snake: read("snake"), shooter: read("shooter"), runner: read("runner") };
}

/** Writes one best score and keeps the scores of the other games. */
export function writeBestScore(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  id: ArcadeGameId,
  best: number,
): void {
  try {
    storage?.setItem(
      ARCADE_SCORES_STORAGE_KEY,
      JSON.stringify({ ...readBestScores(storage), [id]: best }),
    );
  } catch {
    // A full or blocked storage loses the score only.
  }
}

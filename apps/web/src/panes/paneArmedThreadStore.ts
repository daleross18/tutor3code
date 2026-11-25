import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "../lib/storage";

// State that the settle watch writes by itself (paneSettleWatch.ts). It has a key of its own,
// so such a write never holds a setting of the user.
export const PANE_ARMED_THREADS_STORAGE_KEY = "t3code-fork:armed-threads:v1";
const PANE_ARMED_THREADS_STORAGE_VERSION = 1;

/** A stored value of the wrong type gives no armed thread. */
export function sanitizeArmedThreadKeys(stored: unknown): ReadonlyArray<string> {
  const armed =
    typeof stored === "object" && stored !== null ? Reflect.get(stored, "armedThreadKeys") : null;
  return Array.isArray(armed) ? armed.filter((key): key is string => typeof key === "string") : [];
}

export interface PaneArmedThreadStoreState {
  /** Threads that a pane showed while they were not settled. */
  readonly armedThreadKeys: ReadonlyArray<string>;
  setThreadArmed: (threadKey: string, armed: boolean) => void;
  /** Keeps only the armed threads that `keep` accepts. */
  retainArmedThreads: (keep: (threadKey: string) => boolean) => void;
}

/** The storage is a parameter so a test can open a second store on the same stored value. */
export function createPaneArmedThreadStore(storage: StateStorage) {
  return create<PaneArmedThreadStoreState>()(
    persist(
      (set) => ({
        armedThreadKeys: [],
        setThreadArmed: (threadKey, armed) => {
          set((state) => {
            if (state.armedThreadKeys.includes(threadKey) === armed) return state;
            return {
              armedThreadKeys: armed
                ? [...state.armedThreadKeys, threadKey]
                : state.armedThreadKeys.filter((key) => key !== threadKey),
            };
          });
        },
        retainArmedThreads: (keep) => {
          set((state) => {
            const kept = state.armedThreadKeys.filter(keep);
            return kept.length === state.armedThreadKeys.length ? state : { armedThreadKeys: kept };
          });
        },
      }),
      {
        name: PANE_ARMED_THREADS_STORAGE_KEY,
        version: PANE_ARMED_THREADS_STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ armedThreadKeys }) => ({ armedThreadKeys }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          armedThreadKeys: sanitizeArmedThreadKeys(persistedState),
        }),
      },
    ),
  );
}

export const usePaneArmedThreadStore = createPaneArmedThreadStore(
  resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
);

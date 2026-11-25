import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "../lib/storage";
import { followOtherWindows } from "./forkStorageSync";

export const CHAT_DENSITIES = ["normal", "compact", "very-compact"] as const;
export type ChatDensity = (typeof CHAT_DENSITIES)[number];

export const CHAT_DENSITY_LABELS: Record<ChatDensity, string> = {
  normal: "Normal",
  compact: "Compact",
  "very-compact": "Very compact",
};

export interface PaneDensitySettings {
  /** Used while the active tab shows one pane. `normal` is the stock look. */
  readonly chatDensity: ChatDensity;
  /** Used for every pane while the active tab shows two or more panes. */
  readonly splitPaneDensity: ChatDensity;
}

export const DEFAULT_PANE_DENSITY_SETTINGS: PaneDensitySettings = {
  chatDensity: "normal",
  splitPaneDensity: "compact",
};

// The stock client settings are decoded with a strict schema on the desktop side, and a stock
// server knows no density key, so the two values stay in the fork's own browser storage.
export const PANE_DENSITY_STORAGE_KEY = "t3code-fork:density:v1";
const PANE_DENSITY_STORAGE_VERSION = 1;

export function isChatDensity(value: unknown): value is ChatDensity {
  return CHAT_DENSITIES.some((density) => density === value);
}

/** Tabs do not count: two tabs of one pane each show the single-pane density. */
export function resolveChatDensity(settings: PaneDensitySettings, paneCount: number): ChatDensity {
  return paneCount >= 2 ? settings.splitPaneDensity : settings.chatDensity;
}

/** A stored value that is not a density falls back to the default of its own setting. */
export function sanitizePaneDensitySettings(stored: unknown): PaneDensitySettings {
  const read = (key: keyof PaneDensitySettings) => {
    const value = typeof stored === "object" && stored !== null ? Reflect.get(stored, key) : null;
    return isChatDensity(value) ? value : DEFAULT_PANE_DENSITY_SETTINGS[key];
  };
  return { chatDensity: read("chatDensity"), splitPaneDensity: read("splitPaneDensity") };
}

export interface PaneDensityStoreState extends PaneDensitySettings {
  setDensity: (key: keyof PaneDensitySettings, density: ChatDensity) => void;
}

/** The storage is a parameter so a test can open a second store on the same stored value. */
export function createPaneDensityStore(storage: StateStorage) {
  return create<PaneDensityStoreState>()(
    persist(
      (set) => ({
        ...DEFAULT_PANE_DENSITY_SETTINGS,
        setDensity: (key, density) => {
          set((state) => (state[key] === density ? state : { [key]: density }));
        },
      }),
      {
        name: PANE_DENSITY_STORAGE_KEY,
        version: PANE_DENSITY_STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ chatDensity, splitPaneDensity }) => ({ chatDensity, splitPaneDensity }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...sanitizePaneDensitySettings(persistedState),
        }),
      },
    ),
  );
}

export const usePaneDensityStore = createPaneDensityStore(
  resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
);
followOtherWindows(usePaneDensityStore);

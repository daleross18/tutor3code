import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "../lib/storage";
import { followOtherWindows } from "./forkStorageSync";

export interface PaneThreadSettings {
  /**
   * With two or more panes or tabs, a pane whose thread settles after its pull request merged
   * shows its own new thread. Stock settles the thread (`sidebarAutoSettleOnMerge`).
   */
  readonly releasePaneOnMergeSettle: boolean;
  /**
   * A preview URL template for each repository, by the canonical key of the repository. A
   * repository with no template shows no preview link.
   */
  readonly previewUrlTemplates: Readonly<Record<string, string>>;
}

export const DEFAULT_PANE_THREAD_SETTINGS: PaneThreadSettings = {
  releasePaneOnMergeSettle: true,
  previewUrlTemplates: {},
};

// A stock server knows neither value, and the stock client settings are decoded with a strict
// schema on the desktop side, so both stay in the fork's own browser storage.
export const PANE_THREAD_STORAGE_KEY = "t3code-fork:thread:v1";
const PANE_THREAD_STORAGE_VERSION = 1;

function readField(stored: unknown, key: keyof PaneThreadSettings): unknown {
  return typeof stored === "object" && stored !== null ? Reflect.get(stored, key) : undefined;
}

/** A stored value of the wrong type falls back to the default of its own field. */
export function sanitizePaneThreadSettings(stored: unknown): PaneThreadSettings {
  const release = readField(stored, "releasePaneOnMergeSettle");
  const templates = readField(stored, "previewUrlTemplates");
  return {
    releasePaneOnMergeSettle:
      typeof release === "boolean"
        ? release
        : DEFAULT_PANE_THREAD_SETTINGS.releasePaneOnMergeSettle,
    previewUrlTemplates:
      typeof templates === "object" && templates !== null
        ? Object.fromEntries(
            Object.entries(templates).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string" && entry[1].trim() !== "",
            ),
          )
        : {},
  };
}

export interface PaneThreadStoreState extends PaneThreadSettings {
  setReleasePaneOnMergeSettle: (enabled: boolean) => void;
  /** An empty template removes the entry of the repository. */
  setPreviewUrlTemplate: (repositoryKey: string, template: string) => void;
}

/** The storage is a parameter so a test can open a second store on the same stored value. */
export function createPaneThreadStore(storage: StateStorage) {
  return create<PaneThreadStoreState>()(
    persist(
      (set) => ({
        ...DEFAULT_PANE_THREAD_SETTINGS,
        setReleasePaneOnMergeSettle: (enabled) => {
          set((state) =>
            state.releasePaneOnMergeSettle === enabled
              ? state
              : { releasePaneOnMergeSettle: enabled },
          );
        },
        setPreviewUrlTemplate: (repositoryKey, template) => {
          set((state) => {
            const next = template.trim();
            if ((state.previewUrlTemplates[repositoryKey] ?? "") === next) return state;
            const { [repositoryKey]: _removed, ...rest } = state.previewUrlTemplates;
            return {
              previewUrlTemplates: next === "" ? rest : { ...rest, [repositoryKey]: next },
            };
          });
        },
      }),
      {
        name: PANE_THREAD_STORAGE_KEY,
        version: PANE_THREAD_STORAGE_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: ({ releasePaneOnMergeSettle, previewUrlTemplates }) => ({
          releasePaneOnMergeSettle,
          previewUrlTemplates,
        }),
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...sanitizePaneThreadSettings(persistedState),
        }),
      },
    ),
  );
}

export const usePaneThreadStore = createPaneThreadStore(
  resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
);
followOtherWindows(usePaneThreadStore);

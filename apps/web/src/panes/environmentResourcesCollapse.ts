import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";
import { followOtherWindows } from "./forkStorageSync";

// Not a setting: the header of the readout writes it, so it has a key of its own.
const RESOURCES_COLLAPSE_STORAGE_KEY = "t3code-fork:resources-collapsed:v1";

interface ResourcesCollapseState {
  readonly collapsed: boolean;
  toggle: () => void;
}

/** True when the user closed the readout of the sidebar footer. A closed readout asks nothing. */
export const useResourcesCollapseStore = create<ResourcesCollapseState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    {
      name: RESOURCES_COLLAPSE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ collapsed }) => ({ collapsed }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        collapsed:
          typeof persistedState === "object" &&
          persistedState !== null &&
          Reflect.get(persistedState, "collapsed") === true,
      }),
    },
  ),
);
followOtherWindows(useResourcesCollapseStore);

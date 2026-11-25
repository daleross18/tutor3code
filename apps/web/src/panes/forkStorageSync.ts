interface PersistedStore {
  readonly persist: {
    readonly getOptions: () => { readonly name?: string };
    readonly rehydrate: () => Promise<void> | void;
  };
}

interface StorageEventSource {
  readonly addEventListener: (
    type: "storage",
    listener: (event: Pick<StorageEvent, "key">) => void,
  ) => void;
}

/**
 * Reads a fork setting again when another window of the client writes its key. Each write holds
 * every field of the key, so a window with an old copy would put the old settings back.
 */
export function followOtherWindows(
  store: PersistedStore,
  source: StorageEventSource | undefined = typeof window === "undefined" ? undefined : window,
): void {
  source?.addEventListener("storage", (event) => {
    // A null key is a clear of the whole storage.
    if (event.key === null || event.key === store.persist.getOptions().name) {
      void store.persist.rehydrate();
    }
  });
}

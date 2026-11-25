import { describe, expect, it } from "vite-plus/test";

import { createMemoryStorage } from "../lib/storage";
import {
  ARCADE_SCORES_STORAGE_KEY,
  ARCADE_SETTINGS_STORAGE_KEY,
  createArcadeSettingsStore,
  readBestScores,
  useArcadeSettingsStore,
  writeBestScore,
} from "./arcadeStore";

describe("arcadeStore", () => {
  it("is off by default, and restores the switch in a new store on the same storage", () => {
    expect(useArcadeSettingsStore.getState().showArcade).toBe(false);
    const storage = createMemoryStorage();
    createArcadeSettingsStore(storage).getState().setShowArcade(true);
    expect(JSON.parse(storage.getItem(ARCADE_SETTINGS_STORAGE_KEY) as string).state).toEqual({
      showArcade: true,
    });
    expect(createArcadeSettingsStore(storage).getState().showArcade).toBe(true);
  });

  it("keeps the best score of each game in a key of its own, and reads 0 for a value that is no score", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    expect(readBestScores(storage)).toEqual({ snake: 0, shooter: 0, runner: 0 });
    writeBestScore(storage, "snake", 12);
    writeBestScore(storage, "runner", 40);
    expect(storage.getItem(ARCADE_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(readBestScores(storage)).toEqual({ snake: 12, shooter: 0, runner: 40 });
    for (const stored of ["not json", '{"snake":"12"}', '{"snake":-3}', "[]"]) {
      storage.setItem(ARCADE_SCORES_STORAGE_KEY, stored);
      expect(readBestScores(storage).snake).toBe(0);
    }
    expect(readBestScores(undefined)).toEqual({ snake: 0, shooter: 0, runner: 0 });
  });
});

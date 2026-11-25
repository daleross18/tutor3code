import { describe, expect, it } from "vite-plus/test";

import { searchSettings } from "../components/settings/settingsSearch";
import { createMemoryStorage } from "../lib/storage";
import {
  DEFAULT_PANE_DENSITY_SETTINGS,
  PANE_DENSITY_STORAGE_KEY,
  createPaneDensityStore,
  resolveChatDensity,
  sanitizePaneDensitySettings,
  usePaneDensityStore,
} from "./paneDensity";

describe("paneDensity", () => {
  it("defaults to the stock look for one pane and to Compact for a split", () => {
    expect(DEFAULT_PANE_DENSITY_SETTINGS).toEqual({
      chatDensity: "normal",
      splitPaneDensity: "compact",
    });
    expect(usePaneDensityStore.getState()).toMatchObject(DEFAULT_PANE_DENSITY_SETTINGS);
    expect(usePaneDensityStore.persist.getOptions()).toMatchObject({
      name: "t3code-fork:density:v1",
      version: 1,
    });
  });

  it("resolves the density from the pane count of the active tab", () => {
    const settings = { chatDensity: "very-compact", splitPaneDensity: "normal" } as const;
    expect(resolveChatDensity(settings, 1)).toBe("very-compact");
    expect(resolveChatDensity(settings, 2)).toBe("normal");
    expect(resolveChatDensity(settings, 12)).toBe("normal");
    expect(resolveChatDensity(DEFAULT_PANE_DENSITY_SETTINGS, 1)).toBe("normal");
    expect(resolveChatDensity(DEFAULT_PANE_DENSITY_SETTINGS, 2)).toBe("compact");
  });

  it("restores both values in a new store on the same storage", () => {
    const storage = createMemoryStorage();
    const written = createPaneDensityStore(storage);
    written.getState().setDensity("chatDensity", "compact");
    written.getState().setDensity("splitPaneDensity", "very-compact");
    expect(JSON.parse(storage.getItem(PANE_DENSITY_STORAGE_KEY) as string).state).toEqual({
      chatDensity: "compact",
      splitPaneDensity: "very-compact",
    });

    const restored = createPaneDensityStore(storage).getState();
    expect(restored.chatDensity).toBe("compact");
    expect(restored.splitPaneDensity).toBe("very-compact");
  });

  it.each([
    ["nothing stored", null, DEFAULT_PANE_DENSITY_SETTINGS],
    ["a value that is not an object", "compact", DEFAULT_PANE_DENSITY_SETTINGS],
    [
      "an unknown density in one setting",
      { chatDensity: "tiny", splitPaneDensity: "normal" },
      { chatDensity: "normal", splitPaneDensity: "normal" },
    ],
    [
      "one missing setting",
      { chatDensity: "very-compact" },
      { chatDensity: "very-compact", splitPaneDensity: "compact" },
    ],
  ])("falls back to the default of each setting for %s", (_name, stored, expected) => {
    expect(sanitizePaneDensitySettings(stored)).toEqual(expected);
  });

  it("is found by the settings search, on the Appearance page", () => {
    expect(searchSettings("chat density")[0]).toMatchObject({
      id: "chat-density",
      to: "/settings/appearance",
    });
    expect(searchSettings("split pane density")[0]).toMatchObject({
      id: "split-pane-density",
      to: "/settings/appearance",
    });
  });
});

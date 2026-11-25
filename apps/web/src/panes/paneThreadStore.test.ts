import { describe, expect, it } from "vite-plus/test";

import { searchSettings } from "../components/settings/settingsSearch";
import { createMemoryStorage } from "../lib/storage";
import { followOtherWindows } from "./forkStorageSync";
import {
  PANE_ARMED_THREADS_STORAGE_KEY,
  createPaneArmedThreadStore,
  sanitizeArmedThreadKeys,
  usePaneArmedThreadStore,
} from "./paneArmedThreadStore";
import {
  DEFAULT_PANE_THREAD_SETTINGS,
  PANE_THREAD_STORAGE_KEY,
  createPaneThreadStore,
  sanitizePaneThreadSettings,
  usePaneThreadStore,
} from "./paneThreadStore";

const TUTOR_KEY = "github.com/tutorintelligence/codebase";
const TUTOR_TEMPLATE = "https://{slug}.preview.tutorintelligence.com";

describe("paneThreadStore", () => {
  it("frees panes by default, and gives no repository a preview link", () => {
    expect(DEFAULT_PANE_THREAD_SETTINGS).toEqual({
      releasePaneOnMergeSettle: true,
      previewUrlTemplates: {},
    });
    expect(usePaneThreadStore.getState()).toMatchObject(DEFAULT_PANE_THREAD_SETTINGS);
    expect(usePaneThreadStore.persist.getOptions()).toMatchObject({
      name: "t3code-fork:thread:v1",
      version: 1,
    });
  });

  it("restores the settings and the armed threads in new stores on the same storage, each under its own key", () => {
    const storage = createMemoryStorage();
    const written = createPaneThreadStore(storage);
    written.getState().setReleasePaneOnMergeSettle(false);
    written.getState().setPreviewUrlTemplate(TUTOR_KEY, ` ${TUTOR_TEMPLATE} `);
    createPaneArmedThreadStore(storage).getState().setThreadArmed("env:thread-a", true);
    expect(JSON.parse(storage.getItem(PANE_THREAD_STORAGE_KEY) as string).state).toEqual({
      releasePaneOnMergeSettle: false,
      previewUrlTemplates: { [TUTOR_KEY]: TUTOR_TEMPLATE },
    });
    expect(JSON.parse(storage.getItem(PANE_ARMED_THREADS_STORAGE_KEY) as string).state).toEqual({
      armedThreadKeys: ["env:thread-a"],
    });
    expect(usePaneArmedThreadStore.persist.getOptions().name).toBe("t3code-fork:armed-threads:v1");

    const restored = createPaneThreadStore(storage).getState();
    expect(restored.releasePaneOnMergeSettle).toBe(false);
    expect(restored.previewUrlTemplates).toEqual({ [TUTOR_KEY]: TUTOR_TEMPLATE });
    expect(createPaneArmedThreadStore(storage).getState().armedThreadKeys).toEqual([
      "env:thread-a",
    ]);
  });

  it("keeps a setting that another window changed, when this window writes next", () => {
    // Two stores on one storage stand for two windows of the client.
    const storage = createMemoryStorage();
    const settingsWindow = createPaneThreadStore(storage);
    const chatWindow = createPaneThreadStore(storage);
    const chatArmed = createPaneArmedThreadStore(storage);
    const storageEvents: Array<(event: { key: string | null }) => void> = [];
    followOtherWindows(chatWindow, {
      addEventListener: (_type, listener) => storageEvents.push(listener),
    });

    settingsWindow.getState().setReleasePaneOnMergeSettle(false);
    settingsWindow.getState().setPreviewUrlTemplate(TUTOR_KEY, TUTOR_TEMPLATE);
    // The settle watch of the chat window writes by itself: that write holds no setting.
    chatArmed.getState().setThreadArmed("env:thread-a", true);
    expect(createPaneThreadStore(storage).getState().releasePaneOnMergeSettle).toBe(false);

    // The browser tells the chat window of the change, and it reads the key again.
    for (const listener of storageEvents) listener({ key: "some-other-key" });
    expect(chatWindow.getState().releasePaneOnMergeSettle).toBe(true);
    for (const listener of storageEvents) listener({ key: PANE_THREAD_STORAGE_KEY });
    expect(chatWindow.getState().releasePaneOnMergeSettle).toBe(false);
    // A later write of the chat window keeps the values of the settings window.
    chatWindow.getState().setPreviewUrlTemplate("github.com/other/repo", TUTOR_TEMPLATE);
    expect(JSON.parse(storage.getItem(PANE_THREAD_STORAGE_KEY) as string).state).toEqual({
      releasePaneOnMergeSettle: false,
      previewUrlTemplates: { [TUTOR_KEY]: TUTOR_TEMPLATE, "github.com/other/repo": TUTOR_TEMPLATE },
    });
  });

  it("removes the entry of a repository whose template is emptied", () => {
    const store = createPaneThreadStore(createMemoryStorage());
    store.getState().setPreviewUrlTemplate(TUTOR_KEY, TUTOR_TEMPLATE);
    store.getState().setPreviewUrlTemplate("github.com/other/repo", "https://{slug}.example.com");
    store.getState().setPreviewUrlTemplate(TUTOR_KEY, "  ");
    expect(store.getState().previewUrlTemplates).toEqual({
      "github.com/other/repo": "https://{slug}.example.com",
    });
  });

  it("arms a thread one time and keeps only the armed threads that are still shown", () => {
    const store = createPaneArmedThreadStore(createMemoryStorage());
    store.getState().setThreadArmed("a", true);
    store.getState().setThreadArmed("a", true);
    store.getState().setThreadArmed("b", true);
    store.getState().setThreadArmed("c", true);
    store.getState().setThreadArmed("b", false);
    expect(store.getState().armedThreadKeys).toEqual(["a", "c"]);
    store.getState().retainArmedThreads((threadKey) => threadKey === "c");
    expect(store.getState().armedThreadKeys).toEqual(["c"]);
  });

  it.each([
    ["nothing stored", null, DEFAULT_PANE_THREAD_SETTINGS, []],
    ["a value that is not an object", "on", DEFAULT_PANE_THREAD_SETTINGS, []],
    [
      "values of the wrong type",
      { releasePaneOnMergeSettle: "no", previewUrlTemplates: [], armedThreadKeys: "a" },
      { releasePaneOnMergeSettle: true, previewUrlTemplates: {} },
      [],
    ],
    [
      "entries of the wrong type",
      {
        releasePaneOnMergeSettle: false,
        previewUrlTemplates: { [TUTOR_KEY]: TUTOR_TEMPLATE, empty: " ", number: 4 },
        armedThreadKeys: ["a", 7, null],
      },
      { releasePaneOnMergeSettle: false, previewUrlTemplates: { [TUTOR_KEY]: TUTOR_TEMPLATE } },
      ["a"],
    ],
  ])("falls back to the default of each field for %s", (_name, stored, settings, armed) => {
    expect(sanitizePaneThreadSettings(stored)).toEqual(settings);
    expect(sanitizeArmedThreadKeys(stored)).toEqual(armed);
  });

  it("is found by the settings search, on the Appearance page", () => {
    expect(searchSettings("free a pane when its thread settles")[0]).toMatchObject({
      id: "release-pane-on-settle",
      to: "/settings/appearance",
    });
    expect(searchSettings("preview links")[0]).toMatchObject({
      id: "preview-url-template",
      to: "/settings/appearance",
    });
  });
});

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { settleWatchStep, watchedThreads } from "./paneSettleWatch";
import {
  addTab,
  createBrowserLeaf,
  createInitialLayout,
  createTab,
  createTabOfLeaf,
  getActiveTab,
  listLeaves,
  replaceTab,
  setLeafTarget,
  splitLeaf,
} from "./paneTree";

const ENVIRONMENT_ID = EnvironmentId.make("environment-settle");
const targetOf = (name: string) =>
  ({ kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, ThreadId.make(name)) }) as const;

describe("settleWatchStep", () => {
  it.each([
    ["a thread that is not loaded changes nothing", false, null, false, false],
    ["a thread that is not loaded stays armed", true, null, true, false],
    ["an open thread is armed", false, { settled: false, merged: false }, true, false],
    [
      "an open thread with a merged pull request stays",
      true,
      { settled: false, merged: true },
      true,
      false,
    ],
    [
      "a thread that settles after its merge frees its panes",
      true,
      { settled: true, merged: true },
      false,
      true,
    ],
    [
      "a thread that settles with no merge keeps its panes",
      true,
      { settled: true, merged: false },
      true,
      false,
    ],
    [
      "a thread opened when it was settled keeps its pane",
      false,
      { settled: true, merged: true },
      false,
      false,
    ],
  ] as const)("%s", (_name, armed, observed, nextArmed, release) => {
    expect(settleWatchStep(armed, observed)).toEqual({ armed: nextArmed, release });
  });

  it("frees the panes of a thread whose merge is seen after the settle", () => {
    const settledFirst = settleWatchStep(true, { settled: true, merged: false });
    expect(settleWatchStep(settledFirst.armed, { settled: true, merged: true })).toEqual({
      armed: false,
      release: true,
    });
  });
});

describe("watchedThreads", () => {
  it("lists each server thread of every tab one time, and no draft or empty pane", () => {
    const layout = createInitialLayout(targetOf("thread-a"));
    let tab = getActiveTab(layout);
    const first = tab.focusedPaneId;
    tab = splitLeaf(tab, first, "right");
    const second = listLeaves(tab.root).find((leaf) => leaf.id !== first)!;
    tab = setLeafTarget(tab, second.id, { kind: "draft", draftId: "draft-1" as never });
    tab = splitLeaf(tab, first, "down");
    const withTabs = addTab(
      addTab(replaceTab(layout, tab), createTab(targetOf("thread-b"))),
      createTab(targetOf("thread-a")),
    );
    expect(watchedThreads(true, withTabs).map((ref) => ref.threadId)).toEqual([
      "thread-a",
      "thread-b",
    ]);
    expect(watchedThreads(false, withTabs)).toEqual([]);
  });

  it("does not watch a thread that only a browser pane shows", () => {
    const layout = addTab(
      createInitialLayout(targetOf("thread-a")),
      createTabOfLeaf(createBrowserLeaf(targetOf("thread-b").threadRef)),
    );
    expect(watchedThreads(true, layout).map((ref) => ref.threadId)).toEqual(["thread-a"]);
  });

  it("watches no thread of one tab with one pane, which stays stock", () => {
    const single = createInitialLayout(targetOf("thread-a"));
    expect(watchedThreads(true, single)).toEqual([]);
    const twoTabs = addTab(single, createTab(targetOf("thread-b")));
    expect(watchedThreads(true, twoTabs)).toHaveLength(2);
  });
});

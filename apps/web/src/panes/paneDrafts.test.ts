import {
  scopeProjectRef,
  scopedProjectKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";

import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import { createNewThreadHandler } from "../hooks/useHandleNewThread";
import type { ThreadRouteTarget } from "../threadRoutes";
import {
  fillEmptyPane,
  rememberPaneProject,
  replacePaneThread,
  runPaneCommand,
  startNewThreadInPane,
} from "./paneActions";
import { installPaneDraftSync } from "./paneDrafts";
import { literalKey } from "./paneRouteSync";
import { usePaneStore } from "./paneStore";
import { createInitialLayout, getActiveTab, listLeaves } from "./paneTree";

// The stock new-thread flow runs for real against the real draft store. Only the project lookup
// is replaced: this test has no environment, so no project is loaded.
vi.mock(import("../state/entities"), async (importOriginal) => ({
  ...(await importOriginal()),
  readProject: () => ({}) as never,
}));

const PROJECT = scopeProjectRef("env-1" as EnvironmentId, ProjectId.make("project-1"));
const PROJECT_KEY = scopedProjectKey(PROJECT);

const drafts = () => useComposerDraftStore.getState();
const activeLeaves = () => listLeaves(getActiveTab(usePaneStore.getState().layout).root);
const allTargets = () =>
  usePaneStore
    .getState()
    .layout.tabs.flatMap((tab) => listLeaves(tab.root).map((leaf) => leaf.target));
const draftIdOf = (target: ThreadRouteTarget | null) => {
  if (target?.kind !== "draft") throw new Error("The pane does not show a draft.");
  return target.draftId;
};
const filled = () =>
  expect(
    usePaneStore.getState().fillingPaneIds.length +
      allTargets().filter((target) => target === null).length,
  ).toBe(0);

function routerAt(target: ThreadRouteTarget | null) {
  const navigate = vi.fn(() => Promise.resolve());
  const params = target?.kind === "draft" ? { draftId: target.draftId } : {};
  const router = {
    state: { matches: [{ params }], location: { href: "start" } },
    navigate,
  } as unknown as AnyRouter;
  return { router, navigate };
}

/** One pane that shows the project's stock draft, as the app does after a launch. */
async function setup() {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  const opened = await createNewThreadHandler(routerAt(null).router)(PROJECT);
  if (opened === null) throw new Error("The stock flow opened no draft.");
  const target: ThreadRouteTarget = { kind: "draft", draftId: opened.draftId };
  usePaneStore.setState({
    layout: createInitialLayout(target),
    lastRouteKey: literalKey(target),
    fillingPaneIds: [],
  });
  return { ...routerAt(target), firstDraftId: opened.draftId };
}

describe("pane drafts", () => {
  it("gives each new pane and each new tab its own draft, and never resets a shown draft", async () => {
    const { router, navigate, firstDraftId } = await setup();
    using _sync = { [Symbol.dispose]: installPaneDraftSync() };
    // One tab with one pane keeps the stock rule: the draft is the project's reusable draft.
    expect(drafts().getDraftSessionByLogicalProjectKey(PROJECT_KEY)?.draftId).toBe(firstDraftId);
    drafts().setDraftThreadContext(firstDraftId, { branch: "feature", envMode: "worktree" });

    runPaneCommand(router, "layout.splitRight");
    await vi.waitFor(filled);
    runPaneCommand(router, "layout.splitDown");
    await vi.waitFor(filled);
    // Two tabs asked for at the same time must not share the draft that the first one made.
    runPaneCommand(router, "layout.newTab");
    runPaneCommand(router, "layout.newTab");
    await vi.waitFor(filled);

    const draftIds = allTargets().map(draftIdOf);
    expect(draftIds).toHaveLength(5);
    expect(new Set(draftIds).size).toBe(5);
    expect(draftIds[0]).toBe(firstDraftId);
    for (const draftId of draftIds) {
      expect(drafts().getDraftSession(draftId)).toMatchObject({
        environmentId: PROJECT.environmentId,
        projectId: PROJECT.projectId,
      });
    }
    // The first draft kept the branch that the user picked in it.
    expect(drafts().getDraftSession(firstDraftId)).toMatchObject({
      branch: "feature",
      envMode: "worktree",
    });
    expect(drafts().getDraftSession(draftIds[1]!)).toMatchObject({ branch: null });

    drafts().setPrompt(draftIds[1]!, "only here");
    expect(draftIds.map((draftId) => drafts().getComposerDraft(draftId)?.prompt ?? "")).toEqual([
      "",
      "only here",
      "",
      "",
      "",
    ]);
    // The URL follows the focused pane: the last new tab.
    expect(navigate).toHaveBeenLastCalledWith({
      to: "/draft/$draftId",
      params: { draftId: draftIds[4] },
      replace: true,
    });
  });

  it("keeps each pane's draft across a restart, and drops the empty draft of a closed pane", async () => {
    const { router, firstDraftId } = await setup();
    using _sync = { [Symbol.dispose]: installPaneDraftSync() };
    runPaneCommand(router, "layout.splitRight");
    await vi.waitFor(filled);
    runPaneCommand(router, "layout.splitRight");
    await vi.waitFor(filled);
    const [, second, third] = activeLeaves().map((leaf) => draftIdOf(leaf.target));
    // Stock saves a draft session only while a key maps to it.
    const mappedDraftIds = () =>
      Object.values(drafts().logicalProjectDraftThreadKeyByLogicalProjectKey);
    expect(mappedDraftIds()).toEqual(expect.arrayContaining([second, third]));

    drafts().setPrompt(second!, "keep me");
    drafts().setDraftThreadContext(firstDraftId, { branch: "feature", envMode: "worktree" });
    usePaneStore.getState().closePane(activeLeaves()[2]!.id);
    usePaneStore.getState().closePane(activeLeaves()[1]!.id);
    expect(drafts().getDraftSession(third!)).toBeNull();
    expect(drafts().getComposerDraft(second!)?.prompt).toBe("keep me");
    // One pane again: the stock new-thread action reuses the shown draft and keeps its branch.
    expect(drafts().getDraftSessionByLogicalProjectKey(PROJECT_KEY)?.draftId).toBe(firstDraftId);
    const reopened = await createNewThreadHandler(router)(PROJECT);
    expect(reopened?.draftId).toBe(firstDraftId);
    expect(drafts().getDraftSession(firstDraftId)).toMatchObject({ branch: "feature" });
  });

  it("leaves a pane alone that closed while its draft was prepared", async () => {
    const { router, navigate, firstDraftId } = await setup();
    using _sync = { [Symbol.dispose]: installPaneDraftSync() };
    runPaneCommand(router, "layout.splitRight");
    runPaneCommand(router, "layout.closePaneNow");
    await vi.waitFor(() => expect(usePaneStore.getState().fillingPaneIds).toEqual([]));
    expect(allTargets()).toEqual([{ kind: "draft", draftId: firstDraftId }]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("gives a pane whose thread went away its own draft, and keeps the other panes", async () => {
    const { router, navigate, firstDraftId } = await setup();
    using _sync = { [Symbol.dispose]: installPaneDraftSync() };
    const gone: ThreadRouteTarget = {
      kind: "server",
      threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("gone")),
    };
    const store = usePaneStore.getState();
    const firstPaneId = activeLeaves()[0]!.id;
    store.splitPane(firstPaneId, "right");
    const passivePaneId = activeLeaves()[1]!.id;
    store.setPaneTarget(passivePaneId, gone);
    store.focusPane(firstPaneId);
    // The pane cell records the project of the thread it shows.
    rememberPaneProject(passivePaneId, PROJECT);

    replacePaneThread(router, passivePaneId);
    await vi.waitFor(filled);
    const [first, replaced] = activeLeaves();
    expect(first!.target).toEqual({ kind: "draft", draftId: firstDraftId });
    expect(draftIdOf(replaced!.target)).not.toBe(firstDraftId as DraftId);
    expect(replaced!.id).toBe(passivePaneId);
    expect(getActiveTab(usePaneStore.getState().layout).focusedPaneId).toBe(firstPaneId);
    // The pane does not own the URL, so the URL stays on the focused pane's thread.
    expect(navigate).not.toHaveBeenCalled();
  });
  /** A server thread in the one pane, and the project's launch draft that no pane shows. */
  async function setupWithUnshownDraft() {
    const { router, navigate, firstDraftId } = await setup();
    const shown: ThreadRouteTarget = {
      kind: "server",
      threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("shown")),
    };
    usePaneStore.setState({ layout: createInitialLayout(shown), lastRouteKey: literalKey(shown) });
    const firstPaneId = activeLeaves()[0]!.id;
    rememberPaneProject(firstPaneId, PROJECT);
    return { router, navigate, shown, firstPaneId, launchDraftId: firstDraftId };
  }

  it("gives two panes that fill at the same time their own drafts, with an unshown project draft", async () => {
    // Stock picks the unshown launch draft for both fills before either one shows it.
    const { router, shown, launchDraftId } = await setupWithUnshownDraft();
    using _sync = { [Symbol.dispose]: installPaneDraftSync() };
    runPaneCommand(router, "layout.splitRight");
    runPaneCommand(router, "layout.splitRight");
    await vi.waitFor(filled);
    const [first, second, third] = activeLeaves().map((leaf) => leaf.target);
    expect(first).toEqual(shown);
    expect(draftIdOf(second!)).not.toBe(draftIdOf(third!));
    expect([draftIdOf(second!), draftIdOf(third!)]).toContain(launchDraftId);
  });

  it("fills a pane that a stored layout left empty, one time", async () => {
    const { router, shown, firstPaneId } = await setupWithUnshownDraft();
    using _sync = { [Symbol.dispose]: installPaneDraftSync() };
    usePaneStore.getState().splitPane(firstPaneId, "right");
    const emptyPaneId = activeLeaves()[1]!.id;
    rememberPaneProject(emptyPaneId, PROJECT);
    fillEmptyPane(router, emptyPaneId);
    // The pane already waits for its draft, so a second request starts no second draft.
    fillEmptyPane(router, emptyPaneId);
    await vi.waitFor(filled);
    expect(activeLeaves()[0]!.target).toEqual(shown);
    draftIdOf(activeLeaves()[1]!.target);
    expect(Object.keys(drafts().draftThreadsByThreadKey)).toHaveLength(1);
  });

  it("opens the new thread of a pane without focus in that pane, not through the URL", async () => {
    const { router, navigate, shown, firstPaneId } = await setupWithUnshownDraft();
    using _sync = { [Symbol.dispose]: installPaneDraftSync() };
    const other: ThreadRouteTarget = {
      kind: "server",
      threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("other")),
    };
    const store = usePaneStore.getState();
    store.splitPane(firstPaneId, "right");
    const focusedPaneId = activeLeaves()[1]!.id;
    store.setPaneTarget(focusedPaneId, other);

    // What "send and new thread" asks for after the user moved to the other pane.
    const opened = await startNewThreadInPane(router, firstPaneId, PROJECT);
    const [replaced, focused] = activeLeaves();
    expect(replaced!.target).toEqual({ kind: "draft", draftId: opened?.draftId });
    expect(replaced!.target).not.toEqual(shown);
    expect(focused!.target).toEqual(other);
    expect(getActiveTab(usePaneStore.getState().layout).focusedPaneId).toBe(focusedPaneId);
    expect(navigate).not.toHaveBeenCalled();
  });
});

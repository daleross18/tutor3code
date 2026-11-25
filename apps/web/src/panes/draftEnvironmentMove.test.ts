import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
  type ServerSettings,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vite-plus/test";

import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import { moveDraftToProject } from "./draftEnvironmentMove";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

const MAC = EnvironmentId.make("mac");
const BOX = EnvironmentId.make("dale-nix");
const MAC_PROJECT = { environmentId: MAC, id: ProjectId.make("mac-codebase") };
const BOX_PROJECT = { environmentId: BOX, id: ProjectId.make("box-codebase") };
const DRAFT_ID = "draft-1" as DraftId;
const FABLE = "claude-fable-5";

// What the client holds of each environment. The stock model seed and the fork's account rule
// read the accounts and the settings of the environment that the draft moves to.
const client = vi.hoisted(() => ({
  configs: new Map<string, { providers: ReadonlyArray<unknown>; settings: unknown }>(),
}));
vi.mock("../rpc/atomRegistry", () => ({
  appAtomRegistry: { get: () => client.configs },
}));
vi.mock("../state/server", () => ({ environmentServerConfigsAtom: {} }));
vi.mock("../state/entities", () => ({ readProject: () => null }));
vi.mock("../state/environments", () => ({
  readEnvironment: (environmentId: string) => {
    const config = client.configs.get(environmentId);
    return config ? { serverConfig: { settings: config.settings } } : null;
  },
  readEnvironmentProviders: (environmentId: string) => client.configs.get(environmentId)?.providers,
}));

const decodeProvider = Schema.decodeUnknownSync(ServerProvider);

/** A Claude account with `usedPercent` of its 5-hour window used. */
function account(instanceId: string, usedPercent: number) {
  return decodeProvider({
    instanceId,
    driver: "claudeAgent",
    enabled: true,
    installed: true,
    version: "2.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-11-19T11:59:00.000Z",
    models: [{ slug: FABLE, name: "Fable", isCustom: false, capabilities: null }],
    usageLimits: {
      checkedAt: "2026-11-19T11:59:00.000Z",
      windows: [
        {
          id: "five_hour",
          kind: "session",
          label: "Session",
          usedPercent,
          resetsAt: "2099-01-01T00:00:00.000Z",
        },
      ],
    },
  });
}

function settingsFor(instanceIds: ReadonlyArray<string>): ServerSettings {
  const instance = { driver: ProviderDriverKind.make("claudeAgent"), enabled: true };
  return {
    ...DEFAULT_SERVER_SETTINGS,
    providerInstances: Object.fromEntries(
      instanceIds.map((id) => [ProviderInstanceId.make(id), instance]),
    ),
  };
}

/** A draft in the Mac project, on a branch, under the stock "Auto balance". */
function setup() {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
    stickyModelSelectionByProvider: {},
    stickyActiveProvider: null,
  });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  client.configs.clear();
  client.configs.set(MAC, {
    providers: [account("mac-claude", 10)],
    settings: settingsFor(["mac-claude"]),
  });
  client.configs.set(BOX, {
    providers: [account("box-claude", 90), account("box-claude2", 20)],
    settings: settingsFor(["box-claude", "box-claude2"]),
  });
  useComposerDraftStore
    .getState()
    .setLogicalProjectDraftThreadId(
      "repo:codebase",
      { environmentId: MAC, projectId: MAC_PROJECT.id },
      DRAFT_ID,
      {
        threadId: ThreadId.make("thread-1"),
        branch: "feature",
        worktreePath: "/mac/worktree",
        environmentSelection: "auto",
        loadBalancedEnvironmentId: MAC,
      },
    );
  return useComposerDraftStore.getState();
}

describe("moveDraftToProject", () => {
  it("moves a draft with text: the text stays, the branch goes, and the model is of the new environment", async () => {
    const store = setup();
    store.setPrompt(DRAFT_ID, "fix the pick planner");
    const openProjectDraft = vi.fn();
    await moveDraftToProject({
      draftId: DRAFT_ID,
      project: BOX_PROJECT,
      logicalProjectKey: "repo:codebase",
      openProjectDraft,
    });

    expect(openProjectDraft).not.toHaveBeenCalled();
    expect(store.getDraftSession(DRAFT_ID)).toMatchObject({
      threadId: "thread-1",
      environmentId: BOX,
      projectId: BOX_PROJECT.id,
      logicalProjectKey: "repo:codebase",
      branch: null,
      worktreePath: null,
      // The stock "Auto balance" must not move the draft away again.
      environmentSelection: "manual",
      loadBalancedEnvironmentId: null,
    });
    const draft = useComposerDraftStore.getState().getComposerDraft(DRAFT_ID);
    expect(draft?.prompt).toBe("fix the pick planner");
    // The fork's account rule ran for the new environment: its account with the most quota left.
    expect(
      draft?.activeProvider && draft.modelSelectionByProvider[draft.activeProvider],
    ).toMatchObject({ instanceId: "box-claude2", model: FABLE });
  });

  it("sets no account with the account setting off, as stock does for this environment", async () => {
    const store = setup();
    useReadoutSettingsStore.setState({ newThreadsUseMostQuota: false });
    store.setPrompt(DRAFT_ID, "fix the pick planner");
    await moveDraftToProject({
      draftId: DRAFT_ID,
      project: BOX_PROJECT,
      logicalProjectKey: "repo:codebase",
      openProjectDraft: vi.fn(),
    });
    const draft = useComposerDraftStore.getState().getComposerDraft(DRAFT_ID);
    expect(draft?.prompt).toBe("fix the pick planner");
    expect(draft?.activeProvider ?? null).toBeNull();
  });

  it("opens the stock draft of the project for an empty draft, and marks that draft as chosen", async () => {
    const store = setup();
    const opened = "draft-2" as DraftId;
    const openProjectDraft = vi.fn(async () => {
      // A key of its own, as the draft of a pane has.
      store.setLogicalProjectDraftThreadId(
        "fork-pane-draft/draft-2",
        { environmentId: BOX, projectId: BOX_PROJECT.id },
        opened,
        { threadId: ThreadId.make("thread-2") },
      );
      return { draftId: opened, threadId: ThreadId.make("thread-2") };
    });
    await moveDraftToProject({
      draftId: DRAFT_ID,
      project: BOX_PROJECT,
      logicalProjectKey: "repo:codebase",
      openProjectDraft,
    });

    expect(openProjectDraft).toHaveBeenCalledWith({
      environmentId: BOX,
      projectId: BOX_PROJECT.id,
    });
    expect(store.getDraftSession(opened)).toMatchObject({
      environmentId: BOX,
      environmentSelection: "manual",
      loadBalancedEnvironmentId: null,
    });
  });

  it("leaves a draft that was sent", async () => {
    const store = setup();
    store.setPrompt(DRAFT_ID, "sent");
    useComposerDraftStore.setState((state) => ({
      draftThreadsByThreadKey: {
        ...state.draftThreadsByThreadKey,
        [DRAFT_ID]: {
          ...state.draftThreadsByThreadKey[DRAFT_ID]!,
          promotedTo: { environmentId: MAC, threadId: ThreadId.make("thread-1") },
        },
      },
    }));
    const openProjectDraft = vi.fn();
    await moveDraftToProject({
      draftId: DRAFT_ID,
      project: BOX_PROJECT,
      logicalProjectKey: "repo:codebase",
      openProjectDraft,
    });
    expect(openProjectDraft).not.toHaveBeenCalled();
    expect(store.getDraftSession(DRAFT_ID)).toMatchObject({
      environmentId: MAC,
      branch: "feature",
    });
  });
});

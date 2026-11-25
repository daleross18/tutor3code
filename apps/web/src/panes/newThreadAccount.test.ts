import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
  type ModelSelection,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vite-plus/test";

import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import { pickNewThreadAccount, resolveNewThreadAccount } from "./newThreadAccount";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

const NOW = Date.parse("2026-11-18T12:00:00.000Z");
const FABLE = "claude-fable-5";
const PROJECT_ID = ProjectId.make("project-1");
const DRAFT_ID = "draft-1" as DraftId;

const decodeProvider = Schema.decodeUnknownSync(ServerProvider);

// What the client holds of the environment and its project. `pickNewThreadAccount` reads both
// the way the stock new-thread flow does.
const environment = vi.hoisted(() => ({
  config: undefined as { providers: ReadonlyArray<unknown>; settings: unknown } | undefined,
  project: null as { defaultModelSelection: unknown } | null,
  projectReads: 0,
}));
vi.mock("../rpc/atomRegistry", () => ({
  appAtomRegistry: { get: () => ({ get: () => environment.config }) },
}));
vi.mock("../state/server", () => ({ environmentServerConfigsAtom: {} }));
vi.mock("../state/entities", () => ({
  readProject: () => {
    environment.projectReads += 1;
    return environment.project;
  },
}));

/** `usedPercent` of the 5-hour window. Null: the server sent no limits. */
function account(instanceId: string, usedPercent: number | null, driver = "claudeAgent") {
  return decodeProvider({
    instanceId,
    driver,
    enabled: true,
    installed: true,
    version: "2.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-11-18T11:59:00.000Z",
    models: [{ slug: FABLE, name: "Fable", isCustom: false, capabilities: null }],
    ...(usedPercent === null
      ? {}
      : {
          usageLimits: {
            checkedAt: "2026-11-18T11:59:00.000Z",
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
        }),
  });
}

const select = (instanceId: string, model = FABLE): ModelSelection => ({
  instanceId: ProviderInstanceId.make(instanceId),
  model,
});

const providers = [
  account("claude", 100),
  account("claude2", 30),
  account("claude3", 60),
  account("codex", 0, "codex"),
];

const resolve = (input: {
  stockSelection: ModelSelection | null;
  defaultSelection?: ModelSelection | null;
  seeded?: ModelSelection | null;
  accounts?: ReadonlyArray<ServerProvider>;
}) =>
  resolveNewThreadAccount({
    stockSelection: input.stockSelection,
    defaultSelection: input.defaultSelection ?? null,
    seededSelection: () => input.seeded ?? null,
    context: { providers: input.accounts ?? providers, now: NOW },
  });

/** The stores outlive a test, so each test starts from an empty draft store and the defaults. */
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
  environment.config = undefined;
  environment.project = null;
  environment.projectReads = 0;
}

describe("resolveNewThreadAccount", () => {
  it("moves the selection that stock sets to the account with the most quota left", () => {
    const stock = select("claude3");
    expect(resolve({ stockSelection: stock, defaultSelection: stock })).toEqual(select("claude2"));
  });

  it("returns what stock returned when the best account is already selected", () => {
    const stock = select("claude2");
    expect(resolve({ stockSelection: stock, defaultSelection: stock })).toBe(stock);
    // Stock sets nothing and the draft already shows the best account: the draft stays as it is.
    expect(resolve({ stockSelection: null, seeded: select("claude2") })).toBeNull();
  });

  it("picks for the model that the draft shows when stock sets nothing", () => {
    expect(resolve({ stockSelection: null, seeded: select("claude") })).toEqual(select("claude2"));
    expect(resolve({ stockSelection: null, seeded: null })).toBeNull();
  });

  it("puts a Claude account with quota before the stock fallback model", () => {
    const fallback = select("codex", "gpt-5.5");
    const exhaustedDefault = select("claude");
    expect(resolve({ stockSelection: fallback, defaultSelection: exhaustedDefault })).toEqual(
      select("claude2"),
    );
    // Every Claude account is out of usage: the stock fallback stays.
    expect(
      resolve({
        stockSelection: fallback,
        defaultSelection: exhaustedDefault,
        accounts: [account("claude", 100), account("claude2", 100), account("codex", 0, "codex")],
      }),
    ).toBe(fallback);
  });

  it("leaves the stock selection, and does not read the draft, with fewer than two Claude accounts", () => {
    const seededSelection = vi.fn(() => select("claude"));
    for (const accounts of [[], [account("claude", 100), account("codex", 0, "codex")]]) {
      expect(
        resolveNewThreadAccount({
          stockSelection: null,
          defaultSelection: null,
          seededSelection,
          context: { providers: accounts, now: NOW },
        }),
      ).toBeNull();
    }
    expect(seededSelection).not.toHaveBeenCalled();
  });

  it("leaves a selection of another driver, and accounts with no reading", () => {
    const codex = select("codex", "gpt-5.5");
    expect(resolve({ stockSelection: codex, defaultSelection: codex })).toBe(codex);
    const stock = select("claude");
    expect(
      resolve({
        stockSelection: stock,
        defaultSelection: stock,
        accounts: [account("claude", null), account("claude2", null)],
      }),
    ).toBe(stock);
  });
});

describe("pickNewThreadAccount", () => {
  const instance = { driver: ProviderDriverKind.make("claudeAgent"), enabled: true };
  const settings: ServerSettings = {
    ...DEFAULT_SERVER_SETTINGS,
    providerInstances: Object.fromEntries(
      ["claude", "claude2", "claude3"].map((id) => [ProviderInstanceId.make(id), instance]),
    ),
  };
  const projectRef = {
    environmentId: EnvironmentId.make("environment-1"),
    projectId: PROJECT_ID,
  };
  const pick = (stockSelection: ModelSelection | null) =>
    pickNewThreadAccount(stockSelection, DRAFT_ID, projectRef);

  it("is on by default and reads the sticky model of the draft when stock sets nothing", () => {
    setup();
    environment.config = { providers, settings };
    const options = [{ id: "effort", value: "high" }];
    useComposerDraftStore.getState().setModelSelection(DRAFT_ID, { ...select("claude3"), options });
    expect(pick(null)).toEqual({ ...select("claude2"), options });
  });

  it("falls back to the first provider of the project when the draft holds no model", () => {
    setup();
    environment.config = { providers: providers.slice(0, 3), settings };
    expect(pick(null)).toEqual(select("claude2"));
  });

  it("reads the default model of the project itself, and puts an account with quota before the stock fallback", () => {
    setup();
    // The default account of the project is out of usage, so stock moved to its fallback model.
    environment.config = {
      providers,
      settings: { ...settings, defaultModelSelection: select("claude") },
    };
    expect(pick(select("codex", "gpt-5.5"))).toEqual(select("claude2"));
    // Stock kept the default: the pick is for that model.
    expect(pick(select("claude"))).toEqual(select("claude2"));
  });

  it("returns the stock selection, and reads no project, where the environment has no choice of account", () => {
    setup();
    const stock = select("claude");
    expect(pick(stock)).toBe(stock);
    environment.config = { providers: [providers[0]!, providers[3]!], settings };
    expect(pick(stock)).toBe(stock);
    expect(environment.projectReads).toBe(0);
  });

  it("returns the stock selection untouched when the setting is off", () => {
    setup();
    environment.config = { providers, settings };
    useReadoutSettingsStore.getState().setReadoutSetting("newThreadsUseMostQuota", false);
    const stock = select("claude3");
    expect(pick(stock)).toBe(stock);
    expect(pick(null)).toBeNull();
    expect(environment.projectReads).toBe(0);
  });
});

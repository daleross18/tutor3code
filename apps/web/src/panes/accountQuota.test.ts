import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  accountQuotaOf,
  accountWithMostQuota,
  LOW_QUOTA_PERCENT,
  quotaHeadroom,
  selectionWithMostQuota,
} from "./accountQuota";

const NOW = Date.parse("2026-11-18T12:00:00.000Z");
const IN_TWO_HOURS = "2026-11-18T14:00:00.000Z";
const AN_HOUR_AGO = "2026-11-18T11:00:00.000Z";
const FABLE = "claude-fable-5";
const SONNET = "claude-sonnet-5";

const decodeProvider = Schema.decodeUnknownSync(ServerProvider);

interface Used {
  readonly fiveHour?: number;
  readonly sevenDay?: number;
  readonly fable?: number;
  readonly resetsAt?: string;
}

/** The windows that the stock Claude probe sends (`claudeUsageLimits.ts`). */
function windowsOf(used: Used) {
  const resets = { resetsAt: used.resetsAt ?? IN_TWO_HOURS };
  return [
    used.fiveHour === undefined
      ? null
      : {
          id: "five_hour",
          kind: "session",
          label: "Session",
          usedPercent: used.fiveHour,
          ...resets,
        },
    used.sevenDay === undefined
      ? null
      : { id: "seven_day", kind: "weekly", label: "Weekly", usedPercent: used.sevenDay, ...resets },
    used.fable === undefined
      ? null
      : {
          id: "seven_day_fable",
          kind: "weekly",
          label: "Weekly · Fable",
          usedPercent: used.fable,
          ...resets,
        },
    { id: "monthly_spend", kind: "monthly", label: "Monthly spend", usedPercent: 99 },
  ].filter((window) => window !== null);
}

function claude(instanceId: string, used: Used | null, overrides: object = {}): ServerProvider {
  return decodeProvider({
    instanceId,
    driver: "claudeAgent",
    enabled: true,
    installed: true,
    version: "2.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-11-18T11:59:00.000Z",
    models: [FABLE, SONNET].map((slug) => ({
      slug,
      name: slug,
      isCustom: false,
      capabilities: null,
    })),
    ...(used === null
      ? {}
      : { usageLimits: { checkedAt: "2026-11-18T11:59:00.000Z", windows: windowsOf(used) } }),
    ...overrides,
  });
}

const select = (instanceId: string, model = FABLE) => ({
  instanceId: ProviderInstanceId.make(instanceId),
  model,
});
const pick = (
  selection: ReturnType<typeof select>,
  providers: ReadonlyArray<ServerProvider>,
  settings?: ServerSettings,
) =>
  accountWithMostQuota(selection, {
    providers,
    settings,
    projectId: ProjectId.make("project-1"),
    now: NOW,
  });

describe("accountQuota", () => {
  it("reads the 5-hour, 7-day and model weekly windows of the stock server, as the share left", () => {
    const quota = accountQuotaOf(
      claude("claude2", { fiveHour: 38, sevenDay: 60.4, fable: 91 }),
      NOW,
    );
    expect(quota).toEqual({
      kind: "windows",
      windows: [
        {
          id: "five_hour",
          shortLabel: "5h",
          remainingPercent: 62,
          low: false,
          description: "5h: 62% left, resets in 2h 0m",
        },
        {
          id: "seven_day",
          shortLabel: "7d",
          remainingPercent: 40,
          low: false,
          description: "7d: 40% left, resets in 2h 0m",
        },
        {
          id: "seven_day_fable",
          shortLabel: "Fable",
          remainingPercent: 9,
          low: true,
          description: "Fable: 9% left, resets in 2h 0m",
        },
      ],
    });
  });

  it("marks a window low at 10% left, and counts a window as full after its reset time", () => {
    expect(LOW_QUOTA_PERCENT).toBe(10);
    const lowOf = (used: Used) => {
      const quota = accountQuotaOf(claude("claude", used), NOW);
      if (quota.kind !== "windows") throw new Error("No windows.");
      return quota.windows.map((window) => [window.remainingPercent, window.low]);
    };
    expect(lowOf({ fiveHour: 89, sevenDay: 90 })).toEqual([
      [11, false],
      [10, true],
    ]);
    expect(lowOf({ fiveHour: 100, sevenDay: 100, resetsAt: AN_HOUR_AGO })).toEqual([
      [100, false],
      [100, false],
    ]);
  });

  it.each([
    [
      "a server that sends no limits",
      claude("claude", null),
      "The server of this environment reports no quota.",
    ],
    [
      "a probe that failed",
      claude("claude", null, {
        usageLimits: {
          checkedAt: "2026-11-18T11:59:00.000Z",
          windows: [],
          unavailable: { reason: "probeFailed" },
        },
      }),
      "Could not read limits.",
    ],
    [
      "an account with no subscription",
      claude("claude", null, {
        usageLimits: {
          checkedAt: "2026-11-18T11:59:00.000Z",
          windows: [],
          unavailable: { reason: "unsupported" },
        },
      }),
      "This account has no subscription limits.",
    ],
    [
      "an account whose binary is missing, with the reason of the server",
      claude("claude", null, { installed: false, message: "Claude CLI not found." }),
      "Claude CLI not found.",
    ],
    [
      "an account that is not installed",
      claude("claude", null, { installed: false }),
      "This account is not installed on its environment.",
    ],
    [
      "an account that is not signed in",
      claude("claude", null, { auth: { status: "unauthenticated" } }),
      "This account is not signed in.",
    ],
    [
      "an account that is not available",
      claude("claude", null, { availability: "unavailable" }),
      "This account is not available.",
    ],
  ])("says why no number shows for %s", (_name, provider, reason) => {
    expect(accountQuotaOf(provider, NOW)).toEqual({ kind: "unavailable", reason });
    expect(quotaHeadroom(provider, FABLE, NOW)).toBeNull();
  });

  it("counts a reading with no quota window as an account with no usage", () => {
    // The stock probe sends a window only for a number that the account reports.
    const unused = claude("unused", {});
    expect(accountQuotaOf(unused, NOW)).toEqual({
      kind: "unused",
      reason: "This account reports no usage in a quota window.",
    });
    expect(quotaHeadroom(unused, FABLE, NOW)).toBe(100);
    // A window of another model does not limit this model.
    expect(quotaHeadroom(claude("claude", { fable: 99 }), SONNET, NOW)).toBe(100);
    expect(pick(select("claude"), [claude("claude", { sevenDay: 90 }), unused])).toMatchObject({
      provider: { instanceId: "unused" },
      headroom: 100,
    });
  });

  it("takes the fullest window that limits the model as the headroom", () => {
    const account = claude("claude", { fiveHour: 20, sevenDay: 50, fable: 95 });
    // The Fable window limits a Fable model only.
    expect(quotaHeadroom(account, FABLE, NOW)).toBe(5);
    expect(quotaHeadroom(account, SONNET, NOW)).toBe(50);
    expect(quotaHeadroom(claude("claude", { fiveHour: 20 }), FABLE, NOW)).toBe(80);
    expect(
      quotaHeadroom(claude("codex", { fiveHour: 20 }, { driver: "codex" }), FABLE, NOW),
    ).toBeNull();
  });

  it("picks the account with the most quota left for the model", () => {
    const providers = [
      claude("claude", { fiveHour: 90, sevenDay: 20, fable: 20 }),
      claude("claude2", { fiveHour: 10, sevenDay: 30, fable: 97 }),
      claude("claude3", { fiveHour: 40, sevenDay: 45, fable: 45 }),
    ];
    expect(pick(select("claude"), providers)).toMatchObject({
      provider: { instanceId: "claude3" },
      headroom: 55,
    });
    // For another model the Fable window of claude2 does not count.
    expect(pick(select("claude", SONNET), providers)).toMatchObject({
      provider: { instanceId: "claude2" },
      headroom: 70,
    });
  });

  it("keeps the selected account on a tie, and takes the first account otherwise", () => {
    const providers = [
      claude("claude", { fiveHour: 50 }),
      claude("claude2", { fiveHour: 50 }),
      claude("claude3", { fiveHour: 50 }),
    ];
    expect(pick(select("claude2"), providers)?.provider.instanceId).toBe("claude2");
    expect(pick(select("other"), providers)?.provider.instanceId).toBe("claude");
  });

  it("never picks an account that cannot start the thread or cannot be compared", () => {
    const best = { fiveHour: 0, sevenDay: 0, fable: 0 };
    const usable = claude("usable", { fiveHour: 80, sevenDay: 80, fable: 80 });
    const unusable = [
      claude("disabled", best, { enabled: false }),
      claude("not-installed", best, { installed: false }),
      claude("signed-out", best, { auth: { status: "unauthenticated" } }),
      claude("unavailable", best, { availability: "unavailable" }),
      claude("no-such-model", best, { models: [] }),
      claude("codex", best, { driver: "codex" }),
      claude("no-reading", null),
    ];
    expect(pick(select("usable"), [...unusable, usable])?.provider.instanceId).toBe("usable");
    expect(pick(select("usable"), unusable)).toBeNull();

    // An account that the project turned off is out too.
    const instance = { driver: ProviderDriverKind.make("claudeAgent"), enabled: true };
    const projectOff: ServerSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("off-here")]: instance,
        [ProviderInstanceId.make("usable")]: instance,
      },
      projectSettingsOverrides: {
        [ProjectId.make("project-1")]: {
          providerInstances: { [ProviderInstanceId.make("off-here")]: { enabled: false } },
        },
      },
    };
    const both = [claude("off-here", best), usable];
    expect(pick(select("usable"), both, projectOff)?.provider.instanceId).toBe("usable");
    expect(pick(select("usable"), both)?.provider.instanceId).toBe("off-here");
  });

  it("moves a selection to the best account and keeps its model and options", () => {
    const providers = [
      claude("claude", { fiveHour: 95 }),
      claude("claude2", { fiveHour: 10 }),
      claude("codex", { fiveHour: 0 }, { driver: "codex" }),
    ];
    const context = { providers, now: NOW };
    const options = [{ id: "effort", value: "high" }];
    expect(selectionWithMostQuota({ ...select("claude"), options }, context)).toEqual({
      instanceId: "claude2",
      model: FABLE,
      options,
    });
    // The best account is already selected, another driver is selected, or nothing compares.
    const best = select("claude2");
    expect(selectionWithMostQuota(best, context)).toBe(best);
    const codex = select("codex");
    expect(selectionWithMostQuota(codex, context)).toBe(codex);
    const alone = select("claude");
    expect(selectionWithMostQuota(alone, { providers: [claude("claude", null)], now: NOW })).toBe(
      alone,
    );
  });
});

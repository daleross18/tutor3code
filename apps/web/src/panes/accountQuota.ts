import {
  isProviderAvailable,
  resolveProjectProviderInstanceEnabled,
  type ModelSelection,
  type ProjectId,
  type ServerProvider,
  type ServerProviderUsageWindow,
  type ServerSettings,
} from "@t3tools/contracts";
import { formatResetsIn, limitsNotice } from "@t3tools/shared/usageLimitsCopy";

/**
 * Quota is shown and compared for Claude accounts only. Each other driver gives its windows a
 * meaning of its own (see `exhaustedUsageWindow` in `packages/shared/src/usageLimits.ts`).
 */
export const QUOTA_DRIVER = "claudeAgent";

/** A number at or below this share of a window, in percent, shows amber. */
export const LOW_QUOTA_PERCENT = 10;

// The window ids of the stock Claude probe (`apps/server/src/provider/claudeUsageLimits.ts`).
const SESSION_WINDOW_ID = "five_hour";
const WEEKLY_WINDOW_ID = "seven_day";
const MODEL_WINDOW_PREFIX = "seven_day_";
const MODEL_WINDOW_LABEL_PREFIX = "Weekly · ";

export interface AccountQuotaWindow {
  readonly id: string;
  /** "5h", "7d", or the model name of a model window, such as "Fable". */
  readonly shortLabel: string;
  /** Percent of the window that is left, 0 to 100. */
  readonly remainingPercent: number;
  readonly low: boolean;
  /** "5h: 62% left, resets in 2h 10m". */
  readonly description: string;
}

export type AccountQuota =
  | { readonly kind: "windows"; readonly windows: ReadonlyArray<AccountQuotaWindow> }
  /** A reading with no quota window: the account reports no usage. The pick counts it as full. */
  | { readonly kind: "unused"; readonly reason: string }
  /** The server sent no reading for this account. `reason` says why. */
  | { readonly kind: "unavailable"; readonly reason: string };

/** The stock server rule (`windowLimitsModel`): lower case, each other run of characters is `_`. */
const modelToken = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

function isModelWindow(window: Pick<ServerProviderUsageWindow, "id">): boolean {
  return window.id.startsWith(MODEL_WINDOW_PREFIX);
}

function isQuotaWindow(window: Pick<ServerProviderUsageWindow, "id">): boolean {
  return window.id === SESSION_WINDOW_ID || window.id === WEEKLY_WINDOW_ID || isModelWindow(window);
}

/** A model window limits only its own model. The other two windows limit every model. */
function windowLimitsModel(window: ServerProviderUsageWindow, model: string): boolean {
  if (window.modelIds !== undefined && !window.modelIds.includes(model)) return false;
  return (
    !isModelWindow(window) ||
    modelToken(model).includes(window.id.slice(MODEL_WINDOW_PREFIX.length))
  );
}

/** A window whose reset time has passed is full again, whatever the last reading says. */
function remainingPercentAt(window: ServerProviderUsageWindow, now: number): number {
  const resetsAt = window.resetsAt === undefined ? Number.NaN : Date.parse(window.resetsAt);
  if (Number.isFinite(resetsAt) && resetsAt <= now) return 100;
  return Math.round(100 - Math.max(0, Math.min(100, window.usedPercent)));
}

function shortLabelOf(window: ServerProviderUsageWindow): string {
  if (window.id === SESSION_WINDOW_ID) return "5h";
  if (window.id === WEEKLY_WINDOW_ID) return "7d";
  return window.label.startsWith(MODEL_WINDOW_LABEL_PREFIX)
    ? window.label.slice(MODEL_WINDOW_LABEL_PREFIX.length)
    : window.label;
}

// The stock probe sends a window only when the account reports a number for it
// (`claudeUsageResponseToLimits`), so a reading with no quota window is an account with no usage.
const NO_USAGE_REASON = "This account reports no usage in a quota window.";

/** Why an account has no reading: the account itself first, then the server. */
function noReadingReason(provider: ServerProvider): string {
  const detail = provider.message?.trim();
  if (!provider.installed) return detail || "This account is not installed on its environment.";
  if (provider.auth.status === "unauthenticated") return detail || "This account is not signed in.";
  if (!isProviderAvailable(provider)) return detail || "This account is not available.";
  return "The server of this environment reports no quota.";
}

/** The 5-hour window, the 7-day window and each model weekly window of one Claude account. */
export function accountQuotaOf(provider: ServerProvider, now: number): AccountQuota {
  const limits = provider.usageLimits;
  if (limits === undefined) return { kind: "unavailable", reason: noReadingReason(provider) };
  if (limits.unavailable !== undefined) {
    return { kind: "unavailable", reason: limitsNotice(limits) ?? "Could not read limits." };
  }
  const windows = limits.windows.filter(isQuotaWindow);
  if (windows.length === 0) return { kind: "unused", reason: NO_USAGE_REASON };
  return {
    kind: "windows",
    windows: windows.map((window) => {
      const remainingPercent = remainingPercentAt(window, now);
      const shortLabel = shortLabelOf(window);
      const resets = remainingPercent === 100 ? null : formatResetsIn(window, now);
      return {
        id: window.id,
        shortLabel,
        remainingPercent,
        low: remainingPercent <= LOW_QUOTA_PERCENT,
        description: `${shortLabel}: ${remainingPercent}% left${resets ? `, ${resets}` : ""}`,
      };
    }),
  };
}

/**
 * The share that is left of the fullest window that limits `model`, in percent. Null when the
 * account has no reading, so an account that cannot be compared is never picked. A reading with
 * no window that limits the model is 100: the account reports no usage there.
 */
export function quotaHeadroom(provider: ServerProvider, model: string, now: number): number | null {
  const limits = provider.usageLimits;
  if (provider.driver !== QUOTA_DRIVER || limits === undefined || limits.unavailable) return null;
  const windows = limits.windows.filter(
    (window) => isQuotaWindow(window) && windowLimitsModel(window, model),
  );
  return Math.min(100, ...windows.map((window) => remainingPercentAt(window, now)));
}

export interface AccountPickContext {
  readonly providers: ReadonlyArray<ServerProvider>;
  /** Absent while the environment has no server config. No project rule is applied then. */
  readonly settings?: ServerSettings | undefined;
  readonly projectId?: ProjectId | null | undefined;
  readonly now: number;
}

/** The same conditions that stock sets for its fallback model, plus the model itself. */
function canStartThread(
  provider: ServerProvider,
  model: string,
  context: AccountPickContext,
): boolean {
  return (
    provider.driver === QUOTA_DRIVER &&
    provider.enabled &&
    provider.installed &&
    provider.auth.status !== "unauthenticated" &&
    isProviderAvailable(provider) &&
    provider.models.some((candidate) => candidate.slug === model) &&
    (context.settings === undefined ||
      resolveProjectProviderInstanceEnabled(
        context.settings,
        context.projectId ?? null,
        provider.instanceId,
      ))
  );
}

/**
 * The Claude account with the most quota left for the model of `selection`, or null when no
 * account can be compared. The account of `selection` wins a tie, then the first account.
 */
export function accountWithMostQuota(
  selection: ModelSelection,
  context: AccountPickContext,
): { readonly provider: ServerProvider; readonly headroom: number } | null {
  let best: { readonly provider: ServerProvider; readonly headroom: number } | null = null;
  for (const provider of context.providers) {
    if (!canStartThread(provider, selection.model, context)) continue;
    const headroom = quotaHeadroom(provider, selection.model, context.now);
    if (headroom === null) continue;
    if (
      best === null ||
      headroom > best.headroom ||
      (headroom === best.headroom && provider.instanceId === selection.instanceId)
    ) {
      best = { provider, headroom };
    }
  }
  return best;
}

/**
 * The selection of a new thread, moved to the Claude account with the most quota left. The model
 * and its options stay. A selection of another driver, and a selection with no account to
 * compare, stay as they are.
 */
export function selectionWithMostQuota(
  selection: ModelSelection,
  context: AccountPickContext,
): ModelSelection {
  const current = context.providers.find(
    (provider) => provider.instanceId === selection.instanceId,
  );
  if (current?.driver !== QUOTA_DRIVER) return selection;
  const best = accountWithMostQuota(selection, context);
  return best === null || best.provider.instanceId === selection.instanceId
    ? selection
    : { ...selection, instanceId: best.provider.instanceId };
}

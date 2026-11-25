import type { ProviderInstanceId } from "@t3tools/contracts";
import { useState } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import type { ProviderInstanceEntry } from "../providerInstances";
import { accountQuotaOf, accountWithMostQuota, QUOTA_DRIVER } from "./accountQuota";
import { useReadoutSettingsStore } from "./readoutSettings";

function AccountQuotaRow({
  entry,
  now,
  current,
  mostQuota,
}: {
  entry: ProviderInstanceEntry;
  now: number;
  current: boolean;
  mostQuota: boolean;
}) {
  const quota = accountQuotaOf(entry.snapshot, now);
  const description =
    quota.kind === "windows"
      ? quota.windows.map((window) => window.description).join(" · ")
      : quota.reason;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            role="group"
            aria-label={`${entry.displayName}. ${description}`}
            data-account-quota-row={entry.instanceId}
            data-current={current || undefined}
            data-most-quota={mostQuota || undefined}
            className="flex min-w-0 items-baseline gap-2"
          />
        }
      >
        <span className={cn("min-w-0 flex-1 truncate", current && "font-medium text-foreground")}>
          {entry.displayName}
          {mostQuota ? (
            <span className="font-normal text-muted-foreground"> · most left</span>
          ) : null}
        </span>
        {quota.kind === "windows" ? (
          quota.windows.map((window) => (
            <span
              key={window.id}
              data-account-quota-window={window.id}
              data-low={window.low || undefined}
              className={cn("shrink-0", window.low && "text-warning-foreground")}
            >
              {window.shortLabel} {window.remainingPercent}%
            </span>
          ))
        ) : quota.kind === "unused" ? (
          <span data-account-quota-unused="true" className="shrink-0">
            no usage reported
          </span>
        ) : (
          <span data-account-quota-unavailable="true" className="shrink-0">
            not reported
          </span>
        )}
      </TooltipTrigger>
      <TooltipPopup side="left" align="center">
        {description}
      </TooltipPopup>
    </Tooltip>
  );
}

function AccountQuotaRows({
  accounts,
  activeInstanceId,
  model,
}: {
  accounts: ReadonlyArray<ProviderInstanceEntry>;
  activeInstanceId: ProviderInstanceId;
  model: string;
}) {
  // One reading of the clock for each time the picker opens, so the rows agree with each other.
  const [now] = useState(() => Date.now());
  // The account that a new thread on the current model would start on.
  const mostQuota =
    accounts.length > 1
      ? accountWithMostQuota(
          { instanceId: activeInstanceId, model },
          { providers: accounts.map((entry) => entry.snapshot), now },
        )
      : null;
  return (
    <div
      data-account-quota="true"
      className="flex shrink-0 flex-col gap-0.5 border-t border-border/70 px-2.5 py-1.5 text-2xs text-muted-foreground tabular-nums"
    >
      <span className="text-muted-foreground/70">Claude quota left</span>
      {accounts.map((entry) => (
        <AccountQuotaRow
          key={entry.instanceId}
          entry={entry}
          now={now}
          current={entry.instanceId === activeInstanceId}
          mostQuota={entry.instanceId === mostQuota?.provider.instanceId}
        />
      ))}
    </div>
  );
}

/**
 * Under the model list of the picker: each Claude account with the share that is left of its
 * 5-hour window, its 7-day window and each model weekly window. The stock server sends them.
 */
export function AccountQuotaList(props: {
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  activeInstanceId: ProviderInstanceId;
  model: string;
}) {
  const enabled = useReadoutSettingsStore((settings) => settings.showAccountQuota);
  const accounts = props.instanceEntries.filter(
    (entry) => entry.driverKind === QUOTA_DRIVER && entry.enabled,
  );
  return enabled && accounts.length > 0 ? (
    <AccountQuotaRows
      accounts={accounts}
      activeInstanceId={props.activeInstanceId}
      model={props.model}
    />
  ) : null;
}

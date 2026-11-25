import { useAtomValue } from "@effect/atom-react";
import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { formatContextWindowCompactionMessage } from "../components/chat/compaction.logic";
import { Popover, PopoverPopup, PopoverTrigger } from "../components/ui/popover";
import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";
import { formatContextWindowTokens } from "../lib/contextWindow";
import { cn } from "../lib/utils";
import { environmentThreadDetails } from "../state/threads";
import {
  contextPartRows,
  deriveContextBreakdown,
  type BreakdownProjection,
  type ContextBreakdown,
  type ContextRequestRow,
} from "./contextBreakdownShares";
import { usePaneThreadRef } from "./paneContext";
import { useReadoutSettingsStore } from "./readoutSettings";

/** The props of the stock row of the thread details (`UsageRow` in `ThreadDetailsUsage.tsx`). */
interface StockUsageRowProps {
  readonly label: string;
  readonly fill: number | null;
  readonly tone: "error" | "warning" | null;
  readonly tick?: number | null;
  readonly value: string;
  readonly ariaValue?: string;
  readonly tooltip: ReactNode;
  readonly muted?: boolean;
}

const LISTED_PARTS = 6;

const REQUEST_LABEL: Record<ContextRequestRow["id"], string> = {
  cached: "Input read from the cache",
  newInput: "New input",
  input: "Input",
  output: "Output",
};

/**
 * The stock "Context" row of the thread details. With the setting on, the row opens a breakdown
 * of the context on hover and on click, in place of the stock tooltip. Off: the stock row.
 */
export function ContextBreakdownRow({
  row: StockRow,
  usage,
  ...rowProps
}: StockUsageRowProps & {
  readonly row: (props: StockUsageRowProps) => ReactNode;
  readonly usage: ContextWindowSnapshot;
}) {
  const enabled = useReadoutSettingsStore((settings) => settings.showContextBreakdown);
  if (!enabled) return <StockRow {...rowProps} />;
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        nativeButton={false}
        render={
          <div
            data-context-breakdown-trigger
            aria-label={`${rowProps.label}: ${rowProps.ariaValue ?? rowProps.value}`}
            className="col-span-3 grid cursor-default grid-cols-subgrid rounded-lg outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-black/[0.035] dark:hover:bg-white/[0.08] dark:data-popup-open:bg-white/[0.08]"
          />
        }
      >
        {/* Inert: the stock row keeps its look, and its own tooltip never opens under the popup. */}
        <div inert className="col-span-3 grid grid-cols-subgrid">
          <StockRow {...rowProps} />
        </div>
      </PopoverTrigger>
      {/* The side and the offset of the stock tooltip of the row. */}
      <PopoverPopup side="left" sideOffset={16} width="sm" padding="compact">
        <ContextBreakdownContent usage={usage} />
      </PopoverPopup>
    </Popover>
  );
}

function ContextBreakdownContent({ usage }: { readonly usage: ContextWindowSnapshot }) {
  const threadRef = usePaneThreadRef(useThreadRouteRef());
  return threadRef === null ? (
    <ContextBreakdownView breakdown={deriveContextBreakdown(usage, null)} />
  ) : (
    <ThreadContextBreakdown threadRef={threadRef} usage={usage} />
  );
}

function ThreadContextBreakdown({
  threadRef,
  usage,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly usage: ContextWindowSnapshot;
}) {
  // The structure atom keeps its value while text streams, so an open popup does not repaint then.
  const thread = useAtomValue(environmentThreadDetails.quietThreadAtom(threadRef));
  const projection: BreakdownProjection | null = thread?.projection ?? null;
  return <ContextBreakdownView breakdown={deriveContextBreakdown(usage, projection)} />;
}

function SectionTitle({ children }: { readonly children: ReactNode }) {
  return <div className="text-2xs font-medium text-muted-foreground select-none">{children}</div>;
}

function TokenRow({
  label,
  detail = null,
  tokens,
  part,
}: {
  readonly label: string;
  readonly detail?: string | null;
  readonly tokens: string;
  readonly part?: string;
}) {
  return (
    <div data-context-part={part} className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-foreground/80">{label}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{detail}</span>
      <span className="shrink-0 font-medium text-foreground/80 tabular-nums">{tokens}</span>
    </div>
  );
}

function ContextBreakdownView({ breakdown }: { readonly breakdown: ContextBreakdown }) {
  const { usedTokens, maxTokens, freeTokens, usedPercent, autoCompactThreshold } = breakdown;
  const rows = contextPartRows(breakdown.parts, LISTED_PARTS);
  // With a limit the bar is the whole window. With none it is the used context only.
  const whole = maxTokens ?? usedTokens;
  const segments =
    rows.length > 0 ? rows : [{ key: "used", label: "", detail: null, tokens: usedTokens }];
  return (
    <div data-context-breakdown className="flex flex-col gap-2.5 text-xs">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-foreground">Context</span>
          <span data-context-total className="font-medium text-foreground/80 tabular-nums">
            {maxTokens === null
              ? `${formatContextWindowTokens(usedTokens)} tokens`
              : `${formatContextWindowTokens(usedTokens)} / ${formatContextWindowTokens(maxTokens)}`}
          </span>
        </div>
        <div
          aria-hidden
          className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted-foreground/30 dark:bg-muted-foreground/20"
        >
          {whole > 0
            ? segments.map((segment, index) => (
                <span
                  key={segment.key}
                  data-context-segment={segment.key}
                  className={cn(
                    "h-full",
                    index === segments.length - 1 ? "bg-foreground/80" : "bg-muted-foreground",
                  )}
                  style={{ width: `${(segment.tokens / whole) * 100}%` }}
                />
              ))
            : null}
        </div>
        <div data-context-free className="text-muted-foreground">
          {usedPercent !== null && freeTokens !== null
            ? `${usedPercent}% used · ${formatContextWindowTokens(freeTokens)} free (${100 - usedPercent}%)`
            : "The provider reports no limit."}
        </div>
        {autoCompactThreshold !== null ? (
          <div className="text-muted-foreground">
            {formatContextWindowCompactionMessage(autoCompactThreshold)}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <SectionTitle>Growth by turn</SectionTitle>
        {rows.length > 0 ? (
          rows.map((row) => (
            <TokenRow
              key={row.key}
              part={row.key}
              label={row.label}
              detail={row.detail}
              tokens={formatContextWindowTokens(row.tokens)}
            />
          ))
        ) : (
          <div data-context-part="none" className="text-muted-foreground">
            No turn of this conversation reported the total, so there is no split by turn.
          </div>
        )}
      </div>

      {breakdown.request.length > 0 ? (
        <div className="flex flex-col gap-1">
          <SectionTitle>Latest model request</SectionTitle>
          {breakdown.request.map((row) => (
            <TokenRow
              key={row.id}
              part={row.id}
              label={REQUEST_LABEL[row.id]}
              detail={
                row.id === "output" && breakdown.reasoningTokens !== null
                  ? `${formatContextWindowTokens(breakdown.reasoningTokens)} reasoning`
                  : null
              }
              tokens={formatContextWindowTokens(row.tokens)}
            />
          ))}
        </div>
      ) : null}

      <div className="text-2xs text-muted-foreground">
        Each number is a report of the provider. The server sends no size for the system prompt, the
        tools, memory files or tool results. They count in the turn that added them.
      </div>
    </div>
  );
}

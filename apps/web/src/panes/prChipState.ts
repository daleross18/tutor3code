import type { PullRequestChecksState, ThreadPullRequestLink } from "@t3tools/contracts";

import type { CiStatusView, CiTone } from "./ciStatus";

type PullRequestChipState = "open" | "draft" | "merged" | "closed" | "unknown";

export interface PullRequestChipView {
  /** Selects the stock glyph and its color. `unknown`: the server sent no state yet. */
  readonly state: PullRequestChipState;
  /** The number after a hash sign. Hidden when the strip collapses its labels. */
  readonly number: string;
  /** At most one CI mark. Null when every lane passed and when the state is not known. */
  readonly mark: { readonly tone: CiTone; readonly elapsed: string | null } | null;
  readonly autoMerge: boolean;
  /** One sentence for a screen reader. */
  readonly label: string;
  /** One fact in each line, for the tooltip. */
  readonly details: ReadonlyArray<string>;
}

const STATE_WORD: Record<Exclude<PullRequestChipState, "unknown">, string> = {
  open: "Open",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
};

const CHECKS_WORD: Record<CiTone | "passed", string> = {
  failed: "checks failed",
  running: "checks run",
  approval: "checks wait for approval",
  passed: "checks passed",
};

/**
 * What the chip of the bottom bar shows for one pull request of a thread. The chip is compact:
 * it names no lane, and shows nothing for lanes that all passed. The tooltip has the detail.
 * `ci` is null for a pull request that is not open, because no request is made for it.
 */
export function derivePullRequestChip(input: {
  readonly link: Pick<ThreadPullRequestLink, "number" | "snapshot">;
  /** The other pull requests that the thread shows in its details. */
  readonly others: number;
  readonly ci: {
    readonly status: CiStatusView;
    readonly checksState: PullRequestChecksState | null;
  } | null;
  /** The words of the host for one and for several, such as "pull request". */
  readonly term: { readonly singular: string; readonly plural: string };
}): PullRequestChipView {
  const { link, ci, term } = input;
  const snapshot = link.snapshot;
  const state: PullRequestChipState =
    snapshot === null
      ? "unknown"
      : snapshot.state === "open" && snapshot.isDraft
        ? "draft"
        : snapshot.state;
  const number = `#${link.number}`;
  const tone = ci?.status.tone ?? null;
  const checks =
    tone !== null ? CHECKS_WORD[tone] : ci?.checksState === "passing" ? CHECKS_WORD.passed : null;
  const stateLine =
    state === "unknown" ? null : `${STATE_WORD[state]}${checks === null ? "" : `, ${checks}`}`;
  const othersLine =
    input.others > 0
      ? `${input.others} more linked ${input.others === 1 ? term.singular : term.plural}`
      : null;
  const autoMerge = ci?.status.autoMerge === true;
  return {
    state,
    number,
    mark: tone === null ? null : { tone, elapsed: ci?.status.elapsed ?? null },
    autoMerge,
    label: [
      `${term.singular} ${number}`,
      ...(stateLine === null ? [] : [stateLine.toLowerCase()]),
      ...(autoMerge ? ["auto-merge is on"] : []),
      ...(othersLine === null ? [] : [othersLine]),
    ].join(", "),
    details: [
      snapshot === null ? number : `${number}: ${snapshot.title}`,
      ...(stateLine === null ? [] : [stateLine]),
      ...(ci?.status.details ?? []),
      ...(othersLine === null ? [] : [othersLine]),
    ],
  };
}

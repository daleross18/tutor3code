import type { RunId } from "@t3tools/contracts";
import { useState } from "react";

import type { MessagesTimelineRow } from "../components/chat/MessagesTimeline.logic";
import {
  applyPullRequestUpdateFolds,
  foldIsOpen,
  planPullRequestUpdateFolds,
  type PullRequestUpdateFold,
} from "./pullRequestUpdateFold";
import { useReadoutSettingsStore } from "./readoutSettings";

interface FoldState {
  readonly source: MessagesTimelineRow[] | null;
  readonly folds: ReadonlyArray<PullRequestUpdateFold>;
  /** One character for each fold: open or closed. */
  readonly openKey: string;
  readonly result: MessagesTimelineRow[];
}

/**
 * Folds the quiet update turns of a pull request watch, with the stock set of expanded runs as
 * the open state. The result keeps its array while its inputs stay the same, as the stock
 * `useStableRows` does: the list and the scroll code compare the array. With the setting off,
 * and with nothing to fold, the result is `rows` itself.
 */
export function usePullRequestUpdateFold(
  rows: MessagesTimelineRow[],
  expandedRunIds: ReadonlySet<RunId>,
  revealRowId: string | null,
): MessagesTimelineRow[] {
  const enabled = useReadoutSettingsStore((settings) => settings.foldPullRequestUpdates);
  const [state, setState] = useState<FoldState>({
    source: null,
    folds: [],
    openKey: "",
    result: [],
  });
  if (!enabled) return rows;
  const folds = state.source === rows ? state.folds : planPullRequestUpdateFolds(rows);
  const openKey = folds
    .map((fold) => (foldIsOpen(rows, fold, expandedRunIds, revealRowId) ? "1" : "0"))
    .join("");
  if (state.source === rows && state.openKey === openKey) return state.result;
  const result = applyPullRequestUpdateFolds(
    rows,
    folds,
    (fold) => openKey[folds.indexOf(fold)] === "1",
    state.result,
  );
  setState({ source: rows, folds, openKey, result });
  return result;
}

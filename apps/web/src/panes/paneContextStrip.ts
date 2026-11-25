import { use } from "react";

import { PaneCellContext, type PaneCellContextValue } from "./paneContext";
import "./paneContextStrip.css";

/**
 * Stock drops the strip under the composer (checkout mode, branch) when a thread starts, unless
 * the "composer context" setting is on. Wherever more than one pane or tab exists, a pane keeps
 * the strip, so each pane names its own checkout. One tab with one pane follows the setting.
 */
export function resolvePaneKeepsContextStrip(
  cell: Pick<PaneCellContextValue, "multi"> | null,
): boolean {
  return cell !== null && cell.multi;
}

export function usePaneKeepsContextStrip(): boolean {
  return resolvePaneKeepsContextStrip(use(PaneCellContext));
}

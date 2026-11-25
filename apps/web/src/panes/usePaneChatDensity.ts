import { resolveChatDensity, usePaneDensityStore, type ChatDensity } from "./paneDensity";
import "./paneDensity.css";

/** The density of every pane of a tab that shows `paneCount` panes. */
export function usePaneChatDensity(paneCount: number): ChatDensity {
  return usePaneDensityStore((settings) => resolveChatDensity(settings, paneCount));
}

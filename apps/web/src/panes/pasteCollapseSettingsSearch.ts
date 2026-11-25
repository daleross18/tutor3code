import type { SettingsSearchItem } from "../components/settings/settingsSearch";

/** The "Collapse long pastes" row of the fork section in Settings > Appearance. */
export const PASTE_COLLAPSE_SETTINGS_SEARCH_ITEMS = [
  {
    id: "collapse-long-pastes",
    title: "Collapse long pastes",
    to: "/settings/appearance",
    searchTerms: ["paste pasted text chip fold collapse composer clipboard long lines"],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

import type { SettingsSearchItem } from "../components/settings/settingsSearch";

/** The "Show the arcade" row of the fork section in Settings > Appearance. */
export const ARCADE_SETTINGS_SEARCH_ITEMS = [
  {
    id: "show-arcade",
    title: "Show the arcade",
    to: "/settings/appearance",
    searchTerms: ["snake shooter runner game games play sidebar bottom fun break arcade"],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

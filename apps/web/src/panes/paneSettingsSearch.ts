import type { SettingsSearchItem } from "../components/settings/settingsSearch";
import { ARCADE_SETTINGS_SEARCH_ITEMS } from "./arcadeSettingsSearch";
import { PANE_THREAD_SETTINGS_SEARCH_ITEMS } from "./paneThreadSettingsSearch";
import { PASTE_COLLAPSE_SETTINGS_SEARCH_ITEMS } from "./pasteCollapseSettingsSearch";
import { READOUT_SETTINGS_SEARCH_ITEMS } from "./readoutSettingsSearch";

/** Every row that the fork adds to Settings, for the settings search. */
export const PANE_SETTINGS_SEARCH_ITEMS = [
  {
    id: "chat-density",
    title: "Chat density",
    to: "/settings/appearance",
    searchTerms: ["compact very compact normal text size spacing timeline composer dense"],
  },
  {
    id: "split-pane-density",
    title: "Split pane density",
    to: "/settings/appearance",
    searchTerms: ["compact very compact normal text size spacing split panes grid dense"],
  },
  ...PASTE_COLLAPSE_SETTINGS_SEARCH_ITEMS,
  ...READOUT_SETTINGS_SEARCH_ITEMS,
  ...PANE_THREAD_SETTINGS_SEARCH_ITEMS,
  ...ARCADE_SETTINGS_SEARCH_ITEMS,
] as const satisfies ReadonlyArray<SettingsSearchItem>;

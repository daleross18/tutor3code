import type { SettingsSearchItem } from "../components/settings/settingsSearch";

/** The pane and preview rows of the fork section in Settings > Appearance. */
export const PANE_THREAD_SETTINGS_SEARCH_ITEMS = [
  {
    id: "release-pane-on-settle",
    title: "Free a pane when its thread settles",
    to: "/settings/appearance",
    searchTerms: ["split pane tab pull request merge merged settled new thread release"],
  },
  {
    id: "preview-url-template",
    title: "Preview links",
    to: "/settings/appearance",
    searchTerms: ["preview url template vercel branch slug pull request link deployment"],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

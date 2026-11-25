import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import { useSearchableSetting } from "../components/settings/settingsSearch";
import { Switch } from "../components/ui/switch";
import { DEFAULT_SHOW_ARCADE, useArcadeSettingsStore } from "./arcadeStore";

/** The "Show the arcade" row of the fork section in Settings > Appearance. */
export function ArcadeSettingsRow() {
  const enabled = useArcadeSettingsStore((settings) => settings.showArcade);
  const setEnabled = useArcadeSettingsStore((settings) => settings.setShowArcade);
  const search = useSearchableSetting()("show-arcade");
  return (
    <SettingsRow
      {...search}
      description="Show a small Arcade button at the bottom of the sidebar. It opens three small games in the sidebar: Snake, Shooter and Runner. Play with the arrow keys and Space."
      resetAction={
        enabled !== DEFAULT_SHOW_ARCADE ? (
          <SettingResetButton
            ariaLabel={`Reset ${search.title.toLowerCase()} to default`}
            onClick={() => setEnabled(DEFAULT_SHOW_ARCADE)}
          />
        ) : null
      }
      control={
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(Boolean(checked))}
          aria-label={search.title}
        />
      }
    />
  );
}

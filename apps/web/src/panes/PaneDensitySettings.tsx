import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import { useSearchableSetting } from "../components/settings/settingsSearch";
import {
  CHAT_DENSITIES,
  CHAT_DENSITY_LABELS,
  DEFAULT_PANE_DENSITY_SETTINGS,
  isChatDensity,
  usePaneDensityStore,
  type PaneDensitySettings,
} from "./paneDensity";

function DensityRow({
  settingKey,
  searchId,
  description,
}: {
  settingKey: keyof PaneDensitySettings;
  searchId: "chat-density" | "split-pane-density";
  description: string;
}) {
  const density = usePaneDensityStore((settings) => settings[settingKey]);
  const setDensity = usePaneDensityStore((settings) => settings.setDensity);
  const defaultDensity = DEFAULT_PANE_DENSITY_SETTINGS[settingKey];
  const search = useSearchableSetting()(searchId);
  return (
    <SettingsRow
      {...search}
      description={description}
      resetAction={
        density !== defaultDensity ? (
          <SettingResetButton
            ariaLabel={`Reset ${search.title.toLowerCase()} to default`}
            onClick={() => setDensity(settingKey, defaultDensity)}
          />
        ) : null
      }
      control={
        <div className="w-full sm:w-40">
          <Select
            value={density}
            onValueChange={(value) => {
              if (isChatDensity(value)) setDensity(settingKey, value);
            }}
          >
            <SelectTrigger size="sm" className="w-full min-w-0" aria-label={search.title}>
              <SelectValue>{CHAT_DENSITY_LABELS[density]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {CHAT_DENSITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === defaultDensity
                    ? `${CHAT_DENSITY_LABELS[value]} (default)`
                    : CHAT_DENSITY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      }
    />
  );
}

/** The two density rows of Settings > Appearance, after the stock "Chat width" row. */
export function PaneDensitySettingsRows() {
  return (
    <>
      <DensityRow
        settingKey="chatDensity"
        searchId="chat-density"
        description="Set the text size and spacing of the timeline and the composer when a tab shows one pane."
      />
      <DensityRow
        settingKey="splitPaneDensity"
        searchId="split-pane-density"
        description="Applies when a tab shows two or more panes."
      />
    </>
  );
}

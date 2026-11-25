import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import { useSearchableSetting } from "../components/settings/settingsSearch";
import { Switch } from "../components/ui/switch";
import { PASTE_COLLAPSE_MIN_CHARS, PASTE_COLLAPSE_MIN_LINES } from "./pasteCollapse";
import { DEFAULT_COLLAPSE_LONG_PASTES, usePasteCollapseSettingsStore } from "./pasteCollapseStore";

/** The "Collapse long pastes" row of the fork section in Settings > Appearance. */
export function PasteCollapseSettingsRow() {
  const enabled = usePasteCollapseSettingsStore((settings) => settings.collapseLongPastes);
  const setEnabled = usePasteCollapseSettingsStore((settings) => settings.setCollapseLongPastes);
  const search = useSearchableSetting()("collapse-long-pastes");
  return (
    <SettingsRow
      {...search}
      description={`Show a paste of more than ${PASTE_COLLAPSE_MIN_LINES} lines or ${PASTE_COLLAPSE_MIN_CHARS.toLocaleString("en-US")} characters as one chip in the composer. The message still carries the full text. Click the chip, or paste the same text again, to show it.`}
      resetAction={
        enabled !== DEFAULT_COLLAPSE_LONG_PASTES ? (
          <SettingResetButton
            ariaLabel={`Reset ${search.title.toLowerCase()} to default`}
            onClick={() => setEnabled(DEFAULT_COLLAPSE_LONG_PASTES)}
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

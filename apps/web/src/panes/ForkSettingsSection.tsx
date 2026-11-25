import { SettingsSection } from "../components/settings/settingsLayout";
import { ArcadeSettingsRow } from "./ArcadeSettingsRow";
import { PaneThreadSettingsRows } from "./PaneThreadSettings";
import { PasteCollapseSettingsRow } from "./PasteCollapseSettings";
import { ReadoutSettingsRows } from "./ReadoutSettingsRows";

/** The fork section of Settings > Appearance, after the stock section that holds the density rows. */
export function ForkSettingsSection() {
  return (
    <SettingsSection id="tutor3" title="Tutor3">
      <PasteCollapseSettingsRow />
      <ReadoutSettingsRows />
      <PaneThreadSettingsRows />
      <ArcadeSettingsRow />
    </SettingsSection>
  );
}

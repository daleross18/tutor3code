import { EnvironmentResourcesReadout } from "./EnvironmentResourcesReadout";
import { SidebarArcade } from "./SidebarArcade";
import { SidebarMusicControl } from "./SidebarMusicControl";

/** What the fork adds to the sidebar footer, above the stock utility menu. */
export function ForkSidebarFooter() {
  return (
    <>
      <SidebarArcade />
      <EnvironmentResourcesReadout />
    </>
  );
}

/** What the fork adds to the row of the stock utility buttons, after Usage. */
export function ForkSidebarUtilityItems() {
  return <SidebarMusicControl />;
}

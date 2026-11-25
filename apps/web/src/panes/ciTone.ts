import { CircleDotIcon, CircleXIcon, ShieldAlertIcon } from "lucide-react";

import type { CiTone } from "./ciStatus";

/** The mark of each CI state, the same in the sidebar row and in the chip of the bottom bar. */
export const CI_TONE_CLASS: Record<CiTone, string> = {
  failed: "text-error-foreground",
  running: "text-warning-foreground",
  approval: "text-warning-foreground",
};
export const CI_TONE_ICON = {
  failed: CircleXIcon,
  running: CircleDotIcon,
  approval: ShieldAlertIcon,
};

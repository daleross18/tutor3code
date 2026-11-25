import { useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import { XIcon } from "lucide-react";

import { Button } from "../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { shortcutLabelForCommand } from "../keybindings";
import { primaryServerKeybindingsAtom } from "../state/server";
import { closePane } from "./paneActions";

/**
 * The close button of a pane, in its top right corner. `panes.css` moves the stock controls of
 * the header to the left of it, so it is the last control of the row.
 */
export function PaneCloseButton({ paneId }: { paneId: string }) {
  const router = useRouter();
  const shortcutLabel = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "layout.closePane",
  );
  return (
    <div
      data-pane-close
      className="absolute top-0 right-2 z-50 flex h-(--workspace-topbar-height) items-center [-webkit-app-region:no-drag]"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Close pane"
              onClick={() => closePane(router, paneId)}
            />
          }
        >
          <XIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          Close pane{shortcutLabel ? ` · ${shortcutLabel}` : null}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

import { ClipboardPasteIcon } from "lucide-react";
import type { ReactElement } from "react";

import { ContextChip, ContextChipLabel } from "../components/ContextChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { PASTE_CHIP_KIND } from "./pasteCollapse";
import { expandPasteChip } from "./pasteCollapseDom";

/** The chip of a collapsed paste, drawn with the stock chip parts inside the stock chip node. */
function PasteCollapseChip({ label }: { readonly label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ContextChip
            render={<button type="button" />}
            contentEditable={false}
            spellCheck={false}
            data-paste-collapse-chip="true"
            aria-label={`${label}. Expand`}
            onClick={(event) => {
              expandPasteChip(event.currentTarget);
            }}
          />
        }
      >
        <ClipboardPasteIcon />
        <ContextChipLabel>[{label}]</ContextChipLabel>
      </TooltipTrigger>
      <TooltipPopup side="top">Click to show the pasted text</TooltipPopup>
    </Tooltip>
  );
}

/** For the fallback of the stock composer chip registry: null for every kind but the fork's. */
export function renderPasteCollapseChip(kind: string, label: string): ReactElement | null {
  return kind === PASTE_CHIP_KIND ? <PasteCollapseChip label={label} /> : null;
}

import { useAtomValue } from "@effect/atom-react";
import { pickableProjectGroups } from "@t3tools/client-runtime/state/project-grouping";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { useEnvironmentLookups } from "../components/CommandPaletteLookups";
import {
  formatShortcutLabel,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../keybindings";
import { isMacPlatform } from "../lib/utils";
import { useVisibleThreadShells } from "../state/entities";
import { useEnvironments } from "../state/environments";
import { primaryServerKeybindingsAtom } from "../state/server";
import { PaletteFilterControl } from "./PaletteFilterControl";
import { useReadoutSettingsStore } from "./readoutSettings";
import {
  buildPaletteFilterIndex,
  isPaletteFilterKey,
  isPaletteFilterSet,
  narrowPaletteItems,
  NO_PALETTE_FILTER,
  paletteFilterLabel,
  paletteFilterProjectOptions,
  resolvePaletteFilter,
  type PaletteFilter,
  type PaletteFilterIndex,
  type PaletteFilterProjectGroup,
} from "./paletteFilter";

const EMPTY_INDEX: PaletteFilterIndex = new Map();
// The stock palette pads its search field the same way for its own buttons.
const BUTTON_PADDING = "*:data-[slot=autocomplete-input]:pe-10!";
const CHIP_PADDING = "*:data-[slot=autocomplete-input]:pe-64!";
const FIND_KEY = {
  key: "f",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  modKey: true,
};

type BaseUiKeyEvent<TElement> = KeyboardEvent<TElement> & {
  preventBaseUIHandler?: () => void;
};

interface StockThreadItems<TItem> {
  readonly threadItems: ReadonlyArray<TItem>;
  readonly threadMessageItems: ReadonlyArray<TItem>;
}

/**
 * The filter by environment and project of the command palette. It takes the thread rows of the
 * stock palette and returns them narrowed, with the pieces that the palette mounts: the project
 * narrowing, the props of the search field and the filter control. The state lives in the open
 * palette, so each new opening starts with no filter.
 */
export function usePaletteFilter<
  TItem extends { readonly value: string },
  TStock extends StockThreadItems<TItem>,
>(
  stock: TStock,
  input: {
    /** The root view of the palette: no submenu and no folder browsing. */
    readonly available: boolean;
    readonly projectGroups: ReadonlyArray<
      PaletteFilterProjectGroup & { readonly pinned: boolean; readonly archived: boolean }
    >;
  },
) {
  const enabled = useReadoutSettingsStore((settings) => settings.paletteFilter);
  const available = input.available && enabled;
  const { projectGroups } = input;
  const [storedFilter, setFilter] = useState<PaletteFilter>(NO_PALETTE_FILTER);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const threads = useVisibleThreadShells();
  const { environments: connections } = useEnvironments();
  const { projectEnvironmentLocationById } = useEnvironmentLookups();

  const environments = connections.map((environment) => ({
    environmentId: environment.environmentId,
    label:
      projectEnvironmentLocationById.get(environment.environmentId)?.label ?? environment.label,
  }));
  const pickableGroups = pickableProjectGroups(projectGroups);
  const filter = available
    ? resolvePaletteFilter(storedFilter, environments, pickableGroups)
    : NO_PALETTE_FILTER;
  const index = isPaletteFilterSet(filter)
    ? buildPaletteFilterIndex({ threads, groups: projectGroups })
    : EMPTY_INDEX;

  // True when the key was taken. The button is mounted only while the stock palette shows no
  // button of its own in the search field.
  const takeFilterKey = (event: BaseUiKeyEvent<HTMLElement>): boolean => {
    if (!available || triggerRef.current === null) return false;
    const isFilterKey = isPaletteFilterKey({
      command: resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: { modelPickerOpen: false, editableFocus: true },
      }),
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing || event.keyCode === 229,
      isMac: isMacPlatform(navigator.platform),
    });
    if (!isFilterKey) return false;
    event.preventBaseUIHandler?.();
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(true);
    return true;
  };

  const accessory: ReactNode = available ? (
    <PaletteFilterControl
      filter={filter}
      label={paletteFilterLabel(filter, environments, pickableGroups)}
      environments={environments}
      projectOptions={
        new Map(
          environments.map((environment) => [
            environment.environmentId,
            paletteFilterProjectOptions(pickableGroups, environment.environmentId),
          ]),
        )
      }
      keyLabel={shortcutLabelForCommand(keybindings, "chat.find") ?? formatShortcutLabel(FIND_KEY)}
      open={menuOpen}
      onOpenChange={setMenuOpen}
      onChange={setFilter}
      triggerRef={triggerRef}
      onKeyDown={takeFilterKey}
    />
  ) : null;

  return {
    ...stock,
    threadItems: narrowPaletteItems(stock.threadItems, filter, index),
    threadMessageItems: narrowPaletteItems(stock.threadMessageItems, filter, index),
    paletteFilter: {
      narrow: <TRow extends { readonly value: string }>(items: ReadonlyArray<TRow>) =>
        narrowPaletteItems(items, filter, index),
      /** True when the key was the filter key. The stock key handler then does not run. */
      takeKey: takeFilterKey,
      /** Spread after the stock props of the search field. In the root view stock sets no class. */
      inputProps: available
        ? { className: isPaletteFilterSet(filter) ? CHIP_PADDING : BUTTON_PADDING }
        : {},
      accessory,
    },
  };
}

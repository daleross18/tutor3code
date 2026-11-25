import type { EnvironmentId } from "@t3tools/contracts";
import { CheckIcon, ListFilterIcon, XIcon } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import {
  NO_PALETTE_FILTER,
  type PaletteFilter,
  type PaletteFilterEnvironment,
} from "./paletteFilter";

const ALL = "all";

interface ProjectOption {
  readonly projectKey: string;
  readonly label: string;
}

function ProjectStep(props: {
  readonly heading: string;
  readonly environmentId: EnvironmentId;
  readonly filter: PaletteFilter;
  readonly options: ReadonlyArray<ProjectOption>;
  /** With one environment, "All projects" is no filter at all. */
  readonly allProjects: PaletteFilter;
  readonly onChange: (filter: PaletteFilter) => void;
}) {
  const selected =
    props.filter.environmentId === props.environmentId ? props.filter.projectKey : null;
  return (
    <MenuGroup>
      <MenuGroupLabel>{props.heading}</MenuGroupLabel>
      <MenuRadioGroup
        value={selected ?? ALL}
        onValueChange={(projectKey: string) =>
          props.onChange(
            projectKey === ALL
              ? props.allProjects
              : { environmentId: props.environmentId, projectKey },
          )
        }
      >
        <MenuRadioItem value={ALL} closeOnClick>
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">All projects</span>
            <MenuRadioItemIndicator />
          </span>
        </MenuRadioItem>
        {props.options.length > 0 ? <MenuSeparator /> : null}
        {props.options.map((option) => (
          <MenuRadioItem key={option.projectKey} value={option.projectKey} closeOnClick>
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <MenuRadioItemIndicator />
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </MenuGroup>
  );
}

/**
 * The filter button of the command palette, its menu, and the chip of the active filter. It sits
 * at the end of the palette's search field. With two or more environments the menu lists them,
 * and each one opens its projects. With one environment the menu lists the projects.
 */
export function PaletteFilterControl(props: {
  readonly filter: PaletteFilter;
  /** The text of the chip, or null with no filter. */
  readonly label: string | null;
  readonly environments: ReadonlyArray<PaletteFilterEnvironment>;
  readonly projectOptions: ReadonlyMap<EnvironmentId, ReadonlyArray<ProjectOption>>;
  readonly keyLabel: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChange: (filter: PaletteFilter) => void;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  /** Takes the filter key while focus is on the button, the chip or the menu. */
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const { environments, filter, label, onChange, onKeyDown, projectOptions, triggerRef } = props;
  const onlyEnvironment = environments.length === 1 ? environments[0] : undefined;
  const focusSearchField = () =>
    triggerRef.current
      ?.closest("[data-command-palette]")
      ?.querySelector<HTMLInputElement>('input:not([aria-hidden="true"])') ?? null;
  const tooltip = `Filter by environment and project (${props.keyLabel})`;

  return (
    <div
      className="absolute inset-e-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1"
      data-palette-filter={label === null ? "off" : "on"}
      onKeyDown={onKeyDown}
    >
      {label !== null ? (
        <>
          <Badge variant="outline" size="control" data-palette-filter-chip>
            <span className="max-w-44 truncate">{label}</span>
          </Badge>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear filter"
                  onClick={() => {
                    onChange(NO_PALETTE_FILTER);
                    focusSearchField()?.focus();
                  }}
                />
              }
            >
              <XIcon aria-hidden />
            </TooltipTrigger>
            <TooltipPopup side="top">Clear filter</TooltipPopup>
          </Tooltip>
        </>
      ) : null}
      <Menu open={props.open} onOpenChange={props.onOpenChange}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                ref={triggerRef}
                render={<Button variant="ghost" size="icon-xs" aria-label={tooltip} />}
              />
            }
          >
            <ListFilterIcon aria-hidden />
          </TooltipTrigger>
          <TooltipPopup side="top">{tooltip}</TooltipPopup>
        </Tooltip>
        <MenuPopup
          align="end"
          side="bottom"
          aria-label="Filter threads and projects"
          finalFocus={focusSearchField}
          onKeyDown={onKeyDown}
        >
          {onlyEnvironment ? (
            <ProjectStep
              heading="Project"
              environmentId={onlyEnvironment.environmentId}
              filter={filter}
              options={projectOptions.get(onlyEnvironment.environmentId) ?? []}
              allProjects={NO_PALETTE_FILTER}
              onChange={onChange}
            />
          ) : (
            <MenuGroup>
              <MenuGroupLabel>Environment</MenuGroupLabel>
              <MenuItem onClick={() => onChange(NO_PALETTE_FILTER)}>
                <span className="min-w-0 flex-1 truncate">All environments</span>
                {filter.environmentId === null ? <CheckIcon className="size-3.5" /> : null}
              </MenuItem>
              {environments.length > 0 ? <MenuSeparator /> : null}
              {environments.map((environment) => (
                // One Escape closes the whole control, also from the project step.
                <MenuSub key={environment.environmentId} closeParentOnEsc>
                  <MenuSubTrigger>
                    <span className="min-w-0 flex-1 truncate">{environment.label}</span>
                    {filter.environmentId === environment.environmentId ? (
                      <CheckIcon className="size-3.5" />
                    ) : null}
                  </MenuSubTrigger>
                  <MenuSubPopup>
                    <ProjectStep
                      heading={`Project in ${environment.label}`}
                      environmentId={environment.environmentId}
                      filter={filter}
                      options={projectOptions.get(environment.environmentId) ?? []}
                      allProjects={{ environmentId: environment.environmentId, projectKey: null }}
                      onChange={onChange}
                    />
                  </MenuSubPopup>
                </MenuSub>
              ))}
            </MenuGroup>
          )}
        </MenuPopup>
      </Menu>
    </div>
  );
}

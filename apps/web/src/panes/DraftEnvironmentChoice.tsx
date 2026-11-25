import {
  type EnvironmentId,
  resolveEnvironmentMachineKind,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";

import { EnvironmentMachineIcon } from "../components/EnvironmentMachineIcon";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { useScratchProject } from "../hooks/useScratchProject";
import { useClientSettings } from "../hooks/useSettings";
import { readThreadShells } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import {
  entriesOfEnvironment,
  listDraftEnvironments,
  pickEnvironmentTarget,
} from "./draftEnvironment";
import { moveDraftToProject } from "./draftEnvironmentMove";
import { useReadoutSettingsStore } from "./readoutSettings";

/** The environments of the control. Fewer than two: there is no choice, and the fork adds nothing. */
function useDraftEnvironmentOptions(activeProjectRef: ScopedProjectRef | null) {
  const enabled = useReadoutSettingsStore((settings) => settings.draftEnvironmentChoice);
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  if (!enabled || activeProjectRef === null) return [];
  return listDraftEnvironments({
    environments,
    currentEnvironmentId: activeProjectRef.environmentId,
    primaryEnvironmentId,
  });
}

/**
 * With the environment control shown, the stock project picker of a draft lists the projects of
 * the draft's environment only. Without it, the entries are the stock entries.
 */
export function useDraftEnvironmentProjects<
  TEntry extends { readonly targetProject: { readonly environmentId: EnvironmentId } },
>(
  entries: ReadonlyArray<TEntry>,
  activeProjectRef: ScopedProjectRef | null,
): ReadonlyArray<TEntry> {
  const options = useDraftEnvironmentOptions(activeProjectRef);
  return activeProjectRef !== null && options.length > 1
    ? entriesOfEnvironment(entries, activeProjectRef.environmentId)
    : entries;
}

type EnvironmentOptions = ReturnType<typeof useDraftEnvironmentOptions>;
/** The entries of the stock project picker, of every environment. */
type PickerEntries = ReadonlyArray<{
  readonly group: { readonly memberProjects: ReadonlyArray<EnvironmentProject> };
}>;

function DraftEnvironmentSelect({
  draftId,
  activeProjectRef,
  entries,
  options,
}: {
  readonly draftId: DraftId;
  readonly activeProjectRef: ScopedProjectRef;
  readonly entries: PickerEntries;
  readonly options: EnvironmentOptions;
}) {
  // The order of the stock project picker: the "first" project is the first one of that list.
  const projects = entries.flatMap((entry) => entry.group.memberProjects);
  const groupingSettings = useClientSettings(selectProjectGroupingSettings);
  const { scratchWorkspaceRootFor, openScratchProject } = useScratchProject();
  const openProjectDraft = useNewThreadHandler();

  const targetFor = (
    environmentId: EnvironmentId,
    threads: ReadonlyArray<EnvironmentThreadShell>,
  ) =>
    pickEnvironmentTarget({
      environmentId,
      current:
        projects.find(
          (project) =>
            project.environmentId === activeProjectRef.environmentId &&
            project.id === activeProjectRef.projectId,
        ) ?? null,
      projects,
      isScratch: (project) =>
        isScratchProject(project, scratchWorkspaceRootFor(project.environmentId)),
      offersScratch: scratchWorkspaceRootFor(environmentId) !== null,
      threads,
      groupingSettings,
    });

  const choose = async (environmentId: EnvironmentId) => {
    if (environmentId === activeProjectRef.environmentId) return;
    // Read at the click: the hero must not render again for each thread update.
    const target = targetFor(environmentId, readThreadShells());
    if (target.kind === "none") return;
    const { getDraftSession } = useComposerDraftStore.getState();
    const requestedFrom = getDraftSession(draftId);
    const project =
      target.kind === "project"
        ? target.project
        : await openScratchProject(environmentId, "Could not switch machine");
    // The draft can change while the environment opens its "No project" workspace.
    if (!project || getDraftSession(draftId) !== requestedFrom) return;
    await moveDraftToProject({
      draftId,
      project,
      logicalProjectKey: deriveLogicalProjectKeyFromSettings(project, groupingSettings),
      openProjectDraft,
    });
  };

  const active = options.find((option) => option.environmentId === activeProjectRef.environmentId);
  return (
    <p className="mt-2 flex h-6 w-full items-center justify-center gap-1 text-muted-foreground text-sm">
      <span>on</span>
      <Select
        modal={false}
        value={activeProjectRef.environmentId}
        onValueChange={(environmentId) => {
          if (environmentId) void choose(environmentId);
        }}
        items={options.map((option) => ({ value: option.environmentId, label: option.label }))}
      >
        <SelectTrigger
          variant="ghost"
          size="xs"
          aria-label="Environment"
          data-draft-environment-trigger=""
          className="pointer-events-auto min-w-0 max-w-full"
        >
          <EnvironmentMachineIcon
            kind={resolveEnvironmentMachineKind(active?.serverConfig ?? null)}
            className="size-3 shrink-0"
          />
          <SelectValue />
        </SelectTrigger>
        <SelectPopup alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectGroupLabel>Run on</SelectGroupLabel>
            {options.map((option) => (
              <SelectItem
                key={option.environmentId}
                value={option.environmentId}
                disabled={targetFor(option.environmentId, []).kind === "none"}
              >
                <span className="inline-flex items-center gap-1.5">
                  <EnvironmentMachineIcon
                    kind={resolveEnvironmentMachineKind(option.serverConfig ?? null)}
                    className="size-3"
                  />
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectPopup>
      </Select>
    </p>
  );
}

/**
 * The environment control of the new thread screen (hunk set `r7-draft-environment`). A choice
 * moves the draft to that environment, and the project follows.
 */
export function DraftEnvironmentChoice({
  draftId,
  activeProjectRef,
  entries,
}: {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly entries: PickerEntries;
}) {
  const options = useDraftEnvironmentOptions(activeProjectRef);
  if (draftId === null || activeProjectRef === null || options.length < 2) return null;
  return (
    <DraftEnvironmentSelect
      draftId={draftId}
      activeProjectRef={activeProjectRef}
      entries={entries}
      options={options}
    />
  );
}

import type { EnvironmentId } from "@t3tools/contracts";

/** The filter of the command palette. A project is set only together with its environment. */
export interface PaletteFilter {
  readonly environmentId: EnvironmentId | null;
  /** The key of a project group, as the sidebar and the palette group projects. */
  readonly projectKey: string | null;
}

export const NO_PALETTE_FILTER: PaletteFilter = { environmentId: null, projectKey: null };

export interface PaletteFilterEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}

export interface PaletteFilterProjectGroup {
  readonly projectKey: string;
  readonly displayName: string;
  readonly memberProjectRefs: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly projectId: string;
  }>;
}

interface PaletteFilterThread {
  readonly environmentId: EnvironmentId;
  readonly id: string;
  readonly projectId: string;
}

/** What a thread row or a project row of the palette stands for. */
interface PaletteFilterSubject {
  readonly environmentIds: ReadonlyArray<EnvironmentId>;
  readonly projectKey: string | null;
}

export type PaletteFilterIndex = ReadonlyMap<string, PaletteFilterSubject>;

export function isPaletteFilterSet(filter: PaletteFilter): boolean {
  return filter.environmentId !== null;
}

/**
 * Maps the `value` of each thread row (`thread:<environment>:<thread>`) and each project row
 * (`project:<environment>:<project>`) of the stock palette to its environment and project group.
 * A project row stands for its whole group, which can have a copy in several environments.
 */
export function buildPaletteFilterIndex(input: {
  readonly threads: ReadonlyArray<PaletteFilterThread>;
  readonly groups: ReadonlyArray<PaletteFilterProjectGroup>;
}): PaletteFilterIndex {
  const index = new Map<string, PaletteFilterSubject>();
  const projectKeyByRef = new Map<string, string>();
  for (const group of input.groups) {
    const environmentIds = [...new Set(group.memberProjectRefs.map((ref) => ref.environmentId))];
    for (const ref of group.memberProjectRefs) {
      const refKey = `${ref.environmentId}:${ref.projectId}`;
      projectKeyByRef.set(refKey, group.projectKey);
      index.set(`project:${refKey}`, { environmentIds, projectKey: group.projectKey });
    }
  }
  for (const thread of input.threads) {
    index.set(`thread:${thread.environmentId}:${thread.id}`, {
      environmentIds: [thread.environmentId],
      projectKey: projectKeyByRef.get(`${thread.environmentId}:${thread.projectId}`) ?? null,
    });
  }
  return index;
}

/**
 * Keeps the rows of the filter's environment and project. A row that the index does not know
 * (a command, a setting) stays. With no filter the input list is returned as it is.
 */
export function narrowPaletteItems<TItem extends { readonly value: string }>(
  items: ReadonlyArray<TItem>,
  filter: PaletteFilter,
  index: PaletteFilterIndex,
): ReadonlyArray<TItem> {
  const { environmentId, projectKey } = filter;
  if (environmentId === null) return items;
  return items.filter((item) => {
    const subject = index.get(item.value);
    if (subject === undefined) return true;
    if (!subject.environmentIds.includes(environmentId)) return false;
    return projectKey === null || subject.projectKey === projectKey;
  });
}

/** The project step: the project groups with a copy in that environment, in the given order. */
export function paletteFilterProjectOptions(
  groups: ReadonlyArray<PaletteFilterProjectGroup>,
  environmentId: EnvironmentId,
): ReadonlyArray<{ readonly projectKey: string; readonly label: string }> {
  return groups
    .filter((group) => group.memberProjectRefs.some((ref) => ref.environmentId === environmentId))
    .map((group) => ({ projectKey: group.projectKey, label: group.displayName }));
}

/** Drops an environment that left and a project that is no longer in the environment. */
export function resolvePaletteFilter(
  filter: PaletteFilter,
  environments: ReadonlyArray<PaletteFilterEnvironment>,
  groups: ReadonlyArray<PaletteFilterProjectGroup>,
): PaletteFilter {
  const { environmentId, projectKey } = filter;
  if (
    environmentId === null ||
    !environments.some((environment) => environment.environmentId === environmentId)
  ) {
    return NO_PALETTE_FILTER;
  }
  if (projectKey === null) return filter;
  const inEnvironment = paletteFilterProjectOptions(groups, environmentId).some(
    (option) => option.projectKey === projectKey,
  );
  return inEnvironment ? filter : { environmentId, projectKey: null };
}

/**
 * The text of the chip. With one environment the environment is not named, because the control
 * then offers the project step only.
 */
export function paletteFilterLabel(
  filter: PaletteFilter,
  environments: ReadonlyArray<PaletteFilterEnvironment>,
  groups: ReadonlyArray<PaletteFilterProjectGroup>,
): string | null {
  const environment = environments.find(
    (candidate) => candidate.environmentId === filter.environmentId,
  );
  if (!environment) return null;
  const project = groups.find((group) => group.projectKey === filter.projectKey)?.displayName;
  if (environments.length <= 1) return project ?? environment.label;
  return project === undefined ? environment.label : `${environment.label} › ${project}`;
}

/**
 * The key that opens the filter while the palette input has focus: the key of the stock find
 * command, which the stock palette answers by closing itself, and a plain `mod+f` that no rule
 * owns. A key that the user gave to another command is left to that command.
 */
export function isPaletteFilterKey(input: {
  /** The command that the stock palette resolves for this key press. */
  readonly command: string | null;
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  readonly isMac: boolean;
}): boolean {
  if (input.isComposing) return false;
  if (input.command === "chat.find") return true;
  if (input.command !== null || input.altKey || input.shiftKey) return false;
  const mod = input.isMac ? input.metaKey && !input.ctrlKey : input.ctrlKey && !input.metaKey;
  return mod && input.key.toLowerCase() === "f";
}

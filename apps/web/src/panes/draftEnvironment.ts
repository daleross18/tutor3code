import type { EnvironmentId } from "@t3tools/contracts";
import {
  deriveLogicalProjectKeyFromSettings,
  type ProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";

type RuleProject = Pick<
  EnvironmentProject,
  "environmentId" | "id" | "workspaceRoot" | "repositoryIdentity" | "isScratch" | "archivedAt"
>;
type RuleThread = Pick<
  EnvironmentThreadShell,
  "environmentId" | "projectId" | "latestUserMessageAt" | "createdAt"
>;

/** What a draft opens in the environment that the user chose. */
export type DraftEnvironmentTarget<TProject> =
  | { readonly kind: "project"; readonly project: TProject }
  /** "No project" in that environment. */
  | { readonly kind: "scratch" }
  /** The environment has no project and offers no "No project" workspace. */
  | { readonly kind: "none" };

// The same repository is the same project, also when the sidebar keeps its projects apart.
const REPOSITORY_GROUPING: ProjectGroupingSettings = {
  sidebarProjectGroupingMode: "repository",
  sidebarProjectGroupingOverrides: {},
};

/**
 * The environments that a draft can move to: each connected one, and the one the draft is in.
 * The app's own environment is first, then by name, as in the stock "Run on" list.
 */
export function listDraftEnvironments<
  TEnvironment extends {
    readonly environmentId: EnvironmentId;
    readonly label: string;
    readonly connection: { readonly phase: string };
  },
>(input: {
  readonly environments: ReadonlyArray<TEnvironment>;
  readonly currentEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): TEnvironment[] {
  const isPrimary = (environment: TEnvironment) =>
    environment.environmentId === input.primaryEnvironmentId;
  return input.environments
    .filter(
      (environment) =>
        environment.connection.phase === "connected" ||
        environment.environmentId === input.currentEnvironmentId,
    )
    .toSorted((left, right) =>
      isPrimary(left) === isPrimary(right)
        ? left.label.localeCompare(right.label)
        : isPrimary(left)
          ? -1
          : 1,
    );
}

/**
 * The project of a draft that moves to `environmentId`: the same project there, else the project
 * that the user wrote to last there, else the first one. A draft with no project keeps none.
 */
export function pickEnvironmentTarget<TProject extends RuleProject>(input: {
  readonly environmentId: EnvironmentId;
  /** The project of the draft. Null: the client does not know it. */
  readonly current: TProject | null;
  /** Every project of the client, in the order of the stock project picker. */
  readonly projects: ReadonlyArray<TProject>;
  readonly isScratch: (project: TProject) => boolean;
  /** The target environment has a workspace for a thread with no project. */
  readonly offersScratch: boolean;
  readonly threads: ReadonlyArray<RuleThread>;
  readonly groupingSettings: ProjectGroupingSettings;
}): DraftEnvironmentTarget<TProject> {
  const { current, environmentId, isScratch } = input;
  const currentIsScratch = current !== null && isScratch(current);
  if (currentIsScratch && input.offersScratch) return { kind: "scratch" };

  const candidates = input.projects.filter(
    (project) =>
      project.environmentId === environmentId && project.archivedAt == null && !isScratch(project),
  );
  const lastUsedAt = new Map<string, number>();
  for (const thread of input.threads) {
    if (thread.environmentId !== environmentId) continue;
    const at = Date.parse(thread.latestUserMessageAt ?? thread.createdAt);
    if (Number.isFinite(at) && at > (lastUsedAt.get(thread.projectId) ?? -Infinity)) {
      lastUsedAt.set(thread.projectId, at);
    }
  }
  // The project used last, else the first in the order of the project picker.
  const best = (projects: ReadonlyArray<TProject>): TProject | null => {
    let picked: TProject | null = null;
    let pickedAt = -Infinity;
    for (const project of projects) {
      const at = lastUsedAt.get(project.id) ?? -Infinity;
      if (picked === null || at > pickedAt) {
        picked = project;
        pickedAt = at;
      }
    }
    return picked;
  };

  if (current !== null && !currentIsScratch) {
    for (const settings of [input.groupingSettings, REPOSITORY_GROUPING]) {
      const key = deriveLogicalProjectKeyFromSettings(current, settings);
      const same = best(
        candidates.filter(
          (project) => deriveLogicalProjectKeyFromSettings(project, settings) === key,
        ),
      );
      if (same !== null) return { kind: "project", project: same };
    }
  }
  const project = best(candidates);
  if (project !== null) return { kind: "project", project };
  return input.offersScratch ? { kind: "scratch" } : { kind: "none" };
}

/** The entries of the stock project picker that are a project of the draft's environment. */
export function entriesOfEnvironment<
  TEntry extends { readonly targetProject: { readonly environmentId: EnvironmentId } },
>(entries: ReadonlyArray<TEntry>, environmentId: EnvironmentId): TEntry[] {
  return entries.filter((entry) => entry.targetProject.environmentId === environmentId);
}

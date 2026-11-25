import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { ProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import { describe, expect, it } from "vite-plus/test";

import {
  entriesOfEnvironment,
  listDraftEnvironments,
  pickEnvironmentTarget,
} from "./draftEnvironment";

const MAC = EnvironmentId.make("mac");
const BOX = EnvironmentId.make("dale-nix");

const repository = (name: string) => ({
  canonicalKey: `github.com/tutor/${name}`,
  locator: {
    source: "git-remote" as const,
    remoteName: "origin",
    remoteUrl: `https://github.com/tutor/${name}.git`,
  },
});

function project(
  environmentId: EnvironmentId,
  id: string,
  repositoryName: string | null,
  overrides: { archivedAt?: string; isScratch?: true } = {},
) {
  return {
    environmentId,
    id: ProjectId.make(id),
    workspaceRoot: `/${environmentId}/${id}`,
    repositoryIdentity: repositoryName === null ? null : repository(repositoryName),
    archivedAt: null,
    ...overrides,
  };
}

const thread = (
  environmentId: EnvironmentId,
  projectId: string,
  latestUserMessageAt: string | null,
  createdAt = "2026-11-01T00:00:00.000Z",
) => ({ environmentId, projectId: ProjectId.make(projectId), latestUserMessageAt, createdAt });

const grouping = (
  mode: ProjectGroupingSettings["sidebarProjectGroupingMode"] = "repository",
): ProjectGroupingSettings => ({
  sidebarProjectGroupingMode: mode,
  sidebarProjectGroupingOverrides: {},
});

const macCodebase = project(MAC, "mac-codebase", "codebase");
const boxCodebase = project(BOX, "box-codebase", "codebase");
const boxTutor3 = project(BOX, "box-tutor3", "tutor3code");
const boxNotes = project(BOX, "box-notes", null);

type TestProject = ReturnType<typeof project>;

function pick(input: {
  current: TestProject | null;
  projects: ReadonlyArray<TestProject>;
  threads?: ReadonlyArray<ReturnType<typeof thread>>;
  offersScratch?: boolean;
  mode?: ProjectGroupingSettings["sidebarProjectGroupingMode"];
}) {
  const target = pickEnvironmentTarget({
    environmentId: BOX,
    current: input.current,
    projects: input.projects,
    isScratch: (candidate) => candidate.isScratch === true,
    offersScratch: input.offersScratch ?? false,
    threads: input.threads ?? [],
    groupingSettings: grouping(input.mode),
  });
  return target.kind === "project" ? target.project.id : target.kind;
}

describe("pickEnvironmentTarget", () => {
  it("keeps the same repository, also when another project there was used later", () => {
    expect(
      pick({
        current: macCodebase,
        projects: [macCodebase, boxTutor3, boxCodebase],
        threads: [thread(BOX, "box-tutor3", "2026-11-19T10:00:00.000Z")],
      }),
    ).toBe("box-codebase");
  });

  it("keeps the same repository when the sidebar keeps each project apart", () => {
    expect(
      pick({ current: macCodebase, projects: [boxTutor3, boxCodebase], mode: "separate" }),
    ).toBe("box-codebase");
  });

  it("takes the clone that was used last when the environment has two of the repository", () => {
    const secondClone = project(BOX, "box-codebase-2", "codebase");
    expect(
      pick({
        current: macCodebase,
        projects: [boxCodebase, secondClone],
        threads: [
          thread(BOX, "box-codebase", "2026-11-18T10:00:00.000Z"),
          thread(BOX, "box-codebase-2", "2026-11-19T10:00:00.000Z"),
        ],
      }),
    ).toBe("box-codebase-2");
  });

  it("takes the project that the user wrote to last when the repository is not there", () => {
    expect(
      pick({
        current: macCodebase,
        projects: [boxNotes, boxTutor3],
        threads: [
          thread(BOX, "box-notes", "2026-11-17T10:00:00.000Z"),
          thread(BOX, "box-tutor3", "2026-11-18T10:00:00.000Z"),
          // A thread of another environment and a thread with no message do not count more.
          thread(MAC, "box-notes", "2026-11-19T10:00:00.000Z"),
          thread(BOX, "box-notes", null, "2026-11-16T10:00:00.000Z"),
        ],
      }),
    ).toBe("box-tutor3");
  });

  it("counts a thread with no message from its creation time", () => {
    expect(
      pick({
        current: macCodebase,
        projects: [boxNotes, boxTutor3],
        threads: [
          thread(BOX, "box-notes", "2026-11-17T10:00:00.000Z"),
          thread(BOX, "box-tutor3", null, "2026-11-18T10:00:00.000Z"),
        ],
      }),
    ).toBe("box-tutor3");
  });

  it("takes the first project of the picker order when no project there was used", () => {
    expect(pick({ current: macCodebase, projects: [boxNotes, boxTutor3] })).toBe("box-notes");
    expect(pick({ current: null, projects: [boxTutor3, boxNotes] })).toBe("box-tutor3");
  });

  it("skips an archived project and the workspace of threads with no project", () => {
    expect(
      pick({
        current: macCodebase,
        projects: [
          project(BOX, "box-codebase", "codebase", { archivedAt: "2026-11-01T00:00:00.000Z" }),
          project(BOX, "box-scratch", null, { isScratch: true }),
          boxTutor3,
        ],
        threads: [thread(BOX, "box-scratch", "2026-11-19T10:00:00.000Z")],
      }),
    ).toBe("box-tutor3");
  });

  it("keeps a draft with no project without a project, where the environment offers that", () => {
    const macScratch = project(MAC, "mac-scratch", null, { isScratch: true });
    const projects = [macScratch, boxTutor3];
    expect(pick({ current: macScratch, projects, offersScratch: true })).toBe("scratch");
    expect(pick({ current: macScratch, projects })).toBe("box-tutor3");
  });

  it("opens no project in an environment with none, or nothing when that is not offered", () => {
    expect(pick({ current: macCodebase, projects: [macCodebase], offersScratch: true })).toBe(
      "scratch",
    );
    expect(pick({ current: macCodebase, projects: [macCodebase] })).toBe("none");
  });
});

describe("listDraftEnvironments", () => {
  const environment = (id: string, label: string, phase: string) => ({
    environmentId: EnvironmentId.make(id),
    label,
    connection: { phase },
  });

  it("lists each connected environment and the draft's own, with the app's own first", () => {
    const listed = listDraftEnvironments({
      environments: [
        environment("zeta", "zeta", "connected"),
        environment("offline", "offline", "disconnected"),
        environment("draft", "draft-env", "connecting"),
        environment("dale-nix", "dale-nix", "connected"),
        environment("mac", "This device", "connected"),
      ],
      currentEnvironmentId: EnvironmentId.make("draft"),
      primaryEnvironmentId: MAC,
    });
    expect(listed.map((entry) => entry.label)).toEqual([
      "This device",
      "dale-nix",
      "draft-env",
      "zeta",
    ]);
  });
});

describe("entriesOfEnvironment", () => {
  it("keeps the picker entries whose project is in the draft's environment", () => {
    const entries = [macCodebase, boxCodebase, boxTutor3].map((targetProject) => ({
      targetProject,
    }));
    expect(entriesOfEnvironment(entries, BOX).map((entry) => entry.targetProject.id)).toEqual([
      "box-codebase",
      "box-tutor3",
    ]);
  });
});

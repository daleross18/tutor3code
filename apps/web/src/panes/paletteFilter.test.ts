import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildPaletteFilterIndex,
  isPaletteFilterKey,
  narrowPaletteItems,
  NO_PALETTE_FILTER,
  paletteFilterLabel,
  paletteFilterProjectOptions,
  resolvePaletteFilter,
  type PaletteFilter,
} from "./paletteFilter";

const LOCAL = EnvironmentId.make("local");
const BOX = EnvironmentId.make("box");
const ENVIRONMENTS = [
  { environmentId: LOCAL, label: "Local" },
  { environmentId: BOX, label: "dale-nix" },
];
// "codebase" has a copy in both environments. "notes" is local only, "infra" is on the box only.
const GROUPS = [
  {
    projectKey: "repo:codebase",
    displayName: "codebase",
    memberProjectRefs: [
      { environmentId: LOCAL, projectId: "codebase-local" },
      { environmentId: BOX, projectId: "codebase-box" },
    ],
  },
  {
    projectKey: "path:notes",
    displayName: "notes",
    memberProjectRefs: [{ environmentId: LOCAL, projectId: "notes" }],
  },
  {
    projectKey: "path:infra",
    displayName: "infra",
    memberProjectRefs: [{ environmentId: BOX, projectId: "infra" }],
  },
];
const INDEX = buildPaletteFilterIndex({
  groups: GROUPS,
  threads: [
    { environmentId: LOCAL, id: "t-code-local", projectId: "codebase-local" },
    { environmentId: BOX, id: "t-code-box", projectId: "codebase-box" },
    { environmentId: LOCAL, id: "t-notes", projectId: "notes" },
    { environmentId: BOX, id: "t-infra", projectId: "infra" },
    { environmentId: BOX, id: "t-no-group", projectId: "scratch" },
  ],
});
// The rows as the stock palette names them. The project row of a group names its target copy.
const ROWS = [
  "action:new-thread",
  "setting:theme",
  "thread:local:t-code-local",
  "thread:box:t-code-box",
  "thread:local:t-notes",
  "thread:box:t-infra",
  "thread:box:t-no-group",
  "project:local:codebase-local",
  "project:local:notes",
  "project:box:infra",
].map((value) => ({ value }));

const kept = (filter: PaletteFilter) =>
  narrowPaletteItems(ROWS, filter, INDEX).map((row) => row.value);

describe("narrowPaletteItems", () => {
  it("returns the stock list itself with no filter", () => {
    expect(narrowPaletteItems(ROWS, NO_PALETTE_FILTER, INDEX)).toBe(ROWS);
  });

  it.each([
    {
      name: "an environment keeps its threads and each project with a copy in it",
      filter: { environmentId: BOX, projectKey: null },
      rows: [
        "action:new-thread",
        "setting:theme",
        "thread:box:t-code-box",
        "thread:box:t-infra",
        "thread:box:t-no-group",
        "project:local:codebase-local",
        "project:box:infra",
      ],
    },
    {
      name: "a project keeps its threads of that environment only",
      filter: { environmentId: BOX, projectKey: "repo:codebase" },
      rows: [
        "action:new-thread",
        "setting:theme",
        "thread:box:t-code-box",
        "project:local:codebase-local",
      ],
    },
    {
      name: "a project of the other environment",
      filter: { environmentId: LOCAL, projectKey: "path:notes" },
      rows: ["action:new-thread", "setting:theme", "thread:local:t-notes", "project:local:notes"],
    },
  ])("$name", ({ filter, rows }) => {
    expect(kept(filter)).toEqual(rows);
  });
});

describe("the options and the chip", () => {
  it("lists only the projects of the chosen environment", () => {
    expect(paletteFilterProjectOptions(GROUPS, BOX).map((option) => option.label)).toEqual([
      "codebase",
      "infra",
    ]);
    expect(paletteFilterProjectOptions(GROUPS, LOCAL).map((option) => option.label)).toEqual([
      "codebase",
      "notes",
    ]);
  });

  it("drops an environment that left and a project that is not in the environment", () => {
    const gone = { environmentId: EnvironmentId.make("gone"), projectKey: "repo:codebase" };
    expect(resolvePaletteFilter(gone, ENVIRONMENTS, GROUPS)).toEqual(NO_PALETTE_FILTER);
    expect(
      resolvePaletteFilter({ environmentId: BOX, projectKey: "path:notes" }, ENVIRONMENTS, GROUPS),
    ).toEqual({ environmentId: BOX, projectKey: null });
    const set = { environmentId: BOX, projectKey: "path:infra" };
    expect(resolvePaletteFilter(set, ENVIRONMENTS, GROUPS)).toBe(set);
  });

  it("names the environment in the chip only when there are two or more", () => {
    const project = { environmentId: BOX, projectKey: "path:infra" };
    expect(paletteFilterLabel(NO_PALETTE_FILTER, ENVIRONMENTS, GROUPS)).toBeNull();
    expect(paletteFilterLabel({ ...project, projectKey: null }, ENVIRONMENTS, GROUPS)).toBe(
      "dale-nix",
    );
    expect(paletteFilterLabel(project, ENVIRONMENTS, GROUPS)).toBe("dale-nix › infra");
    expect(paletteFilterLabel(project, [ENVIRONMENTS[1]!], GROUPS)).toBe("infra");
  });
});

describe("isPaletteFilterKey", () => {
  const press = (
    change: Partial<Parameters<typeof isPaletteFilterKey>[0]>,
  ): Parameters<typeof isPaletteFilterKey>[0] => ({
    command: null,
    key: "f",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    isMac: false,
    ...change,
  });

  it.each([
    { name: "the key of the stock find command", press: { command: "chat.find", key: "g" } },
    { name: "Ctrl+F that no rule owns", press: { ctrlKey: true } },
    { name: "Cmd+F on macOS that no rule owns", press: { metaKey: true, isMac: true } },
  ])("takes $name", ({ press: change }) => {
    expect(isPaletteFilterKey(press(change))).toBe(true);
  });

  it.each([
    { name: "a plain f", press: {} },
    {
      name: "mod+f that the user gave to another command",
      press: { ctrlKey: true, command: "chat.new" },
    },
    { name: "mod+shift+f", press: { ctrlKey: true, shiftKey: true } },
    { name: "Ctrl+F on macOS", press: { ctrlKey: true, isMac: true } },
    {
      name: "the find key during text composition",
      press: { command: "chat.find", isComposing: true },
    },
    { name: "another key", press: { ctrlKey: true, key: "k" } },
  ])("leaves $name", ({ press: change }) => {
    expect(isPaletteFilterKey(press(change))).toBe(false);
  });
});

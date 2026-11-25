import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { useRef, useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { openCommandPalette } from "~/commandPaletteBus";
import { CommandDialog, CommandDialogPopup } from "~/components/ui/command";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { serveThreadProjects } from "../../test/paneThreadShell";
import { render } from "../../test/render";
import {
  NO_PALETTE_FILTER,
  paletteFilterLabel,
  paletteFilterProjectOptions,
} from "./paletteFilter";
import { PaletteFilterControl } from "./PaletteFilterControl";
import { usePaneStore } from "./paneStore";
import { createInitialLayout } from "./paneTree";

// The socket is faked; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver: driver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, driver) };
});

// The fake environment does not serve project files, and a new draft waits for that read.
vi.mock(import("~/lib/t3ProjectFileDefaults"), () => ({
  readT3ProjectFile: () => Promise.resolve(null),
}));

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const NOTES = ProjectId.make("project-notes");

// A file of its own: the app keeps the thread list that the first test of a file loaded.
function setup(threads: ReadonlyArray<FakeThread>) {
  usePaneStore.setState({ layout: createInitialLayout(), lastRouteKey: null, fillingPaneIds: [] });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  return installFakeEnvironment(threads, { extraProjects: [{ id: NOTES, title: "notes" }] });
}

async function openThread(thread: FakeThread) {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(
    await render(<AppRoot router={router} />, {
      // AppRoot brings its own router.
      router: false,
    }),
  );
  await expect.element(page.getByText(`Answer 0 for ${thread.id}.`)).toBeVisible();
  return stack.move();
}

it("the find key opens the palette filter, a project narrows the threads, and Escape closes the filter first", async () => {
  const open = threadWithHistory("filter-open", 1);
  const render1 = threadWithHistory("filter-render", 1);
  const notes = threadWithHistory("filter-notes", 1);
  using _environment = setup([open, render1, notes]);
  using _projects = serveThreadProjects(new Map([[notes, NOTES]]));
  await page.viewport(1500, 800);
  await using _app = await openThread(open);

  const palette = page.getByTestId("command-palette");
  const searchField = () =>
    document.querySelector<HTMLInputElement>('[data-testid="command-palette"] input');
  const threadRows = () =>
    [...document.querySelectorAll('[data-testid="command-palette"] [data-slot="command-item"]')]
      .map((row) => /Thread filter-(?:open|render|notes)/.exec(row.textContent ?? "")?.[0])
      .filter((title) => title !== undefined)
      .toSorted();
  // A project row shows the folder of its project. A "New thread in" suggestion shows it too.
  const projectRows = () =>
    [...document.querySelectorAll('[data-testid="command-palette"] [data-slot="command-item"]')]
      .map((row) => row.textContent ?? "")
      .filter((text) => !text.includes("New thread in"))
      .map((text) => /\/workspace\/(render|notes)/.exec(text)?.[1])
      .filter((title) => title !== undefined)
      .toSorted();

  openCommandPalette({});
  await expect.element(palette).toBeVisible();
  await userEvent.keyboard("Thread filter");
  await vi.waitFor(() =>
    expect(threadRows()).toEqual([
      "Thread filter-notes",
      "Thread filter-open",
      "Thread filter-render",
    ]),
  );
  expect(document.querySelector("[data-palette-filter]")?.getAttribute("data-palette-filter")).toBe(
    "off",
  );

  // The key: the palette stays, the stock find bar and its toast do not show, the menu opens.
  await userEvent.keyboard("{ControlOrMeta>}f{/ControlOrMeta}");
  const allProjects = page.getByRole("menuitemradio", { name: "All projects" });
  await expect.element(allProjects).toBeVisible();
  await expect.element(palette).toBeVisible();
  expect(document.querySelector("[data-thread-find-bar]")).toBeNull();
  expect(document.body.textContent).not.toContain("Thread search is unavailable");
  // One environment: the menu offers the project step only.
  expect(document.querySelector('[role="menu"]')?.textContent).not.toContain("All environments");
  await expect.element(page.getByRole("menuitemradio", { name: "render" })).toBeVisible();

  // The keyboard chooses "notes": a typed letter moves to it, and Enter takes it.
  const notesItem = page.getByRole("menuitemradio", { name: "notes" });
  await userEvent.keyboard("n");
  await expect.element(notesItem).toHaveAttribute("data-highlighted");
  await userEvent.keyboard("{Enter}");
  await expect.element(allProjects).not.toBeInTheDocument();
  await vi.waitFor(() => expect(threadRows()).toEqual(["Thread filter-notes"]));
  expect(document.querySelector("[data-palette-filter-chip]")?.textContent).toBe("notes");
  await vi.waitFor(() => expect(document.activeElement).toBe(searchField()));
  expect(searchField()?.value).toBe("Thread filter");

  // The key opens the control again, and the arrows move in it. Escape closes the control only.
  await userEvent.keyboard("{ControlOrMeta>}f{/ControlOrMeta}");
  await expect.element(notesItem).toHaveAttribute("aria-checked", "true");
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(allProjects).toHaveAttribute("data-highlighted");
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(allProjects).not.toHaveAttribute("data-highlighted");
  await userEvent.keyboard("{Escape}");
  await expect.element(notesItem).not.toBeInTheDocument();
  await expect.element(palette).toBeVisible();
  await vi.waitFor(() => expect(document.activeElement).toBe(searchField()));
  expect(threadRows()).toEqual(["Thread filter-notes"]);

  // A second Escape closes the palette, and the next opening has no filter.
  await userEvent.keyboard("{Escape}");
  await expect.element(palette).not.toBeInTheDocument();
  openCommandPalette({});
  await expect.element(palette).toBeVisible();
  await userEvent.keyboard("Thread filter");
  await vi.waitFor(() => expect(threadRows()).toHaveLength(3));
  expect(document.querySelector("[data-palette-filter-chip]")).toBeNull();

  // The button opens the same control. Project rows narrow too, and the chip clears the filter.
  await page.getByRole("button", { name: "Filter by environment and project (Ctrl+F)" }).click();
  await page.getByRole("menuitemradio", { name: "render" }).click();
  await vi.waitFor(() =>
    expect(threadRows()).toEqual(["Thread filter-open", "Thread filter-render"]),
  );
  await userEvent.fill(searchField()!, "workspace");
  await vi.waitFor(() => expect(projectRows()).toEqual(["render"]));
  await page.getByRole("button", { name: "Clear filter" }).click();
  await vi.waitFor(() => expect(projectRows()).toEqual(["notes", "render"]));
  expect(document.querySelector("[data-palette-filter-chip]")).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(searchField()));
});

const LOCAL = EnvironmentId.make("local");
const BOX = EnvironmentId.make("box");
const ENVIRONMENTS = [
  { environmentId: LOCAL, label: "Local" },
  { environmentId: BOX, label: "dale-nix" },
];
const GROUPS = [
  {
    projectKey: "codebase",
    displayName: "codebase",
    memberProjectRefs: [
      { environmentId: LOCAL, projectId: "codebase-local" },
      { environmentId: BOX, projectId: "codebase-box" },
    ],
  },
  {
    projectKey: "notes",
    displayName: "notes",
    memberProjectRefs: [{ environmentId: LOCAL, projectId: "notes" }],
  },
  {
    projectKey: "infra",
    displayName: "infra",
    memberProjectRefs: [{ environmentId: BOX, projectId: "infra" }],
  },
];

// The control in a stock palette dialog. The fake environment is one environment, so the
// environment step runs here with two.
function TwoEnvironmentPalette() {
  const [filter, setFilter] = useState(NO_PALETTE_FILTER);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandDialogPopup aria-label="Command palette" data-command-palette="true">
        <div className="relative">
          <input aria-label="Search" />
          <PaletteFilterControl
            filter={filter}
            label={paletteFilterLabel(filter, ENVIRONMENTS, GROUPS)}
            environments={ENVIRONMENTS}
            projectOptions={
              new Map(
                ENVIRONMENTS.map((environment) => [
                  environment.environmentId,
                  paletteFilterProjectOptions(GROUPS, environment.environmentId),
                ]),
              )
            }
            keyLabel="Ctrl+F"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onChange={setFilter}
            triggerRef={triggerRef}
            onKeyDown={() => {}}
          />
        </div>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

it("with two environments the menu lists them, an environment opens its projects, and one Escape closes both lists", async () => {
  await using _screen = await render(<TwoEnvironmentPalette />);
  const searchField = page.getByRole("textbox", { name: "Search" });
  const filterButton = page.getByRole("button", { name: /^Filter by environment and project/ });
  const allEnvironments = page.getByRole("menuitem", { name: "All environments" });
  const box = page.getByRole("menuitem", { name: "dale-nix" });
  const projects = () =>
    [...document.querySelectorAll('[role="menuitemradio"]')].map((item) => item.textContent);

  await filterButton.click();
  await expect.element(allEnvironments).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "Local" })).toBeVisible();

  // The keyboard: a typed letter moves to the environment, Enter opens its projects.
  await userEvent.keyboard("d");
  await expect.element(box).toHaveAttribute("data-highlighted");
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(projects()).toEqual(["All projects", "codebase", "infra"]));
  await userEvent.keyboard("i");
  await expect
    .element(page.getByRole("menuitemradio", { name: "infra" }))
    .toHaveAttribute("data-highlighted");
  await userEvent.keyboard("{Enter}");
  await expect.element(allEnvironments).not.toBeInTheDocument();
  expect(document.querySelector("[data-palette-filter-chip]")?.textContent).toBe(
    "dale-nix › infra",
  );
  await expect.element(searchField).toHaveFocus();

  // From the project list, one Escape closes the whole control and keeps the palette.
  await filterButton.click();
  await userEvent.keyboard("d");
  await userEvent.keyboard("{Enter}");
  await expect
    .element(page.getByRole("menuitemradio", { name: "infra" }))
    .toHaveAttribute("aria-checked", "true");
  await userEvent.keyboard("{Escape}");
  await expect.element(allEnvironments).not.toBeInTheDocument();
  expect(projects()).toEqual([]);
  await expect.element(searchField).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(searchField).not.toBeInTheDocument();
});

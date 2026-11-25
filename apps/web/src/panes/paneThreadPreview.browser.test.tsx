import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
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
import {
  REPOSITORY_KEY,
  serveThreadShells,
  threadPullRequest as pullRequest,
} from "../../test/paneThreadShell";
import { render } from "../../test/render";
import { usePaneStore } from "./paneStore";
import {
  DEFAULT_PANE_THREAD_SETTINGS,
  createPaneThreadStore,
  usePaneThreadStore,
} from "./paneThreadStore";
import {
  createInitialLayout,
  getActiveTab,
  listLeaves,
  replaceTab,
  setLeafTarget,
  splitLeaf,
  type PaneLayout,
} from "./paneTree";

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

const TUTOR_TEMPLATE = "https://{slug}.preview.tutorintelligence.com";
const PREVIEW_LINK = "[data-thread-preview-link]";

/** The stores outlive a test, so each test starts from this layout, no drafts and the defaults. */
function setup(threads: ReadonlyArray<FakeThread>, layout: PaneLayout = createInitialLayout()) {
  usePaneStore.setState({ layout, lastRouteKey: null, fillingPaneIds: [] });
  usePaneThreadStore.setState(DEFAULT_PANE_THREAD_SETTINGS);
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
  return installFakeEnvironment(threads);
}

const targetOf = (thread: FakeThread) =>
  ({ kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, thread.id) }) as const;

/** One tab with the threads side by side, the first one focused. */
function rowLayout(threads: ReadonlyArray<FakeThread>): PaneLayout {
  const layout = createInitialLayout(targetOf(threads[0]!));
  let tab = getActiveTab(layout);
  const first = tab.focusedPaneId;
  for (const thread of threads.slice(1)) {
    const before = new Set(listLeaves(tab.root).map((leaf) => leaf.id));
    tab = splitLeaf(tab, first, "right");
    const added = listLeaves(tab.root).find((leaf) => !before.has(leaf.id))!;
    tab = setLeafTarget(tab, added.id, targetOf(thread));
  }
  return replaceTab(layout, { ...tab, focusedPaneId: first });
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

const paneCells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
const paneShowing = (thread: FakeThread) =>
  paneCells().find((cell) => cell.textContent.includes(`Answer 0 for ${thread.id}.`));
it("a thread with a pull request shows a preview link only when its repository has a URL template", async () => {
  const single = threadWithHistory("preview-single", 1);
  const stacked = threadWithHistory("preview-stack", 1);
  const plain = threadWithHistory("preview-none", 1);
  using _environment = setup([single, stacked, plain], rowLayout([single, stacked, plain]));
  using _shell = serveThreadShells(
    new Map([
      [single, { pullRequests: [pullRequest(11, "dale/Kiosk_Footer", "open")] }],
      [
        stacked,
        {
          pullRequests: [
            pullRequest(21, "stack/base", "open"),
            pullRequest(22, "stack/top", "open", "stack/base"),
          ],
        },
      ],
    ]),
  );
  using open = vi.spyOn(window, "open").mockReturnValue(null);
  await page.viewport(1500, 800);
  await using _app = await openThread(single);
  await vi.waitFor(() => expect(paneCells()).toHaveLength(3));

  // No template: no link, and nothing of the fork in the header.
  expect(document.querySelector(PREVIEW_LINK)).toBeNull();

  usePaneThreadStore.getState().setPreviewUrlTemplate(REPOSITORY_KEY, TUTOR_TEMPLATE);
  await vi.waitFor(() => {
    expect(paneShowing(single)!.querySelector(PREVIEW_LINK)).not.toBeNull();
    expect(paneShowing(stacked)!.querySelector(PREVIEW_LINK)).not.toBeNull();
  });
  // A thread with no pull request has no preview.
  expect(paneShowing(plain)!.querySelector(PREVIEW_LINK)).toBeNull();

  const header = (thread: FakeThread) =>
    page.elementLocator(
      paneShowing(thread)!.querySelector<HTMLElement>(`[data-chat-header] ${PREVIEW_LINK}`)!,
    );
  await header(single).click();
  expect(open).toHaveBeenLastCalledWith(
    "https://dale-kiosk-footer.preview.tutorintelligence.com",
    "_blank",
    "noopener,noreferrer",
  );
  // A stack opens the preview of its top pull request.
  await header(stacked).click();
  expect(open).toHaveBeenLastCalledWith(
    "https://stack-top.preview.tutorintelligence.com",
    "_blank",
    "noopener,noreferrer",
  );

  // A pane wide enough for the stock thread details shows the link under the pull request row.
  await page.viewport(3000, 800);
  await vi.waitFor(() =>
    expect(
      paneShowing(stacked)!.querySelector('[data-thread-preview-link="details"]'),
    ).not.toBeNull(),
  );
  open.mockClear();
  await page
    .elementLocator(
      paneShowing(stacked)!.querySelector<HTMLElement>('[data-thread-preview-link="details"]')!,
    )
    .click();
  expect(open).toHaveBeenLastCalledWith(
    "https://stack-top.preview.tutorintelligence.com",
    "_blank",
    "noopener,noreferrer",
  );

  // Another repository's template shows no link here.
  usePaneThreadStore.getState().setPreviewUrlTemplate(REPOSITORY_KEY, "");
  usePaneThreadStore.getState().setPreviewUrlTemplate("github.com/other/repo", TUTOR_TEMPLATE);
  await vi.waitFor(() => expect(document.querySelector(PREVIEW_LINK)).toBeNull());
});

it("Settings > Appearance sets the preview URL template of a repository and the pane switch", async () => {
  using _environment = setup([threadWithHistory("preview-settings", 1)]);
  using _shell = serveThreadShells(new Map());
  await page.viewport(1280, 900);
  const router = getRouter(createMemoryHistory({ initialEntries: ["/settings/appearance"] }));
  await router.load();
  await using _app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });

  const release = page.getByRole("switch", { name: "Free a pane when its thread settles" });
  await expect.element(release).toBeChecked();
  await release.click();
  await expect.element(release).not.toBeChecked();
  expect(usePaneThreadStore.getState().releasePaneOnMergeSettle).toBe(false);
  await page
    .getByRole("button", { name: "Reset free a pane when its thread settles to default" })
    .click();
  await expect.element(release).toBeChecked();

  // One row for each repository, and no template at first.
  const template = page.getByRole("textbox", { name: `Preview URL template of ${REPOSITORY_KEY}` });
  await expect.element(template).toHaveValue("");
  await template.fill("https://preview.example.com");
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByText("The template needs {slug}. No link shows.")).toBeVisible();
  await template.fill(TUTOR_TEMPLATE);
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() =>
    expect(usePaneThreadStore.getState().previewUrlTemplates).toEqual({
      [REPOSITORY_KEY]: TUTOR_TEMPLATE,
    }),
  );
  expect(document.body.textContent).not.toContain("No link shows.");
  // What a reload does: a new store on the same browser storage.
  expect(createPaneThreadStore(window.localStorage).getState().previewUrlTemplates).toEqual({
    [REPOSITORY_KEY]: TUTOR_TEMPLATE,
  });
});

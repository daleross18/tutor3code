import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
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
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";
import { usePaneStore } from "./paneStore";
import { createInitialLayout } from "./paneTree";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

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

// A file of its own: the app keeps the thread list that the first test of a file loaded.
function setup(threads: Parameters<typeof installFakeEnvironment>[0]) {
  usePaneStore.setState({ layout: createInitialLayout(), lastRouteKey: null, fillingPaneIds: [] });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
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

const paneCells = () => [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")];
const composers = () => [
  ...document.querySelectorAll<HTMLElement>('[data-testid="composer-editor"]'),
];

it("after a click on chat text, a return to the pane gives the input the Up key", async () => {
  const first = threadWithHistory("history-focus-a", 1);
  const second = threadWithHistory("history-focus-b", 1);
  using _environment = setup([first, second]);
  await page.viewport(1280, 800);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${first.id}`] }),
  );
  await router.load();
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });
  await expect.element(page.getByText(`Answer 0 for ${first.id}.`)).toBeVisible();
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  await router.navigate({
    to: "/$environmentId/$threadId",
    params: { environmentId: ENVIRONMENT_ID, threadId: second.id },
  });
  await expect.element(page.getByText(`Answer 0 for ${second.id}.`)).toBeVisible();

  // A click on the text of the chat in the first pane focuses the message body in its scroller.
  await userEvent.click(paneCells()[0]!.querySelector('[data-message-role="assistant"] p')!);
  await vi.waitFor(() =>
    expect(document.activeElement?.closest("[data-workspace-focus-default]")).not.toBeNull(),
  );
  expect(paneCells()[0]!.contains(document.activeElement)).toBe(true);

  // Away to the second pane and back by the pane keys.
  await userEvent.keyboard("{Control>}{Alt>}{ArrowRight}{/Alt}{/Control}");
  await vi.waitFor(() => expect(paneCells()[1]!.contains(document.activeElement)).toBe(true));
  await userEvent.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
  await vi.waitFor(() => expect(composers()[0]!.contains(document.activeElement)).toBe(true));
  await userEvent.keyboard("{ArrowUp}");
  await vi.waitFor(() => expect(composers()[0]!.textContent).toBe(`${first.id}: question 0`));
});

import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

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
function setup(threads: ReadonlyArray<FakeThread>) {
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

/** The stock footer of the last agent message of a turn: its text, and whether it shows. */
function footerOf(answer: string) {
  const row = [...document.querySelectorAll<HTMLElement>('[data-message-role="assistant"]')].find(
    (candidate) => candidate.textContent?.includes(answer),
  );
  const footer = row?.querySelector<HTMLElement>(
    'button[aria-label="Reply to this response"]',
  )?.parentElement;
  if (!footer) return null;
  return { text: footer.textContent, opacity: getComputedStyle(footer).opacity };
}

it("the footer of a finished turn shows its working time, with no pointer on it", async () => {
  // The first turn worked for 32 minutes and 16 seconds. The second ended in the same second.
  const history = threadWithHistory("worked-time", 2);
  const [long, short] = history.runs;
  const thread: FakeThread = {
    ...history,
    runs: [
      { ...long!, completedAt: DateTime.add(long!.startedAt!, { minutes: 32, seconds: 16 }) },
      short!,
    ],
  };
  using _environment = setup([thread]);
  await page.viewport(1200, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });
  await expect.element(page.getByText(`Answer 1 for ${thread.id}.`)).toBeVisible();

  await vi.waitFor(() => {
    const footer = footerOf("Answer 0");
    expect(footer?.text).toMatch(/[AP]M· worked 32m 16s$/);
    expect(footer?.opacity).toBe("1");
  });
  // A short turn keeps the stock footer, which shows under the pointer only.
  expect(footerOf("Answer 1")?.text).toMatch(/[AP]M$/);
  expect(footerOf("Answer 1")?.opacity).toBe("0");
  expect(document.querySelectorAll("[data-worked-time]")).toHaveLength(1);

  useReadoutSettingsStore.getState().setReadoutSetting("showWorkedTime", false);
  await vi.waitFor(() => {
    expect(footerOf("Answer 0")?.text).toMatch(/[AP]M$/);
    expect(footerOf("Answer 0")?.opacity).toBe("0");
  });
});

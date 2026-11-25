import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
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
  assistantItem,
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

const UPDATES = 4;

/**
 * One turn of the user, then four turns that a pull request watch started: each begins with the
 * notification item of the wake, as a server stamps it, and holds one answer of the agent.
 */
function watchedThread(name: string): FakeThread {
  const thread = threadWithHistory(name, 1 + UPDATES);
  return {
    ...thread,
    items: thread.items.map((item): OrchestrationV2TurnItem => {
      if (item.type !== "user_message" || item.id === `${name}-user-0` || item.runId === null) {
        return item;
      }
      const {
        type: _type,
        messageId: _messageId,
        text: _text,
        streaming: _streaming,
        ...base
      } = assistantItem(thread.id, item.runId, item.id, item.ordinal, "");
      return {
        ...base,
        type: "notification",
        source: {
          kind: "monitor",
          pullRequest: {
            host: "github.com",
            repository: "acme/app",
            number: 7,
            watchStartedAt: "2026-03-17T19:00:00.000Z",
            headSha: null,
          },
        },
        outcome: "updated",
        summary: "#7: new comments",
      };
    }),
  };
}

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

it("the chat shows the earlier updates of a watched pull request as one line, which opens and closes, and the setting off shows the stock timeline", async () => {
  const thread = watchedThread("pr-updates");
  using _environment = setup([thread]);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await page.viewport(1280, 900);
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });

  const answer = (turn: number) => page.getByText(`Answer ${turn} for ${thread.id}.`);
  const line = page.getByRole("button", { name: "3 earlier pull request updates" });
  // The newest update and the turn of the user show. The three updates before it are one line.
  await expect.element(answer(UPDATES)).toBeVisible();
  await expect.element(answer(0)).toBeVisible();
  await expect.element(line).toHaveAttribute("aria-expanded", "false");
  for (const turn of [1, 2, 3]) await expect.element(answer(turn)).not.toBeInTheDocument();

  await userEvent.click(line);
  await expect.element(line).toHaveAttribute("aria-expanded", "true");
  for (const turn of [1, 2, 3]) await expect.element(answer(turn)).toBeInTheDocument();

  await userEvent.click(line);
  await expect.element(line).toHaveAttribute("aria-expanded", "false");
  await expect.element(answer(2)).not.toBeInTheDocument();

  useReadoutSettingsStore.getState().setReadoutSetting("foldPullRequestUpdates", false);
  await expect.element(line).not.toBeInTheDocument();
  for (const turn of [1, 2, 3, UPDATES]) await expect.element(answer(turn)).toBeInTheDocument();
});

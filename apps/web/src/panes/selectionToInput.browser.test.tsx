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

const editor = () => document.querySelector<HTMLElement>('[data-testid="composer-editor"]');

/** Selects the text of the agent answer that holds `answer`, as a drag of the pointer does. */
function selectAnswer(answer: string): HTMLElement {
  const node = page.getByLabelText("Conversation", { exact: false }).getByText(answer).element();
  if (!(node instanceof HTMLElement)) throw new Error("no answer");
  // A press on chat text takes focus from the input.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return node;
}

function rightClick(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  node.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: rect.left + 4,
      clientY: rect.top + 4,
    }),
  );
}

it("selected chat text shows in the empty input, Tab and the context menu put it there", async () => {
  const thread = threadWithHistory("selection-input", 1);
  using _environment = setup([thread]);
  await page.viewport(1200, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });
  const answer = `Answer 0 for ${thread.id}.`;
  await expect.element(page.getByText(answer)).toBeVisible();

  const answerNode = selectAnswer(answer);
  await vi.waitFor(() => expect(editor()?.getAttribute("aria-placeholder")).toBe(`“${answer}”`));
  await expect.element(page.getByText("⇥ Tab")).toBeVisible();
  await userEvent.keyboard("{Tab}");
  await vi.waitFor(() => expect(editor()?.textContent).toBe(answer));
  expect(window.getSelection()?.isCollapsed).toBe(true);

  // A right click on the selection appends it on a new line, and Fill input replaces the text.
  selectAnswer(answer);
  rightClick(answerNode);
  await page.getByRole("menuitem", { name: "Append to input" }).click();
  await vi.waitFor(() =>
    expect([...(editor()?.querySelectorAll("p") ?? [])].map((line) => line.textContent)).toEqual([
      answer,
      answer,
    ]),
  );
  selectAnswer(answer);
  rightClick(answerNode);
  await page.getByRole("menuitem", { name: "Fill input" }).click();
  await vi.waitFor(() => expect(editor()?.textContent).toBe(answer));
});

it("with the setting off, a selection keeps the stock input and the stock context menu", async () => {
  const thread = threadWithHistory("selection-input", 1);
  using _environment = setup([thread]);
  useReadoutSettingsStore.setState({ selectionToInput: false });
  await page.viewport(1200, 900);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });
  const answer = `Answer 0 for ${thread.id}.`;
  await expect.element(page.getByText(answer)).toBeVisible();
  const stockPlaceholder = editor()?.getAttribute("aria-placeholder");

  const answerNode = selectAnswer(answer);
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  answerNode.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(editor()?.getAttribute("aria-placeholder")).toBe(stockPlaceholder);
  expect(stockPlaceholder).not.toContain(answer);
});

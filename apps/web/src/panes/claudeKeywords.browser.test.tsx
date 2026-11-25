import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
import { useComposerDraftStore, type DraftId } from "~/composerDraftStore";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  CLAUDE_PROVIDER,
  CODEX_PROVIDER,
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";
import { CLAUDE_KEYWORD_HIGHLIGHT } from "./claudeKeywordHighlight";
import { usePasteCollapseSettingsStore } from "./pasteCollapseStore";
import { usePaneStore } from "./paneStore";
import { createInitialLayout, getActiveTab, listLeaves } from "./paneTree";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

// The socket is faked; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

// The fake environment does not serve project files, and a new draft waits for that read.
vi.mock(import("~/lib/t3ProjectFileDefaults"), () => ({
  readT3ProjectFile: () => Promise.resolve(null),
}));

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const CLAUDE: ModelSelection = {
  instanceId: ProviderInstanceId.make(CLAUDE_PROVIDER.instanceId),
  model: "claude-opus-4-6",
};
const CODEX: ModelSelection = {
  instanceId: ProviderInstanceId.make(CODEX_PROVIDER.instanceId),
  model: "gpt-5.4",
};
// The app keeps the thread list of the first test of a file, so each test installs both threads.
const CLAUDE_THREAD = threadWithHistory("keywords-claude", 1, CLAUDE);
const CODEX_THREAD = threadWithHistory("keywords-codex", 1, CODEX);
const PROMPT = "run this with ultracode please";

/** The stores outlive a test, so each test starts from one pane, no drafts and the defaults. */
function setup() {
  usePaneStore.setState({ layout: createInitialLayout(), lastRouteKey: null, fillingPaneIds: [] });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
    stickyModelSelectionByProvider: {},
    stickyActiveProvider: null,
  });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  usePasteCollapseSettingsStore.setState({ collapseLongPastes: false });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const stack = new DisposableStack();
  // Other test files read the same browser storage, so no test leaves a changed setting.
  stack.defer(() => {
    useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
    usePasteCollapseSettingsStore.setState({ collapseLongPastes: false });
  });
  stack.use(
    installFakeEnvironment([CLAUDE_THREAD, CODEX_THREAD], {
      providers: [CODEX_PROVIDER, CLAUDE_PROVIDER],
    }),
  );
  return stack;
}

async function openThread(thread: FakeThread) {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  // AppRoot brings its own router.
  stack.use(await render(<AppRoot router={router} />, { router: false }));
  await expect.element(page.getByText(`Answer 0 for ${thread.id}.`)).toBeVisible();
  // The default test viewport is too small to show the composer.
  await page.viewport(1280, 800);
  return stack.move();
}

const composers = () => [
  ...document.querySelectorAll<HTMLElement>('[data-testid="composer-editor"]'),
];
/** The text of each range that has the keyword style, over every composer of the page. */
const styledWords = () =>
  [...(CSS.highlights.get(CLAUDE_KEYWORD_HIGHLIGHT) ?? [])].map((range) => range.toString());
const prompts = () =>
  Object.values(useComposerDraftStore.getState().draftsByThreadKey).map((draft) => draft.prompt);
const keywordColor = (element: Element) =>
  getComputedStyle(element, `::highlight(${CLAUDE_KEYWORD_HIGHLIGHT})`).color;

it("styles the word in the composer of a Claude provider, and leaves the text as typed", async () => {
  using _environment = setup();
  await using _app = await openThread(CLAUDE_THREAD);
  const composer = composers()[0]!;
  await userEvent.click(composer);

  // No style before the last letter of the word.
  await userEvent.keyboard("run this with ultracod");
  expect(composer.textContent).toBe("run this with ultracod");
  expect(styledWords()).toEqual([]);
  await userEvent.keyboard("e please");
  await vi.waitFor(() => expect(styledWords()).toEqual(["ultracode"]));

  // The style adds no element and changes no text: one paragraph that holds one text node.
  const paragraph = composer.querySelector("p")!;
  expect(composer.textContent).toBe(PROMPT);
  expect(composer.children).toHaveLength(1);
  expect([...paragraph.childNodes].map((node) => node.nodeType)).toEqual([Node.TEXT_NODE]);
  await vi.waitFor(() => expect(prompts()).toEqual([PROMPT]));
  // The word has the action color of the theme in its form for text, and the other text does not.
  const color = keywordColor(paragraph);
  expect(color).not.toBe(getComputedStyle(paragraph).color);
  const probe = document.createElement("span");
  probe.style.color = "var(--update-foreground)";
  composer.parentElement!.append(probe);
  expect(color).toBe(getComputedStyle(probe).color);
  probe.remove();

  // The setting off is stock: no style, and the stock class list of the editor's container.
  const container = composer.closest(".flow-root")!;
  expect(container.className).toContain("claude-keywords-");
  await act(() =>
    useReadoutSettingsStore.getState().setReadoutSetting("styleClaudeKeywords", false),
  );
  expect(styledWords()).toEqual([]);
  expect(container.className).not.toContain("claude-keywords-");
  await act(() =>
    useReadoutSettingsStore.getState().setReadoutSetting("styleClaudeKeywords", true),
  );
  expect(styledWords()).toEqual(["ultracode"]);

  // "Collapse long pastes" mounts the stock editor again, in its own wrapper. The style stays.
  await act(() => usePasteCollapseSettingsStore.setState({ collapseLongPastes: true }));
  await vi.waitFor(() => expect(composers()[0]).not.toBe(composer));
  await vi.waitFor(() => expect(styledWords()).toEqual(["ultracode"]));
  expect(composers()[0]!.textContent).toBe(PROMPT);
  await userEvent.click(composers()[0]!);
  await userEvent.keyboard("{ControlOrMeta>}{End}{/ControlOrMeta}");

  // A word in a code span has no style, and "ultrathink" is a keyword in any letter case.
  await userEvent.keyboard(" `ultracode` ULTRATHINK");
  expect(composers()[0]!.querySelector("code")?.textContent).toContain("ultracode");
  await vi.waitFor(() => expect(styledWords()).toEqual(["ultracode", "ULTRATHINK"]));
});

it("styles each pane by its own provider, and follows a change of the provider at once", async () => {
  using _environment = setup();
  await using _app = await openThread(CLAUDE_THREAD);
  await userEvent.click(composers()[0]!);
  await userEvent.keyboard(PROMPT);
  await vi.waitFor(() => expect(styledWords()).toEqual(["ultracode"]));

  // The split key opens a new thread in a second pane. Stock carries the provider of the thread.
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  let opened: { readonly paneId: string; readonly draftId: DraftId } | undefined;
  await vi.waitFor(() => {
    const leaf = listLeaves(getActiveTab(usePaneStore.getState().layout).root)[1];
    if (leaf?.target?.kind !== "draft") throw new Error("The new pane shows no draft yet.");
    const draft = useComposerDraftStore.getState().getComposerDraft(leaf.target.draftId);
    expect(draft?.activeProvider).toBe(CLAUDE.instanceId);
    opened = { paneId: leaf.id, draftId: leaf.target.draftId };
  });
  const { paneId, draftId } = opened!;
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  await userEvent.click(composers()[1]!);
  await userEvent.keyboard("Ultracode now");
  await vi.waitFor(() => expect(styledWords()).toEqual(["ultracode", "Ultracode"]));

  // Another provider in the second pane: its word is plain, and the first pane keeps its style.
  const { setModelSelection } = useComposerDraftStore.getState();
  await act(() => setModelSelection(draftId, CODEX));
  expect(styledWords()).toEqual(["ultracode"]);
  expect(composers()[1]!.textContent).toBe("Ultracode now");
  await act(() => setModelSelection(draftId, CLAUDE));
  expect(styledWords()).toEqual(["ultracode", "Ultracode"]);

  // A composer that leaves takes its ranges with it.
  await act(() => usePaneStore.getState().closePane(paneId));
  await vi.waitFor(() => expect(composers()).toHaveLength(1));
  expect(styledWords()).toEqual(["ultracode"]);
});

it("styles nothing in the composer of another provider", async () => {
  using _environment = setup();
  await using _app = await openThread(CODEX_THREAD);
  const composer = composers()[0]!;
  await userEvent.click(composer);
  await userEvent.keyboard(PROMPT);
  await vi.waitFor(() => expect(prompts()).toEqual([PROMPT]));
  expect(composer.textContent).toBe(PROMPT);
  expect(styledWords()).toEqual([]);
  expect(composer.closest(".flow-root")!.className).not.toContain("claude-keywords-");
});

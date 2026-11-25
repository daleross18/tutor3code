import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { PASTED_TEXT_ATTACHMENT_THRESHOLD_BYTES } from "@t3tools/client-runtime/text-paste";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type { Editor } from "@tiptap/core";
import type * as Context from "effect/Context";
import { createRef, type ClipboardEvent } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
import { useComposerDraftStore } from "~/composerDraftStore";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import type {
  ComposerPromptEditorHandle,
  ComposerPromptEditorProps,
} from "~/components/ComposerPromptEditorTiptap";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { isMacPlatform } from "~/lib/utils";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  dispatchedCommands,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";
import { DEFAULT_PANE_DENSITY_SETTINGS, usePaneDensityStore } from "./paneDensity";
import { PasteCollapseEditor } from "./PasteCollapseEditor";
import {
  PASTE_CHIPS_STORAGE_KEY,
  usePasteChipStore,
  usePasteCollapseSettingsStore,
} from "./pasteCollapseStore";
import { usePaneStore } from "./paneStore";
import { createInitialLayout } from "./paneTree";

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

const lines = (count: number, word = "line") =>
  Array.from({ length: count }, (_, index) => `${word} ${index + 1}`).join("\n");
const LOG = lines(12);
const CHIP = "[Pasted text · 12 lines]";
// The stock paste of several lines behind typed text starts them on a line of their own.
const STOCK_PASTE_AFTER_A = `a \n${LOG}`;

/** The stores outlive a test, so each test starts from one pane, no drafts and no chips. */
function setup(threads: ReadonlyArray<FakeThread>, collapseLongPastes: boolean) {
  usePaneStore.setState({ layout: createInitialLayout(), lastRouteKey: null, fillingPaneIds: [] });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  usePaneDensityStore.setState(DEFAULT_PANE_DENSITY_SETTINGS);
  usePasteChipStore.setState({ entries: {} });
  usePasteCollapseSettingsStore.setState({ collapseLongPastes });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const stack = new DisposableStack();
  // Other test files read the same browser storage, so no test leaves the setting on.
  stack.defer(() => {
    usePasteChipStore.setState({ entries: {} });
    usePasteCollapseSettingsStore.setState({ collapseLongPastes: false });
  });
  stack.use(installFakeEnvironment(threads, { acceptCommands: true }));
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
  ...document.querySelectorAll<HTMLElement & { editor: Editor }>('[data-testid="composer-editor"]'),
];
const chipsIn = (composer: Element) => [
  ...composer.querySelectorAll<HTMLElement>("[data-paste-collapse-chip]"),
];
const prompts = () =>
  Object.values(useComposerDraftStore.getState().draftsByThreadKey).map((draft) => draft.prompt);
const savedChips = () =>
  JSON.parse(localStorage.getItem(PASTE_CHIPS_STORAGE_KEY) ?? "null")?.state?.drafts ?? {};
const lastSend = () =>
  dispatchedCommands().findLast((command) => command.type === "message.dispatch");

/** A paste as the browser sends it: a bubbling event on the focused editor. */
async function paste(composer: HTMLElement, text: string) {
  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", text);
  await act(() => {
    composer.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  });
}

it("with the setting off, a long paste is stock text and the composer has no chip", async () => {
  const thread = threadWithHistory("paste-off", 1);
  using _environment = setup([thread], false);
  await using _app = await openThread(thread);
  const composer = composers()[0]!;
  await userEvent.click(composer);
  await userEvent.keyboard("a ");
  await paste(composer, LOG);

  await vi.waitFor(() => expect(prompts()).toEqual([STOCK_PASTE_AFTER_A]));
  expect(chipsIn(composer)).toHaveLength(0);
  expect(composer.textContent).toContain("line 12");
  expect(usePasteChipStore.getState().entries).toEqual({});
  expect(savedChips()).toEqual({});
});

it("a long paste shows as one chip, text goes around it, and the send carries the full text there", async () => {
  const thread = threadWithHistory("paste-send", 1);
  using _environment = setup([thread], true);
  await using _app = await openThread(thread);
  const composer = composers()[0]!;
  await userEvent.click(composer);
  await userEvent.keyboard("see ");
  await paste(composer, LOG);

  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));
  expect(chipsIn(composer)[0]!.textContent).toBe(CHIP);
  expect(composer.textContent).not.toContain("line 5");
  // The stock draft holds the text, so stock persistence, the length limit and the send read it.
  expect(prompts()).toEqual([`see ${LOG}`]);

  // The caret is behind the chip, and a short paste stays text.
  await userEvent.keyboard(" and ");
  await paste(composer, "this");
  await userEvent.keyboard("{Home}Please ");
  await vi.waitFor(() => expect(prompts()).toEqual([`Please see ${LOG} and this`]));
  expect(chipsIn(composer)).toHaveLength(1);
  expect(composer.textContent).toBe(`Please see ${CHIP} and this`);

  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() =>
    expect(lastSend()).toMatchObject({ threadId: thread.id, text: `Please see ${LOG} and this` }),
  );
  await vi.waitFor(() => expect(chipsIn(composers()[0]!)).toHaveLength(0));
  expect(savedChips()).toEqual({});
});

it("a click expands the chip, undo brings it back, and the same paste again expands it", async () => {
  const thread = threadWithHistory("paste-expand", 1);
  using _environment = setup([thread], true);
  await using _app = await openThread(thread);
  const composer = composers()[0]!;
  await userEvent.click(composer);
  await userEvent.keyboard("a ");
  await paste(composer, LOG);
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));

  await userEvent.click(chipsIn(composer)[0]!);
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(0));
  expect(composer.textContent).toContain("line 12");
  // The text went through the stock paste, so the prompt is what a stock paste gives there.
  expect(prompts()).toEqual([STOCK_PASTE_AFTER_A]);
  // The caret is behind the text that took the chip's place.
  await userEvent.keyboard("!");
  await vi.waitFor(() => expect(prompts()).toEqual([`${STOCK_PASTE_AFTER_A}!`]));

  await act(() => {
    composer.editor.commands.undo();
    composer.editor.commands.undo();
  });
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));
  expect(prompts()).toEqual([`a ${LOG}`]);
  expect(composer.textContent).toBe(`a ${CHIP}`);

  // Undo left the chip selected. The same text on it, or right behind it, expands it.
  await paste(composer, LOG);
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(0));
  expect(prompts()).toEqual([STOCK_PASTE_AFTER_A]);
  await act(() => {
    composer.editor.commands.undo();
    composer.editor.commands.focus("end");
  });
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));
  await paste(composer, LOG);
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(0));
  expect(prompts()).toEqual([STOCK_PASTE_AFTER_A]);

  // Not behind a chip, so the same text collapses again. Another text behind a chip does too.
  await paste(composer, LOG);
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));
  expect(prompts()).toEqual([`${STOCK_PASTE_AFTER_A}${LOG}`]);
  const other = lines(15, "row");
  await paste(composer, other);
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(2));
  expect(prompts()).toEqual([`${STOCK_PASTE_AFTER_A}${LOG}${other}`]);
});

it("a paste with no focused editor, which stock sends to the end of the composer, collapses too", async () => {
  const thread = threadWithHistory("paste-redirect", 1);
  using _environment = setup([thread], true);
  await using _app = await openThread(thread);
  const composer = composers()[0]!;
  await userEvent.click(composer);
  await userEvent.keyboard("see ");
  await act(() => {
    composer.blur();
  });
  expect(composer.contains(document.activeElement)).toBe(false);

  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", LOG);
  await act(() => {
    document.body.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  });
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));
  expect(composer.textContent).toBe(`see ${CHIP}`);
  expect(prompts()).toEqual([`see ${LOG}`]);
  // Stock moved the keyboard to the composer, behind the pasted text.
  await vi.waitFor(() => expect(composer.contains(document.activeElement)).toBe(true));
  await userEvent.keyboard("!");
  await vi.waitFor(() => expect(prompts()).toEqual([`see ${LOG}!`]));
  expect(composer.textContent).toBe(`see ${CHIP}!`);
});

it("a plain-text paste (Cmd+Shift+V) is not collapsed", async () => {
  const thread = threadWithHistory("paste-plain", 1);
  using _environment = setup([thread], true);
  await using _app = await openThread(thread);
  const composer = composers()[0]!;
  await userEvent.click(composer);

  const mac = isMacPlatform(navigator.platform);
  await act(() => {
    composer.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "V",
        code: "KeyV",
        shiftKey: true,
        metaKey: mac,
        ctrlKey: !mac,
        bubbles: true,
      }),
    );
  });
  await paste(composer, LOG);
  await vi.waitFor(() => expect(prompts()).toEqual([LOG]));
  expect(chipsIn(composer)).toHaveLength(0);
  expect(composer.textContent).toContain("line 12");

  // The key armed one paste only.
  await paste(composer, LOG);
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));
});

it("a paste into a code block of the composer stays stock text", async () => {
  const thread = threadWithHistory("paste-code", 1);
  using _environment = setup([thread], true);
  await using _app = await openThread(thread);
  const composer = composers()[0]!;
  await userEvent.click(composer);
  await userEvent.keyboard("```{Enter}");
  await vi.waitFor(() => expect(composer.querySelector("pre")).not.toBeNull());
  await paste(composer, LOG);

  await vi.waitFor(() => expect(prompts()[0]).toContain(LOG));
  expect(chipsIn(composer)).toHaveLength(0);
  expect(composer.querySelector("pre")!.textContent).toContain("line 12");
});

it("a paste that the stock composer takes first, as its 32 KB attachment fold does, gets no chip", async () => {
  using _environment = setup([], true);
  const onChange = vi.fn<ComposerPromptEditorProps["onChange"]>();
  const stockTakesPaste = vi.fn((event: ClipboardEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  });
  await using _screen = await render(
    <PasteCollapseEditor
      editorRef={createRef<ComposerPromptEditorHandle>()}
      draftKey="paste-fold"
      value=""
      cursor={0}
      contextRecords={new Map()}
      skills={[]}
      disabled={false}
      placeholder=""
      onChange={onChange}
      onPaste={stockTakesPaste}
    />,
  );
  const composer = composers()[0]!;
  await paste(composer, "x".repeat(PASTED_TEXT_ATTACHMENT_THRESHOLD_BYTES));

  expect(stockTakesPaste).toHaveBeenCalledOnce();
  expect(chipsIn(composer)).toHaveLength(0);
  expect(composer.textContent).toBe("");
  expect(onChange.mock.calls.every(([value]) => value === "")).toBe(true);
});

it("the chip and its text survive a restart, and a copy of the chip is its text", async () => {
  const thread = threadWithHistory("paste-restart", 1);
  using _environment = setup([thread], true);
  {
    await using _app = await openThread(thread);
    const composer = composers()[0]!;
    await userEvent.click(composer);
    await userEvent.keyboard("log: ");
    await paste(composer, LOG);
    await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));

    await act(() => {
      composer.editor.commands.selectAll();
    });
    const clipboardData = new DataTransfer();
    composer.dispatchEvent(
      new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true }),
    );
    expect(clipboardData.getData("text/plain")).toBe(`log: ${LOG}`);
  }

  // A restart keeps the stock draft and the fork's stored chip places, and no store memory.
  const stored = localStorage.getItem(PASTE_CHIPS_STORAGE_KEY)!;
  expect(stored).not.toContain("line 5");
  usePasteChipStore.setState({ entries: {} });
  localStorage.setItem(PASTE_CHIPS_STORAGE_KEY, stored);
  await usePasteChipStore.persist.rehydrate();

  await using _app = await openThread(thread);
  const composer = composers()[0]!;
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(1));
  expect(composer.textContent).toBe(`log: ${CHIP}`);
  expect(prompts()).toEqual([`log: ${LOG}`]);
  await userEvent.click(chipsIn(composer)[0]!);
  await vi.waitFor(() => expect(chipsIn(composer)).toHaveLength(0));
  expect(composer.textContent).toContain("line 12");
});

it("each pane collapses its own paste and sends its own text", async () => {
  const thread = threadWithHistory("paste-panes", 1);
  using _environment = setup([thread], true);
  await using _app = await openThread(thread);
  await userEvent.click(composers()[0]!);
  await paste(composers()[0]!, LOG);
  await vi.waitFor(() => expect(chipsIn(composers()[0]!)).toHaveLength(1));

  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(composers()).toHaveLength(2));
  const [first, second] = composers();
  const other = lines(15, "row");
  await userEvent.click(second!);
  await paste(second!, other);
  await vi.waitFor(() => expect(chipsIn(second!)).toHaveLength(1));
  expect(chipsIn(second!)[0]!.textContent).toBe("[Pasted text · 15 lines]");
  expect(chipsIn(first!)).toHaveLength(1);
  expect(chipsIn(first!)[0]!.textContent).toBe(CHIP);
  expect(prompts().toSorted()).toEqual([LOG, other].toSorted());

  await userEvent.click(first!);
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() => expect(lastSend()).toMatchObject({ threadId: thread.id, text: LOG }));
  expect(chipsIn(composers()[1]!)).toHaveLength(1);
});

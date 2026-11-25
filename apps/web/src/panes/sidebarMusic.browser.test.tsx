import "~/index.css";

import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  SpotifyCommand,
  SpotifyCommandResult,
  SpotifyPlayback,
  SpotifyStateResult,
} from "@t3tools/contracts";
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
import { act, render } from "../../test/render";
import type { MusicBridge } from "./music";
import { useMusicStore } from "./musicStore";
import { usePaneStore } from "./paneStore";
import {
  createInitialLayout,
  getActiveTab,
  listLeaves,
  replaceTab,
  setLeafTarget,
  splitLeaf,
} from "./paneTree";
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

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

// The stock app takes a `window.desktopBridge` for the whole desktop bridge, so the test gives
// the music control its two methods here. `music.test.ts` covers who has a bridge.
const spotifyBridge = vi.hoisted(() => ({ current: null as MusicBridge | null }));
vi.mock(import("./music"), async (original) => ({
  ...(await original()),
  musicBridge: () => spotifyBridge.current,
}));

const MUSIC_BUTTON = "[data-music-control]";
const LEFT = threadWithHistory("music-left", 1);
const RIGHT = threadWithHistory("music-right", 1);

const PLAYING: SpotifyPlayback = {
  playerState: "playing",
  volume: 60,
  positionSeconds: 12,
  durationSeconds: 200,
  track: { name: "Song of the test", artist: "The Fake Band", album: "Album" },
};

const targetOf = (thread: FakeThread) =>
  ({ kind: "server", threadRef: scopeThreadRef(ENVIRONMENT_ID, thread.id) }) as const;

/** Two started threads side by side: the one music button serves every pane. */
function twoPaneLayout() {
  const layout = createInitialLayout(targetOf(LEFT));
  const first = getActiveTab(layout).focusedPaneId;
  let tab = splitLeaf(getActiveTab(layout), first, "right");
  const added = listLeaves(tab.root).find((leaf) => leaf.id !== first)!;
  tab = setLeafTarget(tab, added.id, targetOf(RIGHT));
  return replaceTab(layout, { ...tab, focusedPaneId: first });
}

/** A Spotify that the test controls. `state.current` is what the next read gives. */
function setup() {
  const state: { current: SpotifyStateResult } = { current: { kind: "notRunning" } };
  const getSpotifyState = vi.fn(() => Promise.resolve(state.current));
  const sendSpotifyCommand = vi.fn((_command: SpotifyCommand): Promise<SpotifyCommandResult> =>
    Promise.resolve({ kind: "sent" }),
  );
  spotifyBridge.current = { getSpotifyState, sendSpotifyCommand };
  usePaneStore.setState({ layout: twoPaneLayout(), lastRouteKey: null, fillingPaneIds: [] });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  useMusicStore.setState({ openId: null, result: null });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const environment = installFakeEnvironment([LEFT, RIGHT]);
  return {
    state,
    getSpotifyState,
    sendSpotifyCommand,
    [Symbol.dispose]: () => {
      environment[Symbol.dispose]();
      spotifyBridge.current = null;
    },
  };
}

async function openApp() {
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${LEFT.id}`] }),
  );
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(await render(<AppRoot router={router} />, { router: false }));
  await expect.element(page.getByText(`Answer 0 for ${RIGHT.id}.`)).toBeVisible();
  return stack.move();
}

const paneOf = (thread: FakeThread) => {
  const cell = [...document.querySelectorAll<HTMLElement>("[data-splitpane-cell]")].find(
    (candidate) => candidate.textContent.includes(`Answer 0 for ${thread.id}.`),
  );
  if (!cell) throw new Error(`No pane shows ${thread.id}.`);
  return cell;
};
const musicButton = () => document.querySelector<HTMLElement>(MUSIC_BUTTON);
const sidebar = () => musicButton()!.closest<HTMLElement>('[data-slot="sidebar"]')!;
const pressSidebarKey = () => userEvent.keyboard("{ControlOrMeta>}b{/ControlOrMeta}");
const composerOf = (thread: FakeThread) =>
  paneOf(thread).querySelector<HTMLElement>('[data-testid="composer-editor"]')!;
const popup = () => page.getByRole("dialog", { name: "Music" });
const focusedName = () => document.activeElement?.getAttribute("aria-label") ?? null;
// `mod` is Ctrl in the test browser. On macOS the key is Cmd+Option+M.
const pressMusicKey = () => userEvent.keyboard("{ControlOrMeta>}{Alt>}m{/Alt}{/ControlOrMeta}");

it("opens the music popup by click and by key, tabs through its controls, sends each command and returns focus", async () => {
  using spotify = setup();
  await page.viewport(1280, 800);
  await using _app = await openApp();

  // One button for the app: in the sidebar footer, directly after the stock Usage button and in
  // its row. No pane has one. No read while the popup is closed.
  await vi.waitFor(() => expect(document.querySelectorAll(MUSIC_BUTTON)).toHaveLength(1));
  const usageItem = page.getByRole("button", { name: "Usage" }).element().closest("li")!;
  expect(usageItem.nextElementSibling).toBe(musicButton()!.closest("li"));
  expect(musicButton()!.getBoundingClientRect().top).toBe(
    page.getByRole("button", { name: "Usage" }).element().getBoundingClientRect().top,
  );
  expect(document.querySelector(`[data-splitpane-cell] ${MUSIC_BUTTON}`)).toBeNull();
  expect(spotify.getSpotifyState).not.toHaveBeenCalled();

  // Spotify does not run: one line of help, and no control.
  await userEvent.click(musicButton()!);
  await vi.waitFor(() =>
    expect(popup().getByRole("status").element().textContent).toContain("Open the Spotify app"),
  );
  expect(spotify.getSpotifyState).toHaveBeenCalledTimes(1);
  expect(popup().getByRole("button").elements()).toHaveLength(0);
  await userEvent.keyboard("{Escape}");
  await expect.element(popup()).not.toBeInTheDocument();

  // By click: the popup shows the track above the button, and play/pause has focus. It first
  // shows the help line of the last read, so the controls take focus when they show.
  spotify.state.current = { kind: "ok", playback: PLAYING };
  await userEvent.click(musicButton()!);
  await expect.element(popup().getByText("Song of the test")).toBeVisible();
  await expect.element(popup().getByText("The Fake Band")).toBeVisible();
  await vi.waitFor(() => expect(focusedName()).toBe("Pause"));
  expect(popup().element().getBoundingClientRect().bottom).toBeLessThanOrEqual(
    musicButton()!.getBoundingClientRect().top,
  );

  // Tab moves through the controls in the order they show.
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(focusedName()).toBe("Previous track");
  await userEvent.keyboard("{Tab}");
  expect(focusedName()).toBe("Pause");
  await userEvent.keyboard("{Tab}");
  expect(focusedName()).toBe("Next track");
  await userEvent.keyboard("{Tab}");
  expect(focusedName()).toBe("Volume");

  // An arrow key moves the slider, and the value goes to Spotify.
  await userEvent.keyboard("{ArrowRight}");
  await vi.waitFor(() =>
    expect(spotify.sendSpotifyCommand).toHaveBeenLastCalledWith({ type: "setVolume", volume: 65 }),
  );
  // Enter and Space press a button. The popup shows the new state at once.
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await userEvent.keyboard("{Enter}");
  expect(spotify.sendSpotifyCommand).toHaveBeenLastCalledWith({ type: "next" });
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  spotify.state.current = { kind: "ok", playback: { ...PLAYING, playerState: "paused" } };
  const readsBeforeCommand = spotify.getSpotifyState.mock.calls.length;
  await userEvent.keyboard(" ");
  expect(spotify.sendSpotifyCommand).toHaveBeenLastCalledWith({ type: "playpause" });
  await vi.waitFor(() => expect(focusedName()).toBe("Play"));
  // One read follows a command.
  await vi.waitFor(() =>
    expect(spotify.getSpotifyState.mock.calls.length).toBe(readsBeforeCommand + 1),
  );

  // Escape closes the popup. After a click, focus returns to the music button.
  await userEvent.keyboard("{Escape}");
  await expect.element(popup()).not.toBeInTheDocument();
  expect(document.activeElement).toBe(musicButton());

  // By key, from the composer of a pane: the popup opens with focus on play/pause, and shows
  // the state that the first popup left.
  await userEvent.click(composerOf(RIGHT));
  expect(paneOf(RIGHT).dataset.paneFocused).toBe("true");
  await pressMusicKey();
  await expect.element(popup()).toBeVisible();
  await vi.waitFor(() => expect(focusedName()).toBe("Play"));
  expect(musicButton()!.getAttribute("aria-expanded")).toBe("true");
  // The same key closes it, and focus returns to the composer.
  await pressMusicKey();
  await expect.element(popup()).not.toBeInTheDocument();
  await vi.waitFor(() => expect(document.activeElement).toBe(composerOf(RIGHT)));
  // Escape does the same.
  await pressMusicKey();
  await vi.waitFor(() => expect(focusedName()).toBe("Play"));
  await userEvent.keyboard("{Escape}");
  await expect.element(popup()).not.toBeInTheDocument();
  await vi.waitFor(() => expect(document.activeElement).toBe(composerOf(RIGHT)));

  // A collapsed sidebar hides the button, and the key then opens nothing.
  await pressSidebarKey();
  await vi.waitFor(() => expect(sidebar().inert).toBe(true));
  await pressMusicKey();
  expect(useMusicStore.getState().openId).toBeNull();
  await pressSidebarKey();
  await vi.waitFor(() => expect(sidebar().inert).toBe(false));
  await pressMusicKey();
  await vi.waitFor(() => expect(focusedName()).toBe("Play"));
  await pressMusicKey();
  await expect.element(popup()).not.toBeInTheDocument();

  // The setting off: no button, the stock buttons stay, and the key opens nothing.
  await act(() => useReadoutSettingsStore.getState().setReadoutSetting("showMusicControl", false));
  await vi.waitFor(() => expect(document.querySelector(MUSIC_BUTTON)).toBeNull());
  await expect.element(page.getByRole("button", { name: "Usage" })).toBeVisible();
  await pressMusicKey();
  expect(useMusicStore.getState().openId).toBeNull();
});

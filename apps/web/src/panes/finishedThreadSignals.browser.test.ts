import type { AnyRouter } from "@tanstack/react-router";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { useUiStateStore } from "../uiStateStore";
import type { MenuBarBridge } from "./finishedThreads";
import type { ChimeAudioContext } from "./finishSound";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

const atoms = vi.hoisted(() => ({
  shells: null as unknown,
  index: null as unknown,
}));
vi.mock(import("../state/threads"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentThreadShells: {
      ...actual.environmentThreadShells,
      // Read lazily: the factory runs before this module's own bindings exist.
      get navigationThreadShellsAtom() {
        return atoms.shells as never;
      },
      environmentThreadIndexAtom: (() => atoms.index) as never,
    },
  };
});
vi.mock(import("../hooks/useSettings"), async (original) => ({
  ...(await original()),
  getClientSettings: (() => ({ notificationMode: "off" })) as never,
}));

import { startFinishedThreadSignals } from "./finishedThreadSignals";

const shellsAtom = Atom.make<ReadonlyArray<EnvironmentThreadShell>>([]);
const indexAtom = Atom.make<ReadonlyMap<string, unknown>>(new Map());
atoms.shells = shellsAtom;
atoms.index = indexAtom;

const BEFORE = "2026-11-20T09:00:00.000Z";

/** A thread that works, or one whose run completed at `completedAt`. */
function thread(id: string, completedAt: string | null) {
  return {
    environmentId: "env",
    id,
    title: `Thread ${id}`,
    latestRun:
      completedAt === null
        ? { status: "running", completedAt: null }
        : { status: "completed", completedAt },
    runtime: completedAt === null ? { status: "running" } : null,
    hasPendingApprovals: false,
  } as unknown as EnvironmentThreadShell;
}

function setup(settings: { readonly menuBarUnread: boolean; readonly finishSound: boolean }) {
  vi.clearAllMocks();
  const stack = new DisposableStack();
  const registry = AtomRegistry.make();
  stack.defer(() => registry.dispose());
  useReadoutSettingsStore.setState({ ...DEFAULT_READOUT_SETTINGS, ...settings });
  useUiStateStore.setState({ threadLastVisitedAtById: {} });

  const menuActions = new Set<(action: string) => void>();
  const setMenuBarUnread = vi.fn((_unread: Parameters<MenuBarBridge["setMenuBarUnread"]>[0]) =>
    Promise.resolve(),
  );
  const bridge: MenuBarBridge = {
    setMenuBarUnread,
    onMenuAction: (listener) => {
      menuActions.add(listener);
      return () => menuActions.delete(listener);
    },
  };

  const audio = { now: 0, notes: 0, closes: 0 };
  const param = {
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  };
  const createAudioContext = (): ChimeAudioContext => ({
    get currentTime() {
      return audio.now;
    },
    state: "running",
    destination: {},
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    close: () => {
      audio.closes += 1;
      return Promise.resolve();
    },
    createOscillator: () => ({
      type: "",
      frequency: param,
      connect: () => undefined,
      start: () => void (audio.notes += 1),
      stop: () => undefined,
    }),
    createGain: () => ({ gain: param, connect: () => undefined }),
  });

  let windowFocused = false;
  stack.use(vi.spyOn(document, "hasFocus").mockImplementation(() => windowFocused));
  const route = { params: {} as Record<string, string> };
  const navigate = vi.fn();
  const router = { state: { matches: [route] }, navigate } as unknown as AnyRouter;

  stack.defer(
    startFinishedThreadSignals(registry, router, {
      menuBarBridge: () => bridge,
      createAudioContext,
    }),
  );
  return {
    setMenuBarUnread,
    navigate,
    audio,
    /** Sends a new snapshot of the threads, as a server update does. */
    show: (threads: ReadonlyArray<EnvironmentThreadShell>) => {
      registry.set(
        indexAtom,
        new Map(threads.map((shell) => [shell.id, { latestRunBackgroundWake: false }])),
      );
      registry.set(shellsAtom, threads);
    },
    pickMenuItem: (action: string) => {
      for (const listener of menuActions) listener(action);
    },
    focus: (threadId: string) => {
      windowFocused = true;
      route.params = { environmentId: "env", threadId };
    },
    [Symbol.dispose]: () => stack.dispose(),
  };
}

it("sends the count of unread finished threads to the menu bar, opens a picked thread, and removes the item when the setting turns off", () => {
  using app = setup({ menuBarUnread: true, finishSound: false });
  expect(app.setMenuBarUnread).toHaveBeenLastCalledWith({ count: 0, threads: [] });

  useUiStateStore.setState({ threadLastVisitedAtById: { "env:a": BEFORE, "env:b": BEFORE } });
  app.show([thread("a", "2026-11-20T10:00:00.000Z"), thread("b", null)]);
  expect(app.setMenuBarUnread).toHaveBeenLastCalledWith({
    count: 1,
    threads: [{ key: "env:a", title: "Thread a" }],
  });
  app.show([thread("a", "2026-11-20T10:00:00.000Z"), thread("b", "2026-11-20T10:05:00.000Z")]);
  expect(app.setMenuBarUnread).toHaveBeenLastCalledWith({
    count: 2,
    threads: [
      { key: "env:b", title: "Thread b" },
      { key: "env:a", title: "Thread a" },
    ],
  });

  // A visit takes the thread out of the count. An update that changes no answer sends nothing.
  useUiStateStore.setState({
    threadLastVisitedAtById: { "env:a": "2026-11-20T10:01:00.000Z", "env:b": BEFORE },
  });
  expect(app.setMenuBarUnread).toHaveBeenLastCalledWith({
    count: 1,
    threads: [{ key: "env:b", title: "Thread b" }],
  });
  const calls = app.setMenuBarUnread.mock.calls.length;
  app.show([thread("a", "2026-11-20T10:00:00.000Z"), thread("b", "2026-11-20T10:05:00.000Z")]);
  expect(app.setMenuBarUnread).toHaveBeenCalledTimes(calls);

  app.pickMenuItem("fork-open-thread:env:b");
  app.pickMenuItem("open-settings");
  expect(app.navigate.mock.calls).toEqual([
    [{ to: "/$environmentId/$threadId", params: { environmentId: "env", threadId: "b" } }],
  ]);

  useReadoutSettingsStore.setState({ menuBarUnread: false });
  expect(app.setMenuBarUnread).toHaveBeenLastCalledWith(null);
  app.show([thread("a", null), thread("b", "2026-11-20T10:05:00.000Z")]);
  expect(app.setMenuBarUnread).toHaveBeenCalledTimes(calls + 1);
});

it("plays one sound for threads that finish together, and none for the thread the user looks at", () => {
  using app = setup({ menuBarUnread: false, finishSound: true });
  expect(app.setMenuBarUnread).not.toHaveBeenCalled();
  app.show([thread("a", null), thread("b", null), thread("c", null)]);
  document.dispatchEvent(new Event("pointerdown"));

  app.show([
    thread("a", "2026-11-20T10:00:00.000Z"),
    thread("b", "2026-11-20T10:00:00.000Z"),
    thread("c", null),
  ]);
  // One sound is two notes.
  expect(app.audio.notes).toBe(2);

  app.audio.now = 10;
  app.focus("c");
  app.show([
    thread("a", "2026-11-20T10:00:00.000Z"),
    thread("b", "2026-11-20T10:00:00.000Z"),
    thread("c", "2026-11-20T10:01:00.000Z"),
  ]);
  expect(app.audio.notes).toBe(2);

  app.show([
    thread("a", null),
    thread("b", "2026-11-20T10:00:00.000Z"),
    thread("c", "2026-11-20T10:01:00.000Z"),
  ]);
  app.show([
    thread("a", "2026-11-20T10:02:00.000Z"),
    thread("b", "2026-11-20T10:00:00.000Z"),
    thread("c", "2026-11-20T10:01:00.000Z"),
  ]);
  expect(app.audio.notes).toBe(4);

  useReadoutSettingsStore.setState({ finishSound: false });
  expect(app.audio.closes).toBe(1);
  app.audio.now = 20;
  app.show([thread("a", null), thread("b", null), thread("c", null)]);
  app.show([
    thread("a", "2026-11-20T10:03:00.000Z"),
    thread("b", "2026-11-20T10:00:00.000Z"),
    thread("c", "2026-11-20T10:01:00.000Z"),
  ]);
  expect(app.audio.notes).toBe(4);
  expect(app.setMenuBarUnread).not.toHaveBeenCalled();
});

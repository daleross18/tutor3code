import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { toastManager } from "../components/ui/toast";
import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";
import {
  installPaneNarrowPanelGuard,
  PANE_GUARDED_PANEL_ACTIONS,
  paneNarrowSideChatReason,
} from "./paneNarrowPanel";
import { paneRefusesPanel, trackPanePanelView } from "./panePanelViews";

const threadOf = (id: string) =>
  scopeThreadRef(EnvironmentId.make("env-narrow"), ThreadId.make(id));
const panelOf = (ref: ReturnType<typeof threadOf>) =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref);

// The stock actions that do not open the panel after a user action. A new action of the stock
// store fails the test below, and then needs a place in one of the two lists.
const PASSED_PANEL_ACTIONS = [
  "requestMaximize",
  "consumeMaximizeRequest",
  "getUserActionRevision",
  "markUserAction",
  "openProactive",
  "renameDevice",
  "navigateFolder",
  "setPullRequestDetailTab",
  "settlePullRequestReveal",
  "splitTerminal",
  "activateTerminal",
  "closeTerminal",
  "activateSurface",
  "revealSurface",
  "closeSurface",
  "closeOtherSurfaces",
  "closeSurfacesToRight",
  "closeAllSurfaces",
  "moveSurface",
  "reconcileBrowserSurfaces",
  "reconcileFileSurfaces",
  "close",
  "setMaximized",
  "setThreadPanelOpen",
  "toggleThreadPanel",
  "removeThread",
];

it("every action of the right panel store is guarded or passed on purpose", () => {
  const actions = Object.entries(useRightPanelStore.getState()).flatMap(([name, value]) =>
    typeof value === "function" ? [name] : [],
  );
  expect(actions.toSorted()).toEqual(
    [...PANE_GUARDED_PANEL_ACTIONS, ...PASSED_PANEL_ACTIONS].toSorted(),
  );
});

it("a thread shown only in narrow panes refuses a panel surface, with a message and no stored change", () => {
  const narrow = threadOf("narrow-only");
  const both = threadOf("narrow-and-wide");
  const hidden = threadOf("not-shown");
  using toast = vi.spyOn(toastManager, "add").mockReturnValue("toast");
  const stockOpenFile = useRightPanelStore.getState().openFile;
  const untrackNarrow = trackPanePanelView(narrow, true);
  const untrackBoth = [trackPanePanelView(both, true), trackPanePanelView(both, false)];
  expect([narrow, both, hidden].map(paneRefusesPanel)).toEqual([true, false, false]);
  const uninstall = installPaneNarrowPanelGuard();

  useRightPanelStore.getState().openFile(narrow, "src/a.ts");
  useRightPanelStore.getState().open(narrow, "files");
  useRightPanelStore.getState().toggleVisibility(narrow);
  expect(panelOf(narrow)).toMatchObject({ isOpen: false, surfaces: [] });
  expect(toast).toHaveBeenCalledTimes(3);
  expect(toast.mock.lastCall?.[0]).toMatchObject({
    title: "This pane is too narrow for the right panel",
    description: "Make this pane 720 px wide or more to use the right panel.",
  });

  // What an agent opens with no user action passes, and shows when the pane is wide.
  useRightPanelStore
    .getState()
    .openDevice(
      narrow,
      { hostId: "host-1", deviceId: "device-1", platform: "ios", name: "Phone" },
      true,
    );
  expect(panelOf(narrow).isOpen).toBe(true);
  expect(toast).toHaveBeenCalledTimes(3);

  // A thread that a wide pane also shows, and a thread that no pane shows, open as in stock.
  useRightPanelStore.getState().openFile(both, "src/b.ts");
  useRightPanelStore.getState().openFile(hidden, "src/c.ts");
  expect([both, hidden].map((ref) => panelOf(ref).isOpen)).toEqual([true, true]);

  // The pane is wide again: the same thread opens a surface.
  untrackNarrow();
  const untrackWide = trackPanePanelView(narrow, false);
  useRightPanelStore.getState().openFile(narrow, "src/a.ts");
  expect(panelOf(narrow).surfaces.map((surface) => surface.kind)).toContain("file");
  expect(toast).toHaveBeenCalledTimes(3);

  uninstall();
  expect(useRightPanelStore.getState().openFile).toBe(stockOpenFile);
  for (const untrack of [untrackWide, ...untrackBoth]) untrack();
  expect(paneRefusesPanel(both)).toBe(false);
});

it("a side chat gives the narrow-pane reason only in a narrow pane", () => {
  expect(paneNarrowSideChatReason(false)).toBeNull();
  expect(paneNarrowSideChatReason(true)).toBe(
    "Make this pane 720 px wide or more to use the right panel.",
  );
});

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { installPaneTerminalReveal } from "./paneTerminalReveal";

const threadOf = (id: string) =>
  scopeThreadRef(EnvironmentId.make("env-reveal"), ThreadId.make(id));
const maximizedOf = (ref: ReturnType<typeof threadOf>) =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref).maximized === true;

it("a drawer that opens restores the maximized right panel of its own thread only", () => {
  const opened = threadOf("reveal-opened");
  const alreadyOpen = threadOf("reveal-already-open");
  const other = threadOf("reveal-other");
  for (const ref of [opened, alreadyOpen, other]) {
    // The store keeps no state for a closed panel with no surface.
    useRightPanelStore.getState().toggleVisibility(ref);
    useRightPanelStore.getState().setMaximized(ref, true);
  }
  // Open before the subscription: no transition, so this panel stays as the user left it.
  useTerminalUiStateStore.getState().setTerminalOpen(alreadyOpen, true);
  const uninstall = installPaneTerminalReveal();

  useTerminalUiStateStore.getState().setTerminalHeight(alreadyOpen, 300);
  expect([opened, alreadyOpen, other].map(maximizedOf)).toEqual([true, true, true]);

  useTerminalUiStateStore.getState().setTerminalOpen(opened, true);
  expect([opened, alreadyOpen, other].map(maximizedOf)).toEqual([false, true, true]);

  // The user can maximize the panel over an open drawer, as in stock.
  useRightPanelStore.getState().setMaximized(opened, true);
  useTerminalUiStateStore.getState().setTerminalHeight(opened, 300);
  expect(maximizedOf(opened)).toBe(true);

  uninstall();
  useTerminalUiStateStore.getState().setTerminalOpen(other, true);
  expect(maximizedOf(other)).toBe(true);
});

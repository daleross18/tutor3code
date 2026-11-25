import { expect, it } from "vite-plus/test";

import { shouldShowComposerContextStrip } from "../components/BranchToolbar.logic";
import { resolvePaneKeepsContextStrip } from "./paneContextStrip";

type Cell = Parameters<typeof resolvePaneKeepsContextStrip>[0];

/** The stock rule for a started thread, with the setting as hunk r2-bottombar-context-strip-2 passes it. */
const startedThreadShowsStrip = (
  cell: Cell,
  settingOn: boolean,
  checkout: { isGitRepo: boolean; showEnvironmentIndicator: boolean } = {
    isGitRepo: true,
    showEnvironmentIndicator: false,
  },
) =>
  shouldShowComposerContextStrip({
    isDraftHeroState: false,
    persistInActiveThreads: settingOn || resolvePaneKeepsContextStrip(cell),
    hasActiveProject: true,
    ...checkout,
  });

it("a started thread keeps the strip in a pane wherever more than one pane or tab exists", () => {
  expect(startedThreadShowsStrip({ multi: true }, false)).toBe(true);
  expect(startedThreadShowsStrip({ multi: true }, true)).toBe(true);
});

it.each([
  ["one tab with one pane", { multi: false }],
  ["a view outside a pane", null],
] as const)("%s follows the stock setting", (_name, cell) => {
  expect(startedThreadShowsStrip(cell, false)).toBe(false);
  expect(startedThreadShowsStrip(cell, true)).toBe(true);
});

it("a pane adds no empty strip for a folder that is no repository on the one environment", () => {
  const checkout = { isGitRepo: false, showEnvironmentIndicator: false };
  expect(startedThreadShowsStrip({ multi: true }, false, checkout)).toBe(false);
  expect(
    startedThreadShowsStrip({ multi: true }, false, {
      ...checkout,
      showEnvironmentIndicator: true,
    }),
  ).toBe(true);
});

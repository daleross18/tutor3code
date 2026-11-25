import { expect, it } from "vite-plus/test";

import { useReadoutSettingsStore } from "./readoutSettings";
import { isServerNamedWorktree, paneWorktreeLabel } from "./worktreeLabel";

it.each([
  ["a folder with a name and an id", "t3-end-of-day-routine-74afe757b0907193", true],
  ["a folder with a temporary id only", "t3-cdb6aca1-78d165d24cc028c8", true],
  ["a name with no prefix", "fix-login-0123456789abcdef", true],
  ["a folder that the user named", "feature-x", false],
  ["a temporary branch with no id", "t3-ff466c42", false],
  ["an id that is too short", "t3-fix-74afe757b090719", false],
  ["the stock label of a local checkout", "Local checkout", false],
])("isServerNamedWorktree: %s", (_name, folder, expected) => {
  expect(isServerNamedWorktree(folder)).toBe(expected);
});

it("the bottom bar gets no folder label for a server-named worktree, and the stock label with the setting off", () => {
  const folder = "t3-cdb6aca1-78d165d24cc028c8";
  const { setReadoutSetting } = useReadoutSettingsStore.getState();
  expect(paneWorktreeLabel(folder)).toBe("");
  expect(paneWorktreeLabel("Local checkout")).toBe("Local checkout");
  setReadoutSetting("hideWorktreeFolder", false);
  expect(paneWorktreeLabel(folder)).toBe(folder);
  setReadoutSetting("hideWorktreeFolder", true);
});

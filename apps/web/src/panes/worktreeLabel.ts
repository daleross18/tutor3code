import "./worktreeLabel.css";
import { useReadoutSettingsStore } from "./readoutSettings";

// The stock server names a worktree folder `<branch at the start, flattened>-<16 hex digits>`.
const SERVER_NAMED_FOLDER = /-[0-9a-f]{16}$/;

/** True for a worktree folder that the server named. The branch beside it carries the name. */
export function isServerNamedWorktree(folderName: string): boolean {
  return SERVER_NAMED_FOLDER.test(folderName);
}

/**
 * The folder label of the bottom bar. A folder that the server named gets no label, and the
 * style file then hides the folder item and its separator. With the setting off, and for each
 * other label ("Local checkout", a folder with a name of the user), the label is stock.
 */
export function paneWorktreeLabel(label: string): string {
  return useReadoutSettingsStore.getState().hideWorktreeFolder && isServerNamedWorktree(label)
    ? ""
    : label;
}

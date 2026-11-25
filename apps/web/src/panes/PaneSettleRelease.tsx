import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentThreadShells } from "../state/threads";
import { usePaneArmedThreadStore } from "./paneArmedThreadStore";
import {
  focusedPaneShowing,
  releasePanesOfThread,
  settleWatchStep,
  watchedThreads,
} from "./paneSettleWatch";
import { usePaneStore } from "./paneStore";
import { usePaneThreadPullRequest } from "./paneThreadPullRequest";
import { usePaneThreadStore } from "./paneThreadStore";
import type { PaneLayout } from "./paneTree";

function ThreadSettleWatch({ threadRef }: { threadRef: ScopedThreadRef }) {
  const router = useRouter();
  const { thread, pullRequest } = usePaneThreadPullRequest(threadRef);
  const settled = thread === null ? null : thread.settledOverride === "settled";
  const merged = pullRequest?.state === "merged";
  const threadKey = scopedThreadKey(threadRef);
  // The pane that had focus at the instant the thread settled. The stock settle action moves
  // the route to the next thread after that instant, and before this component renders.
  const focusedAtSettle = useRef<string | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the pane store at the instant the thread shell of the server state becomes settled
  useEffect(() => {
    const shellAtom = environmentThreadShells.threadShellAtom(threadRef);
    let wasSettled = appAtomRegistry.get(shellAtom)?.settledOverride === "settled";
    return appAtomRegistry.subscribe(shellAtom, (shell) => {
      const isSettled = shell?.settledOverride === "settled";
      if (isSettled && !wasSettled) {
        focusedAtSettle.current = focusedPaneShowing(usePaneStore.getState().layout, threadKey);
      }
      wasSettled = isSettled;
    });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the thread key stands for the thread ref, which is a new object for each layout
  }, [threadKey]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the armed mark of a shown thread to the fork store, and gives the panes of a thread that settled after its merge a new draft in the pane store
  useEffect(() => {
    const store = usePaneArmedThreadStore.getState();
    const step = settleWatchStep(
      store.armedThreadKeys.includes(threadKey),
      settled === null ? null : { settled, merged },
    );
    store.setThreadArmed(threadKey, step.armed);
    // A merge that is seen later than the settle frees the pane with no move of the focus.
    const keepFocusPaneId = settled ? focusedAtSettle.current : null;
    if (settled) focusedAtSettle.current = null;
    if (step.release) releasePanesOfThread(router, threadRef, keepFocusPaneId);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the thread key stands for the thread ref, which is a new object for each layout
  }, [merged, router, settled, threadKey]);
  return null;
}

/**
 * Watches every server thread of the layout, also in the tabs that are not mounted, while more
 * than one pane or tab exists and the setting is on. It renders nothing.
 */
export function PaneSettleRelease({ layout }: { layout: PaneLayout }) {
  const enabled = usePaneThreadStore((settings) => settings.releasePaneOnMergeSettle);
  const threadRefs = watchedThreads(enabled, layout);
  const watchedKeys = threadRefs.map(scopedThreadKey).join("\n");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drops the armed mark, in the fork store, of each thread that no pane shows any more
  useEffect(() => {
    const watched = new Set(watchedKeys === "" ? [] : watchedKeys.split("\n"));
    usePaneArmedThreadStore.getState().retainArmedThreads((threadKey) => watched.has(threadKey));
  }, [watchedKeys]);
  return threadRefs.map((threadRef) => (
    <ThreadSettleWatch key={scopedThreadKey(threadRef)} threadRef={threadRef} />
  ));
}

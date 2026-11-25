import {
  Navigate as RouterNavigate,
  useLocation as useRouterLocation,
  useNavigate as useRouterNavigate,
  useRouter,
  type AnyRouter,
  type ParsedLocation,
  type RegisteredRouter,
} from "@tanstack/react-router";
import { use, useEffect } from "react";

import type { NewThreadHandler } from "../hooks/useHandleNewThread";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { replacePaneThread, startNewThreadInPane } from "./paneActions";
import { PaneCellContext, type PaneCellContextValue, usePanePassive } from "./paneContext";
import { literalKey } from "./paneRouteSync";
import { usePaneStore } from "./paneStore";
import { findLeaf, findTabOfLeaf, getActiveTab, isMultiLayout } from "./paneTree";

const HOME_ROUTE = "/";
const SERVER_THREAD_ROUTE = "/$environmentId/$threadId";

function readStringParam(params: unknown, name: "environmentId" | "threadId"): string | undefined {
  if (typeof params !== "object" || params === null || !(name in params)) return undefined;
  const value = (params as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * Stock goes home when a thread can no longer be shown: a missing or hidden thread, or a draft
 * that is gone. Home has no thread view, so every pane would unmount. With more than one pane,
 * the pane takes its own new draft thread instead, and the other panes stay as they are.
 */
function handlesNavigation(cell: Pick<PaneCellContextValue, "focused" | "multi">, to: unknown) {
  return cell.focused ? cell.multi && to === HOME_ROUTE : true;
}

/**
 * A pane changes its own target: home gives the pane a new draft thread, a server thread route
 * shows that thread, and every other route is ignored.
 */
function navigatePane(
  router: AnyRouter,
  paneId: string,
  to: unknown,
  environmentId: string | undefined,
  threadId: string | undefined,
): void {
  const store = usePaneStore.getState();
  const tab = findTabOfLeaf(store.layout, paneId);
  const shown = tab === null ? undefined : findLeaf(tab.root, paneId)?.target;
  if (shown === undefined) return;
  if (to === HOME_ROUTE) {
    replacePaneThread(router, paneId);
    return;
  }
  if (to !== SERVER_THREAD_ROUTE) return;
  const target = resolveThreadRouteTarget({ environmentId, threadId });
  if (target === null) return;
  // An equal target object is a new layout, and a new layout renders this pane again.
  if (shown !== null && literalKey(shown) === literalKey(target)) return;
  store.setPaneTarget(paneId, target);
}

type RouterUseNavigate = typeof useRouterNavigate<RegisteredRouter, string>;
type RouterNavigateFn = ReturnType<RouterUseNavigate>;

// One function per pane id, because ThreadRouteView uses it as an effect dependency.
const paneNavigateByPaneId = new Map<string, RouterNavigateFn>();

function paneNavigateFor(router: AnyRouter, paneId: string): RouterNavigateFn {
  const cached = paneNavigateByPaneId.get(paneId);
  if (cached !== undefined) return cached;
  const navigate = ((options: { to?: unknown; params?: unknown }) => {
    if (!handlesNavigation(readPaneFocus(paneId), options.to)) {
      return router.navigate(options as never);
    }
    navigatePane(
      router,
      paneId,
      options.to,
      readStringParam(options.params, "environmentId"),
      readStringParam(options.params, "threadId"),
    );
    return Promise.resolve();
  }) as RouterNavigateFn;
  paneNavigateByPaneId.set(paneId, navigate);
  return navigate;
}

/** Read at call time: the cached function outlives the render that made it. */
function readPaneFocus(paneId: string): Pick<PaneCellContextValue, "focused" | "multi"> {
  const { layout } = usePaneStore.getState();
  return {
    focused: getActiveTab(layout).focusedPaneId === paneId,
    multi: isMultiLayout(layout),
  };
}

function usePaneNavigate(defaultOptions?: Parameters<RouterUseNavigate>[0]): RouterNavigateFn {
  const routerNavigate = useRouterNavigate(defaultOptions);
  const router = useRouter();
  const cell = use(PaneCellContext);
  // One tab with one pane uses the router's own function, as stock does.
  return cell === null || !cell.multi ? routerNavigate : paneNavigateFor(router, cell.paneId);
}

/**
 * The stock new-thread handler of a chat view, except in a pane that does not have focus when
 * the handler runs. That pane opens the new thread itself.
 */
export function usePaneNewThreadHandler(stock: NewThreadHandler): NewThreadHandler {
  const router = useRouter();
  const cell = use(PaneCellContext);
  if (cell === null || !cell.multi) return stock;
  const { paneId } = cell;
  return (...request) =>
    readPaneFocus(paneId).focused
      ? stock(...request)
      : startNewThreadInPane(router, paneId, ...request);
}

function PaneOwnNavigate({
  paneId,
  to,
  environmentId,
  threadId,
}: {
  paneId: string;
  to: unknown;
  environmentId: string | undefined;
  threadId: string | undefined;
}) {
  const router = useRouter();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a redirect rendered by a pane that handles it itself writes that pane's target to the pane store after commit
  useEffect(() => {
    navigatePane(router, paneId, to, environmentId, threadId);
  }, [environmentId, paneId, router, threadId, to]);
  return null;
}

function PaneNavigate(props: { to?: unknown; params?: unknown }) {
  const cell = use(PaneCellContext);
  if (cell === null || !handlesNavigation(cell, props.to)) {
    return <RouterNavigate {...(props as Parameters<typeof RouterNavigate>[0])} />;
  }
  return (
    <PaneOwnNavigate
      paneId={cell.paneId}
      to={props.to}
      environmentId={readStringParam(props.params, "environmentId")}
      threadId={readStringParam(props.params, "threadId")}
    />
  );
}

// A pane without focus is not at the window's location, which names the focused pane's thread.
const PASSIVE_PANE_LOCATION = { href: "/", state: {} } as ParsedLocation;

type SelectLocation = (location: ParsedLocation) => unknown;
const useSelectedRouterLocation = useRouterLocation as unknown as (options: {
  select: SelectLocation;
}) => unknown;

function usePaneLocation(options?: { select?: SelectLocation }): unknown {
  const passive = usePanePassive();
  return useSelectedRouterLocation({
    select: (location) => {
      const shown = passive ? PASSIVE_PANE_LOCATION : location;
      return options?.select === undefined ? shown : options.select(shown);
    },
  });
}

/**
 * The router's `useLocation` with a selector, except in a pane without focus. A pane focus move
 * changes the window location, and a chat view that reads it renders again. With this, only
 * the two panes whose focus changed render, not every pane of the tab.
 */
export const useLocation = usePaneLocation as unknown as typeof useRouterLocation;

/** The router's `useNavigate`, except where a pane handles the navigation itself. */
export const useNavigate = usePaneNavigate as typeof useRouterNavigate;

/** The router's `Navigate`, except where a pane handles the navigation itself. */
export const Navigate = PaneNavigate as unknown as typeof RouterNavigate;

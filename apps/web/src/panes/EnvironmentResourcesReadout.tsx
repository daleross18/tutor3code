import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useComposerDraftStore } from "../composerDraftStore";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";
import { cn } from "../lib/utils";
import {
  useConnectedEnvironmentIds,
  useEnvironment,
  usePrimaryEnvironmentId,
} from "../state/environments";
import { hostEnvironmentIdAtom } from "../state/primaryEnvironment";
import { useEnvironmentQuery } from "../state/query";
import {
  describeEnvironmentResources,
  ENVIRONMENT_RESOURCES_REFRESH_MS,
  isLocalDiskEnvironment,
  orderEnvironmentsForReadout,
  type DiskSpace,
} from "./environmentResources";
import { useResourcesCollapseStore } from "./environmentResourcesCollapse";
import { environmentResourcesQuery } from "./environmentResourcesQuery";
import { localDiskSpaceReader } from "./localDiskSpace";
import { useReadoutSettingsStore } from "./readoutSettings";

/** The focused pane is the route, so the route names the thread that has focus. */
function useFocusedEnvironmentId(): EnvironmentId | null {
  const target = useThreadRouteTarget();
  const draftId = target?.kind === "draft" ? target.draftId : null;
  const draftEnvironmentId = useComposerDraftStore((store) =>
    draftId === null ? null : (store.getDraftSession(draftId)?.environmentId ?? null),
  );
  return target?.kind === "server" ? target.threadRef.environmentId : draftEnvironmentId;
}

/** Reads on a timer while the window shows, and one time when a hidden window shows again. */
function runWhileVisible(read: () => void): () => void {
  const timer = window.setInterval(() => {
    if (!document.hidden) read();
  }, ENVIRONMENT_RESOURCES_REFRESH_MS);
  const onVisibilityChange = () => {
    if (!document.hidden) read();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

/** The disk of the app's own machine. Null in a browser, and for every other machine. */
function useLocalDiskSpace(enabled: boolean): DiskSpace | null {
  const [disk, setDisk] = useState<DiskSpace | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the disk of this machine from the Electron main process, now and on a timer
  useEffect(() => {
    const readDisk = enabled ? localDiskSpaceReader() : null;
    if (readDisk === null) return;
    let current = true;
    const read = () =>
      void readDisk()
        .then((next) => {
          if (current) setDisk(next);
        })
        .catch(() => {});
    read();
    const stop = runWhileVisible(read);
    return () => {
      current = false;
      stop();
    };
  }, [enabled]);
  return enabled ? disk : null;
}

function EnvironmentResourcesRow({
  environmentId,
  emphasized,
}: {
  environmentId: EnvironmentId;
  emphasized: boolean;
}) {
  const environment = useEnvironment(environmentId);
  // Stock asks for the same sample to pick a machine for a new thread, and shows it nowhere.
  const { data: memory, refresh } = useEnvironmentQuery(
    environmentResourcesQuery({ environmentId, input: {} }),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the query has no refresh interval, so a timer and the window's return to view ask the environment again
  useEffect(() => runWhileVisible(refresh), [refresh]);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const hostEnvironmentId = useAtomValue(hostEnvironmentIdAtom);
  const disk = useLocalDiskSpace(
    isLocalDiskEnvironment({
      environmentId,
      hasDiskReader: localDiskSpaceReader() !== null,
      primaryEnvironmentId,
      hostEnvironmentId,
    }),
  );
  const label = environment?.label ?? environmentId;
  const view = describeEnvironmentResources({ label, memory, disk });
  if (view.diskText === null && view.memoryText === null) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            role="img"
            aria-label={view.description}
            data-environment-resources-row={environmentId}
            className="flex min-w-0 items-baseline gap-1.5"
          />
        }
      >
        <span className={cn("min-w-0 truncate", emphasized && "text-foreground/80")}>{label}</span>
        {view.diskText !== null ? (
          <>
            <span aria-hidden="true">·</span>
            <span
              data-low={view.diskLow || undefined}
              className={cn("shrink-0", view.diskLow && "text-warning-foreground")}
            >
              {view.diskText}
            </span>
          </>
        ) : null}
        {view.memoryText !== null ? (
          <>
            <span aria-hidden="true">·</span>
            <span
              data-low={view.memoryLow || undefined}
              className={cn("shrink-0", view.memoryLow && "text-warning-foreground")}
            >
              {view.memoryText}
            </span>
          </>
        ) : null}
      </TooltipTrigger>
      <TooltipPopup side="top">{view.description}</TooltipPopup>
    </Tooltip>
  );
}

function EnvironmentResourcesRows() {
  const focusedEnvironmentId = useFocusedEnvironmentId();
  const environmentIds = orderEnvironmentsForReadout(
    useConnectedEnvironmentIds(),
    focusedEnvironmentId,
  );
  const collapsed = useResourcesCollapseStore((state) => state.collapsed);
  const toggle = useResourcesCollapseStore((state) => state.toggle);
  if (environmentIds.length === 0) return null;
  return (
    <div
      data-environment-resources={collapsed ? "collapsed" : "open"}
      className="flex min-w-0 flex-col px-2 text-2xs text-muted-foreground tabular-nums"
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        className="inline-flex cursor-pointer items-center gap-1 self-start hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={toggle}
      >
        <ChevronRightIcon aria-hidden className={cn("size-3", !collapsed && "rotate-90")} />
        Machines
      </button>
      {/* A closed readout mounts no row, so no request goes to an environment. */}
      {collapsed
        ? null
        : environmentIds.map((environmentId) => (
            <EnvironmentResourcesRow
              key={environmentId}
              environmentId={environmentId}
              emphasized={environmentIds.length > 1 && environmentId === focusedEnvironmentId}
            />
          ))}
    </div>
  );
}

/** Free disk space and memory of each connected environment, in the sidebar footer. */
export function EnvironmentResourcesReadout() {
  const enabled = useReadoutSettingsStore((settings) => settings.showEnvironmentResources);
  return enabled ? <EnvironmentResourcesRows /> : null;
}

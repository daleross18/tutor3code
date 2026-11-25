import type { EnvironmentId, HostResourcesSnapshot } from "@t3tools/contracts";

/** The readout turns amber below this share of free disk space: 10%, the limit the user set. */
export const LOW_FREE_DISK_SHARE = 0.1;
/** The readout turns amber below this share of free memory: 10%, the limit the user set. */
export const LOW_FREE_MEMORY_SHARE = 0.1;
/**
 * Time between two reads of one environment. A read makes the stock server sample its CPU for
 * 200 ms, so the readout asks two times a minute and not at all while the window is hidden.
 */
export const ENVIRONMENT_RESOURCES_REFRESH_MS = 30_000;

const GIBIBYTE = 1024 ** 3;

export interface DiskSpace {
  readonly availableBytes: number;
  readonly totalBytes: number;
}

export interface EnvironmentResourcesView {
  /** "41 GB free". Null when the environment reports no disk space. */
  readonly diskText: string | null;
  readonly diskLow: boolean;
  /** "RAM 12 / 64 GB": free memory, then all memory. Null when no sample arrived. */
  readonly memoryText: string | null;
  readonly memoryLow: boolean;
  /** One sentence for each number, and one for a number that is absent. */
  readonly description: string;
}

/** Whole gigabytes from 10 GB, one decimal below. The unit is 1024^3 bytes, as in stock. */
export function formatGigabytes(bytes: number): string {
  const gigabytes = Math.max(0, bytes) / GIBIBYTE;
  return gigabytes >= 9.95 ? String(Math.round(gigabytes)) : gigabytes.toFixed(1);
}

function isLow(availableBytes: number, totalBytes: number, lowShare: number): boolean {
  return totalBytes > 0 && availableBytes / totalBytes < lowShare;
}

export function describeEnvironmentResources(input: {
  readonly label: string;
  readonly memory: Pick<HostResourcesSnapshot, "availableMemoryBytes" | "totalMemoryBytes"> | null;
  readonly disk: DiskSpace | null;
}): EnvironmentResourcesView {
  const { label, disk } = input;
  const memory = input.memory !== null && input.memory.totalMemoryBytes > 0 ? input.memory : null;
  return {
    diskText: disk ? `${formatGigabytes(disk.availableBytes)} GB free` : null,
    diskLow: disk !== null && isLow(disk.availableBytes, disk.totalBytes, LOW_FREE_DISK_SHARE),
    memoryText: memory
      ? `RAM ${formatGigabytes(memory.availableMemoryBytes)} / ${formatGigabytes(memory.totalMemoryBytes)} GB`
      : null,
    memoryLow:
      memory !== null &&
      isLow(memory.availableMemoryBytes, memory.totalMemoryBytes, LOW_FREE_MEMORY_SHARE),
    description: [
      `${label}:`,
      disk
        ? `${formatGigabytes(disk.availableBytes)} GB of ${formatGigabytes(disk.totalBytes)} GB disk space free.`
        : "The server of this environment does not report free disk space.",
      memory
        ? `${formatGigabytes(memory.availableMemoryBytes)} GB of ${formatGigabytes(memory.totalMemoryBytes)} GB memory free.`
        : "No memory reading yet.",
    ].join(" "),
  };
}

/** The environment of the focused thread comes first. The other environments keep their order. */
export function orderEnvironmentsForReadout(
  connected: ReadonlyArray<EnvironmentId>,
  focused: EnvironmentId | null,
): ReadonlyArray<EnvironmentId> {
  return focused !== null && connected.includes(focused)
    ? [focused, ...connected.filter((environmentId) => environmentId !== focused)]
    : connected;
}

/**
 * Only the desktop app can read a disk, and only the disk of its own machine. That machine runs
 * the primary environment, and the background service that shares the app's T3 home.
 */
export function isLocalDiskEnvironment(input: {
  readonly environmentId: EnvironmentId;
  readonly hasDiskReader: boolean;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly hostEnvironmentId: string | null;
}): boolean {
  return (
    input.hasDiskReader &&
    (input.environmentId === input.primaryEnvironmentId ||
      input.environmentId === input.hostEnvironmentId)
  );
}

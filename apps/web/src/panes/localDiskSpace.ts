import type { DiskSpace } from "./environmentResources";

/** The desktop app reads the disk of its own machine. A browser has no reader. */
export function localDiskSpaceReader(): (() => Promise<DiskSpace | null>) | null {
  return window.desktopBridge?.getHostDiskSpace ?? null;
}

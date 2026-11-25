// @effect-diagnostics nodeBuiltinImport:off -- Effect's FileSystem service has no statfs.
import * as NodeFSP from "node:fs/promises";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";
import { GET_HOST_DISK_SPACE_CHANNEL } from "../forkChannels.ts";

const HostDiskSpace = Schema.Struct({
  availableBytes: Schema.Number,
  totalBytes: Schema.Number,
});

/** `bavail` is the space an unprivileged process can use, which is what `df` prints. */
export function diskSpaceFromStatfs(stats: {
  readonly bavail: number;
  readonly blocks: number;
  readonly bsize: number;
}): typeof HostDiskSpace.Type | null {
  const availableBytes = stats.bavail * stats.bsize;
  const totalBytes = stats.blocks * stats.bsize;
  return Number.isFinite(availableBytes) && Number.isFinite(totalBytes) && totalBytes > 0
    ? { availableBytes: Math.max(0, Math.min(availableBytes, totalBytes)), totalBytes }
    : null;
}

// The stock server reports memory and no disk space. The app's own machine can read its disk.
export const getHostDiskSpace = makeIpcMethod({
  channel: GET_HOST_DISK_SPACE_CHANNEL,
  payload: Schema.Void,
  result: Schema.NullOr(HostDiskSpace),
  handler: Effect.fn("desktop.ipc.forkHostDisk.getHostDiskSpace")(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    // A home directory that cannot be read gives no number, and the readout then shows none.
    return yield* Effect.promise(() =>
      NodeFSP.statfs(environment.homeDirectory).then(diskSpaceFromStatfs, () => null),
    );
  }),
});

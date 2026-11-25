import { expect, it } from "vite-plus/test";

import { diskSpaceFromStatfs } from "./forkHostDisk.ts";

it.each([
  ["free and total space in bytes", { bavail: 10, blocks: 40, bsize: 4096 }, [40_960, 163_840]],
  [
    "no more free space than the volume holds",
    { bavail: 50, blocks: 40, bsize: 512 },
    [20_480, 20_480],
  ],
] as const)("reports %s", (_name, stats, [availableBytes, totalBytes]) => {
  expect(diskSpaceFromStatfs(stats)).toEqual({ availableBytes, totalBytes });
});

it("reports nothing for a volume with no size", () => {
  expect(diskSpaceFromStatfs({ bavail: 0, blocks: 0, bsize: 4096 })).toBeNull();
  expect(diskSpaceFromStatfs({ bavail: Number.NaN, blocks: 1, bsize: 1 })).toBeNull();
});

import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  describeEnvironmentResources,
  formatGigabytes,
  isLocalDiskEnvironment,
  LOW_FREE_DISK_SHARE,
  LOW_FREE_MEMORY_SHARE,
  orderEnvironmentsForReadout,
} from "./environmentResources";

const GB = 1024 ** 3;
const box = EnvironmentId.make("box");
const laptop = EnvironmentId.make("laptop");

describe("environmentResources", () => {
  it.each([
    [41.4 * GB, "41"],
    [9.94 * GB, "9.9"],
    [9.96 * GB, "10"],
    [0.52 * GB, "0.5"],
    [-1, "0.0"],
  ])("formats %d bytes as %s GB", (bytes, text) => {
    expect(formatGigabytes(bytes)).toBe(text);
  });

  it("names free disk space, then free and total memory", () => {
    expect(
      describeEnvironmentResources({
        label: "dale-nix",
        memory: { availableMemoryBytes: 12 * GB, totalMemoryBytes: 64 * GB },
        disk: { availableBytes: 41 * GB, totalBytes: 400 * GB },
      }),
    ).toEqual({
      diskText: "41 GB free",
      diskLow: false,
      memoryText: "RAM 12 / 64 GB",
      memoryLow: false,
      description: "dale-nix: 41 GB of 400 GB disk space free. 12 GB of 64 GB memory free.",
    });
  });

  it("shows memory only for an environment whose server reports no disk space", () => {
    const view = describeEnvironmentResources({
      label: "dale-nix",
      memory: { availableMemoryBytes: 12 * GB, totalMemoryBytes: 64 * GB },
      disk: null,
    });
    expect(view.diskText).toBeNull();
    expect(view.diskLow).toBe(false);
    expect(view.memoryText).toBe("RAM 12 / 64 GB");
    expect(view.description).toBe(
      "dale-nix: The server of this environment does not report free disk space. 12 GB of 64 GB memory free.",
    );
  });

  it("shows no memory before a sample, and none for a sample with no total", () => {
    for (const memory of [null, { availableMemoryBytes: 0, totalMemoryBytes: 0 }]) {
      const view = describeEnvironmentResources({ label: "box", memory, disk: null });
      expect(view.memoryText).toBeNull();
      expect(view.memoryLow).toBe(false);
    }
  });

  it("turns amber below 10% free disk space and below 10% free memory, not at 10%", () => {
    expect(LOW_FREE_DISK_SHARE).toBe(0.1);
    expect(LOW_FREE_MEMORY_SHARE).toBe(0.1);
    const view = (freeDisk: number, freeMemory: number) =>
      describeEnvironmentResources({
        label: "box",
        memory: { availableMemoryBytes: freeMemory * GB, totalMemoryBytes: 100 * GB },
        disk: { availableBytes: freeDisk * GB, totalBytes: 100 * GB },
      });
    expect(view(10, 10)).toMatchObject({ diskLow: false, memoryLow: false });
    expect(view(9.9, 50)).toMatchObject({ diskLow: true, memoryLow: false });
    expect(view(50, 9.9)).toMatchObject({ diskLow: false, memoryLow: true });
  });

  it("puts the environment of the focused thread first and keeps the order of the others", () => {
    expect(orderEnvironmentsForReadout([laptop, box], box)).toEqual([box, laptop]);
    expect(orderEnvironmentsForReadout([laptop, box], laptop)).toEqual([laptop, box]);
    expect(orderEnvironmentsForReadout([laptop, box], null)).toEqual([laptop, box]);
    // The focused thread can belong to an environment that lost its connection.
    expect(orderEnvironmentsForReadout([laptop], box)).toEqual([laptop]);
  });

  it("reads the disk only for the machine of the desktop app", () => {
    const ask = (environmentId: EnvironmentId, hasDiskReader = true) =>
      isLocalDiskEnvironment({
        environmentId,
        hasDiskReader,
        primaryEnvironmentId: laptop,
        hostEnvironmentId: "service",
      });
    expect(ask(laptop)).toBe(true);
    expect(ask(EnvironmentId.make("service"))).toBe(true);
    expect(ask(box)).toBe(false);
    // A browser has no reader, and its primary environment can be a remote server.
    expect(ask(laptop, false)).toBe(false);
  });
});

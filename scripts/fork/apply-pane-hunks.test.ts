// @effect-diagnostics nodeBuiltinImport:off - Reads the upstream files that the hunks edit and runs the script on a temporary copy.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";

import { applyHunks, HUNK_SETS, hunkState, run, type Hunk } from "./apply-pane-hunks.ts";

const root = NodePath.resolve(import.meta.dirname, "../..");
const allHunks = Object.values(HUNK_SETS).flat();

const swap: Hunk = { id: "T1", file: "t.ts", anchor: "old();\n", replacement: "new();\n" };
const insert: Hunk = { id: "T2", file: "t.ts", anchor: "a();\n", replacement: "a();\nb();\n" };

it("applies a pending hunk once and reports it applied on the next run", () => {
  const first = applyHunks("a();\nold();\n", [swap, insert]);
  expect(first.results.map((result) => result.state)).toEqual(["pending", "pending"]);
  expect(first.content).toBe("a();\nb();\nnew();\n");

  const second = applyHunks(first.content, [swap, insert]);
  expect(second.results.map((result) => result.state)).toEqual(["applied", "applied"]);
  expect(second.content).toBe(first.content);
});

it.each([
  ["a missing anchor", "other();\n", "missing"],
  ["an anchor that occurs twice", "old();\nold();\n", "repeated"],
  ["a replacement that occurs twice", "new();\nnew();\n", "repeated"],
  ["the old and the new text together", "old();\nnew();\n", "repeated"],
] as const)("reports %s and leaves the content as it is", (_name, content, state) => {
  expect(hunkState(content, swap)).toBe(state);
  expect(applyHunks(content, [swap]).content).toBe(content);
});

it("gives every hunk its own id", () => {
  const ids = allHunks.map((hunk) => hunk.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it("finds every hunk of every hunk set applied in this checkout", () => {
  const states = allHunks.map((hunk) => ({
    id: hunk.id,
    state: hunkState(NodeFS.readFileSync(NodePath.join(root, hunk.file), "utf8"), hunk),
  }));
  expect(states.filter(({ state }) => state !== "applied")).toEqual([]);
});

it("rejects an unknown hunk set name", () => {
  expect(() => run({ root, sets: ["Z"], check: true, log: () => {} })).toThrow(/Unknown hunk set/);
});

it("fails a check on a pending hunk, writes only outside check mode, and writes nothing when an anchor is missing", () => {
  const file = HUNK_SETS.D![0]!.file;
  const stock = `import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";\n\nexport function DiffPanel() {\n  const routeThreadRef = useThreadRouteRef();\n  return routeThreadRef;\n}\n`;
  const tempRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "apply-pane-hunks-"));
  const path = NodePath.join(tempRoot, file);
  const runSetD = (check: boolean) => run({ root: tempRoot, sets: ["D"], check, log: () => {} });
  try {
    NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
    NodeFS.writeFileSync(path, stock);

    // A tree that does not carry the edits must not pass the check.
    expect(runSetD(true)).toBe(2);
    expect(NodeFS.readFileSync(path, "utf8")).toBe(stock);

    expect(runSetD(false)).toBe(0);
    const applied = NodeFS.readFileSync(path, "utf8");
    expect(applied).toContain("usePaneThreadRef(useThreadRouteRef())");
    expect(runSetD(true)).toBe(0);
    expect(runSetD(false)).toBe(0);
    expect(NodeFS.readFileSync(path, "utf8")).toBe(applied);

    // The import anchor is gone, so the second hunk must not be written either.
    const rewritten = stock.replace(
      `import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";\n`,
      "",
    );
    NodeFS.writeFileSync(path, rewritten);
    const lines: string[] = [];
    expect(
      run({ root: tempRoot, sets: ["D"], check: false, log: (line) => lines.push(line) }),
    ).toBe(1);
    // The run wrote nothing, so no line may say that a hunk was applied.
    expect(lines.filter((line) => line.startsWith("D"))).toEqual([
      `D1  missing  ${file}`,
      `D2  pending  ${file}`,
    ]);
    expect(runSetD(true)).toBe(1);
    expect(NodeFS.readFileSync(path, "utf8")).toBe(rewritten);
  } finally {
    NodeFS.rmSync(tempRoot, { recursive: true, force: true });
  }
});

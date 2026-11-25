import { NodeId, ProviderThreadId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  backgroundWorkTokens,
  formatWorkTokens,
  subagentTokenThreadId,
  subagentWorkTokens,
  sumWorkTokens,
  threadContextTokens,
  type TokenProjection,
} from "./workTokens";

const active = ProviderThreadId.make("provider-thread-active");
const retired = ProviderThreadId.make("provider-thread-retired");
const childThreadId = ThreadId.make("thread-child");
const updatedAt = DateTime.makeUnsafe("2026-11-19T10:00:00.000Z");

const report = (providerThreadId: ProviderThreadId, usedTokens: number, at: string) => ({
  providerThreadId,
  tokenUsage: { usedTokens, updatedAt: at },
});
const thread = (
  providerTurns: TokenProjection["providerTurns"],
  contextUsage: TokenProjection["providerThreads"][number]["contextUsage"] = null,
): TokenProjection => ({
  thread: { activeProviderThreadId: active },
  providerThreads: [{ id: active, contextUsage, updatedAt }],
  providerTurns,
});
const workflow = (totalTokens?: number) => ({
  phases: [],
  agents: [],
  ...(totalTokens === undefined ? {} : { totalTokens }),
});

describe("threadContextTokens", () => {
  it("is the newest report of the active provider conversation", () => {
    expect(
      threadContextTokens(
        thread([
          report(active, 41_000, "2026-11-19T10:00:00.000Z"),
          report(active, 182_400, "2026-11-19T10:05:00.000Z"),
          report(retired, 900_000, "2026-11-19T10:09:00.000Z"),
          { providerThreadId: active },
        ]),
      ),
    ).toBe(182_400);
  });

  it("falls back to the usage of the provider conversation, as the stock Context row does", () => {
    expect(threadContextTokens(thread([], { usedTokens: 64_000 }))).toBe(64_000);
  });

  it("is null with no thread detail, with no report and for a report of zero", () => {
    expect(threadContextTokens(null)).toBeNull();
    expect(threadContextTokens(thread([{ providerThreadId: active }]))).toBeNull();
    expect(threadContextTokens(thread([report(active, 0, "2026-11-19T10:00:00.000Z")]))).toBeNull();
  });
});

describe("subagent tokens", () => {
  const child = thread([report(active, 45_200, "2026-11-19T10:05:00.000Z")]);

  it("reads the child thread of a subagent that works, and no thread for a workflow", () => {
    expect(subagentTokenThreadId({ status: "running", childThreadId })).toBe(childThreadId);
    expect(subagentTokenThreadId({ status: "waiting", childThreadId: null })).toBeNull();
    expect(
      subagentTokenThreadId({ status: "running", childThreadId, workflow: workflow(7) }),
    ).toBeNull();
    for (const status of ["completed", "failed", "cancelled", "interrupted", "idle"] as const) {
      expect(subagentTokenThreadId({ status, childThreadId })).toBeNull();
    }
  });

  it("is the context of the child thread, or the total that a workflow reports", () => {
    expect(subagentWorkTokens({ status: "running", childThreadId }, child)).toBe(45_200);
    expect(
      subagentWorkTokens({ status: "running", childThreadId, workflow: workflow(310_000) }, child),
    ).toBe(310_000);
  });

  it("is null for work without a number and for work that ended", () => {
    expect(subagentWorkTokens({ status: "running", childThreadId }, null)).toBeNull();
    expect(
      subagentWorkTokens({ status: "running", childThreadId, workflow: workflow() }, child),
    ).toBeNull();
    expect(
      subagentWorkTokens({ status: "pending", childThreadId, workflow: workflow(0) }, null),
    ).toBeNull();
    expect(subagentWorkTokens({ status: "completed", childThreadId }, child)).toBeNull();
  });
});

describe("sumWorkTokens", () => {
  it("adds the members that work and leaves the others out", () => {
    expect(
      sumWorkTokens([
        { status: "running", tokens: 45_200 },
        { status: "waiting", tokens: 12_300 },
        { status: "completed", tokens: null },
        { status: "failed", tokens: 99_000 },
      ]),
    ).toBe(57_500);
  });

  it("gives no total when a working member has no number, or when no member works", () => {
    expect(
      sumWorkTokens([
        { status: "running", tokens: 45_200 },
        { status: "pending", tokens: null },
      ]),
    ).toBeNull();
    expect(sumWorkTokens([{ status: "completed", tokens: null }])).toBeNull();
    expect(sumWorkTokens([])).toBeNull();
  });
});

describe("backgroundWorkTokens", () => {
  const workflowNode = NodeId.make("node-workflow");
  const agentNode = NodeId.make("node-agent");
  const tokens = new Map([
    [workflowNode, 6_890_000],
    [agentNode, 45_200],
  ]);
  const turnItems = [
    { id: "item-workflow", type: "subagent", nativeItemRef: null, subagentId: workflowNode },
    {
      id: "item-agent",
      type: "subagent",
      nativeItemRef: { nativeId: "native-agent" },
      subagentId: agentNode,
    },
    { id: "item-command", type: "command_execution", nativeItemRef: null },
    { id: "item-other", type: "subagent", nativeItemRef: null, subagentId: NodeId.make("x") },
  ];

  it("adds the subagents that the bar lists, found by the stock key, and skips commands", () => {
    expect(
      backgroundWorkTokens([{ taskId: "item-workflow", kind: "subagent" }], turnItems, tokens),
    ).toBe(6_890_000);
    expect(
      backgroundWorkTokens(
        [
          { taskId: "item-workflow", kind: "subagent" },
          { taskId: "task-agent", kind: "subagent", nativeItemId: "native-agent" },
          { taskId: "item-command", kind: "command" },
        ],
        turnItems,
        tokens,
      ),
    ).toBe(6_935_200);
  });

  it("gives no number when a subagent has none or is not in this thread, or with no subagent", () => {
    const listed = { taskId: "item-workflow", kind: "subagent" } as const;
    expect(
      backgroundWorkTokens([listed, { taskId: "item-other", kind: "subagent" }], turnItems, tokens),
    ).toBeNull();
    expect(
      backgroundWorkTokens([listed, { taskId: "elsewhere", kind: "subagent" }], turnItems, tokens),
    ).toBeNull();
    expect(
      backgroundWorkTokens([{ taskId: "item-command", kind: "command" }], turnItems, tokens),
    ).toBeNull();
    expect(backgroundWorkTokens([], turnItems, tokens)).toBeNull();
  });
});

describe("formatWorkTokens", () => {
  it.each([
    [1, "1 token"],
    [512, "512 tokens"],
    [999.6, "1k tokens"],
    [1_000, "1k tokens"],
    [12_449, "12.4k tokens"],
    [99_949, "99.9k tokens"],
    [99_950, "100k tokens"],
    [182_400, "182k tokens"],
    [999_499, "999k tokens"],
    [999_500, "1m tokens"],
    [1_254_000, "1.25m tokens"],
  ])("%d is %s", (tokens, text) => {
    expect(formatWorkTokens(tokens)).toBe(text);
  });
});

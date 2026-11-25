import {
  MessageId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  collectThreadArtifacts,
  mergeArtifactTitles,
  readArtifactPublishOutput,
  type ArtifactPublishOutput,
} from "./threadArtifacts";

const ID_A = "YBwsNfRrQFMqGcER8tEFk9";
const ID_B = "Qw3rTy7UiOpAsDfGhJkL";
const UUID = "0b9c6f4e-2d7a-4c1e-9f3b-8a5d2e1c7b60";
const URL_A = `https://claude.ai/artifact/${ID_A}`;
const URL_B = `https://claude.ai/artifact/${ID_B}`;
const URL_CODE = `https://claude.ai/code/artifact/${UUID}`;

const BASE = {
  threadId: ThreadId.make("thread"),
  runId: null,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  status: "completed",
  title: null,
  startedAt: null,
  completedAt: null,
  updatedAt: DateTime.makeUnsafe("2026-11-01T00:00:00Z"),
} as const;

function row(position: number, item: OrchestrationV2TurnItem): OrchestrationV2ProjectedTurnItem {
  return {
    position,
    visibility: "local",
    sourceThreadId: item.threadId,
    sourceItemId: item.id,
    item,
  };
}

function tool(
  position: number,
  toolName: string,
  input: unknown,
  extra: {
    readonly output?: unknown;
    readonly outputOmitted?: boolean;
    readonly status?: OrchestrationV2TurnItem["status"];
  } = {},
): OrchestrationV2ProjectedTurnItem {
  return row(position, {
    ...BASE,
    id: TurnItemId.make(`item-${position}`),
    ordinal: position,
    type: "dynamic_tool",
    toolName,
    input,
    ...extra,
  });
}

function text(position: number, body: string): OrchestrationV2ProjectedTurnItem {
  return row(position, {
    ...BASE,
    id: TurnItemId.make(`item-${position}`),
    ordinal: position,
    type: "assistant_message",
    messageId: MessageId.make(`message-${position}`),
    text: body,
    streaming: false,
  });
}

// The extraction reads `type` and one text field only; the rest of these items does not matter.
function other(
  position: number,
  fields: Record<string, unknown> & { readonly type: string },
): OrchestrationV2ProjectedTurnItem {
  return row(position, {
    ...BASE,
    id: TurnItemId.make(`item-${position}`),
    ordinal: position,
    ...fields,
  } as OrchestrationV2TurnItem);
}

const urlsOf = (items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>) =>
  mergeArtifactTitles(collectThreadArtifacts(items), new Map(), []).map((entry) => entry.url);

describe("collectThreadArtifacts", () => {
  it("reads publishes and edits, and skips list, quickstart and read", () => {
    expect(
      urlsOf([
        tool(1, "Artifact", { file_path: "/tmp/a.html", url: URL_A }),
        tool(2, "ArtifactData", { action: "set", url: `${URL_B}/` }),
        tool(3, "Artifact", { action: "quickstart", intent: "other" }),
        tool(4, "Artifact", { action: "list", url: URL_CODE }),
        tool(5, "Artifact", { action: "read", url: URL_CODE }),
      ]),
    ).toEqual([URL_B, URL_A]);
  });

  it("reads artifact URLs in agent text and drops fragments and placeholders", () => {
    expect(
      urlsOf([
        text(1, `See the [tracker](${URL_A}#build-5) and ${URL_A}.`),
        text(2, `Code page: ${URL_CODE}`),
        text(3, "Links look like `https://claude.ai/artifact/<id>` or .../code/artifact/..."),
        text(4, "Too short: https://claude.ai/artifact/abc"),
      ]),
    ).toEqual([URL_CODE, URL_A]);
  });

  it("ignores user messages, commands and thread reads, and reads subagent results", () => {
    expect(
      urlsOf([
        other(1, { type: "user_message", text: URL_A }),
        other(2, { type: "command_execution", input: `open ${URL_A}`, output: URL_A }),
        tool(3, "mcp__t3-code__t3_thread_read", { text: URL_A }, { output: URL_A }),
        other(4, { type: "subagent", result: `Published ${URL_B}` }),
      ]),
    ).toEqual([URL_B]);
  });

  it("orders newest first by the last mention", () => {
    expect(
      urlsOf([text(1, URL_A), text(2, URL_B), tool(3, "ArtifactData", { url: URL_A })]),
    ).toEqual([URL_A, URL_B]);
  });

  it("drops a page that the thread deleted last, and keeps one a tool call names after", () => {
    expect(
      urlsOf([
        tool(1, "Artifact", { url: URL_A }),
        tool(2, "Artifact", { url: URL_B }),
        tool(3, "Artifact", { url: URL_CODE }),
        tool(4, "Artifact", { action: "delete", url: URL_A }),
        tool(5, "Artifact", { action: "delete", url: URL_B }),
        tool(6, "Artifact", { action: "delete", url: URL_CODE, path: "asset-id" }),
        tool(7, "Artifact", { action: "delete", url: URL_CODE }, { status: "failed" }),
        tool(8, "Artifact", { action: "delete", url: URL_CODE }, { status: "waiting" }),
        text(9, `Deleted ${URL_A}.`),
        tool(10, "ArtifactData", { action: "set", url: URL_B }),
      ]),
    ).toEqual([URL_B, URL_CODE]);
  });

  it("asks for the full output of completed first publishes only, newest per file, ten newest", () => {
    const omitted = { outputOmitted: true } as const;
    const items = [
      tool(1, "Artifact", { file_path: "/tmp/first.html" }, omitted),
      ...Array.from({ length: 10 }, (_, index) =>
        tool(index + 2, "Artifact", { file_path: `/tmp/${index}.html` }, omitted),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        tool(index + 12, "Artifact", { file_path: "/tmp/0.html" }, omitted),
      ),
      tool(17, "Artifact", { file_path: "/tmp/1.html", url: URL_B }, omitted),
      tool(18, "Artifact", { url: URL_B, file_path: "/tmp/x.png", asset: true }, omitted),
      tool(19, "Artifact", { file_path: "/tmp/y.html" }, { ...omitted, status: "failed" }),
      tool(20, "Artifact", { file_path: "/tmp/b.html" }, { output: { url: URL_A } }),
      tool(21, "Artifact", { action: "read", url: URL_A }, omitted),
      tool(22, "ArtifactData", { action: "get", url: URL_A }, omitted),
      tool(23, "Artifact", { summary: "big", truncated: true }),
    ];
    const candidates = collectThreadArtifacts(items).fetchCandidates;
    expect(candidates.map((candidate) => candidate.position)).toEqual([
      23, 16, 11, 10, 9, 8, 7, 6, 5, 4,
    ]);
    expect(candidates[0]).toMatchObject({
      threadId: "thread",
      itemId: "item-23",
      revision: "2026-11-01T00:00:00.000Z",
    });
  });
});

describe("readArtifactPublishOutput", () => {
  it.each([
    ["an object", { url: `${URL_A}?x=1`, title: "Tracker", owned: true }, "Tracker"],
    ["a JSON string", JSON.stringify({ url: URL_A, title: "Tracker" }), "Tracker"],
    ["text blocks", [{ type: "text", text: JSON.stringify({ url: URL_A }) }], undefined],
  ])("reads %s", (_name, output, title) => {
    expect(readArtifactPublishOutput(output)).toEqual(
      title === undefined ? { url: URL_A } : { url: URL_A, title },
    );
  });

  it("returns null for a wire-compacted output and for a read", () => {
    expect(readArtifactPublishOutput({})).toBeNull();
    expect(readArtifactPublishOutput({ read: { url: URL_A, title: "Tracker" } })).toBeNull();
    expect(readArtifactPublishOutput(undefined)).toBeNull();
    expect(readArtifactPublishOutput("not json")).toBeNull();
  });
});

describe("mergeArtifactTitles", () => {
  it("takes the fetched title, then the input title, then the browser title, then the id", () => {
    const collected = collectThreadArtifacts([
      tool(1, "Artifact", { file_path: "/tmp/a.html" }, { outputOmitted: true }),
      tool(2, "Artifact", { url: URL_A, title: "Input A" }),
      tool(3, "Artifact", { url: URL_B, title: "Input B", description: "The plan." }),
      text(4, URL_CODE),
      text(5, "https://claude.ai/artifact/Zz9Yy8Xx7Ww6"),
    ]);
    const fetched = new Map<string, ArtifactPublishOutput>([
      [collected.fetchCandidates[0]!.key, { url: URL_A, title: "Fetched A" }],
    ]);
    const rows = mergeArtifactTitles(collected, fetched, [
      { url: `${URL_B}#top`, title: "Browser B" },
      { url: URL_CODE, title: "Browser code" },
    ]);
    expect(rows.map((entry) => [entry.url, entry.title])).toEqual([
      ["https://claude.ai/artifact/Zz9Yy8Xx7Ww6", "Zz9Yy8Xx7Ww6"],
      [URL_CODE, "Browser code"],
      [URL_B, "Input B"],
      [URL_A, "Fetched A"],
    ]);
    expect(rows[2]?.description).toBe("The plan.");
  });

  it("adds a fetched page that no text names, at the publish position", () => {
    const collected = collectThreadArtifacts([
      text(1, URL_B),
      tool(2, "Artifact", { file_path: "/tmp/a.html" }, { outputOmitted: true }),
      text(3, URL_CODE),
    ]);
    const fetched = new Map([[collected.fetchCandidates[0]!.key, { url: URL_A, title: "A" }]]);
    expect(mergeArtifactTitles(collected, fetched, []).map((entry) => entry.url)).toEqual([
      URL_CODE,
      URL_A,
      URL_B,
    ]);
  });

  it("merges a fetched page with its text mention into one row", () => {
    const collected = collectThreadArtifacts([
      tool(1, "Artifact", { file_path: "/tmp/a.html" }, { outputOmitted: true }),
      text(2, `Published: ${URL_A}.`),
    ]);
    const fetched = new Map([[collected.fetchCandidates[0]!.key, { url: URL_A, title: "A" }]]);
    expect(mergeArtifactTitles(collected, fetched, [])).toEqual([
      { url: URL_A, id: ID_A, title: "A" },
    ]);
  });

  it("keeps a page out that the thread deleted after its publish", () => {
    const collected = collectThreadArtifacts([
      tool(1, "Artifact", { file_path: "/tmp/a.html" }, { outputOmitted: true }),
      tool(2, "Artifact", { action: "delete", url: URL_A }),
    ]);
    const fetched = new Map([[collected.fetchCandidates[0]!.key, { url: URL_A }]]);
    expect(mergeArtifactTitles(collected, fetched, [])).toEqual([]);
  });
});

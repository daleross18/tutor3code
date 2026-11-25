import { RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { MessagesTimelineRow } from "../components/chat/MessagesTimeline.logic";
import {
  applyPullRequestUpdateFolds,
  foldIsOpen,
  planPullRequestUpdateFolds,
  pullRequestUpdatesLabel,
} from "./pullRequestUpdateFold";

type Row = MessagesTimelineRow;
const AT = "2026-11-19T20:00:00.000Z";

/** A work row with one entry, as stock makes it for a notification and for one tool call. */
function work(id: string, entry: Record<string, unknown>): Row {
  return {
    kind: "work",
    id,
    createdAt: AT,
    isExpandedToolGroup: false,
    groupedEntries: [{ id, createdAt: AT, label: id, tone: "tool", ...entry } as never],
  };
}

/** The first row of a wake of a pull request watch. */
function wake(id: string, outcome = "updated", pullRequest: object | null = { number: 7 }): Row {
  return work(id, {
    tone: "info",
    itemType: "notification",
    structuredPayload: {
      type: "notification",
      source: { kind: "monitor", ...(pullRequest === null ? {} : { pullRequest }) },
      outcome,
      summary: "#7: new comments",
    },
  });
}

function message(id: string, role: "user" | "assistant", extra: object = {}): Row {
  return {
    kind: "message",
    id,
    createdAt: AT,
    message: { id, role, text: id, createdAt: AT, streaming: false } as never,
    showAssistantMeta: false,
    showAssistantCopyButton: false,
    assistantCopyStreaming: false,
    ...extra,
  };
}

const answer = (id: string, extra: object = {}) => message(id, "assistant", extra);
/** A settled wake turn in which the agent only answered. */
const quiet = (name: string) => [wake(`wake-${name}`), answer(`answer-${name}`)];
const idsOf = (rows: ReadonlyArray<Row>) => rows.map((row) => row.id);
const closed = () => false;
const foldedRowIds = (rows: Row[]) =>
  planPullRequestUpdateFolds(rows).map((fold) => idsOf(rows.slice(fold.start, fold.end)));

describe("planPullRequestUpdateFolds", () => {
  it("folds each quiet update of a sequence but the newest", () => {
    const rows = [
      message("ask", "user"),
      answer("reply"),
      ...quiet("1"),
      ...quiet("2"),
      ...quiet("3"),
    ];
    const folds = planPullRequestUpdateFolds(rows);
    expect(folds).toEqual([
      {
        runId: RunId.make("pull-request-updates:wake-1"),
        start: 2,
        end: 6,
        turnCount: 2,
        createdAt: AT,
      },
    ]);
    expect(idsOf(applyPullRequestUpdateFolds(rows, folds, closed))).toEqual([
      "ask",
      "reply",
      "turn-fold:pull-request-updates:wake-1",
      "wake-3",
      "answer-3",
    ]);
  });

  it("leaves one update alone, and gives the stock rows back with nothing to fold", () => {
    const rows = [message("ask", "user"), answer("reply"), ...quiet("1")];
    expect(planPullRequestUpdateFolds(rows)).toEqual([]);
    expect(applyPullRequestUpdateFolds(rows, [], closed)).toBe(rows);
  });

  it("a turn of the user ends a sequence", () => {
    const rows = [
      ...quiet("1"),
      ...quiet("2"),
      message("ask", "user"),
      answer("reply"),
      ...quiet("3"),
      ...quiet("4"),
      ...quiet("5"),
    ];
    expect(foldedRowIds(rows)).toEqual([
      ["wake-1", "answer-1"],
      ["wake-3", "answer-3", "wake-4", "answer-4"],
    ]);
  });

  it("does not fold the turn before a turn that still runs", () => {
    const rows = [
      ...quiet("1"),
      ...quiet("2"),
      wake("wake-3"),
      { kind: "working", id: "working", createdAt: null } satisfies Row,
    ];
    expect(foldedRowIds(rows)).toEqual([["wake-1", "answer-1"]]);
  });

  it.each<[string, Row[]]>([
    [
      "read-only work and the stock fold of its work",
      [
        work("command", { itemType: "command_execution" }),
        {
          kind: "turn-fold",
          id: "turn-fold:run-2",
          createdAt: AT,
          runId: RunId.make("run-2"),
          label: "Worked for 8s",
          expanded: false,
        },
        answer("answer-2", { assistantTurnDiffSummary: { files: [] } }),
      ],
    ],
  ])("a turn with %s is quiet", (_name, turn) => {
    const rows = [...quiet("1"), wake("wake-2"), ...turn, ...quiet("3")];
    expect(foldedRowIds(rows)).toEqual([["wake-1", "answer-1", "wake-2", ...idsOf(turn)]]);
  });

  it.each<[string, Row[]]>([
    ["failed checks", [wake("wake-2", "failed"), answer("answer-2")]],
    ["passed checks", [wake("wake-2", "completed"), answer("answer-2")]],
    [
      "a monitor that is no pull request watch",
      [wake("wake-2", "updated", null), answer("answer-2")],
    ],
    [
      "a changed file",
      [
        wake("wake-2"),
        answer("answer-2", {
          assistantTurnDiffSummary: {
            files: [{ path: "a.ts", kind: "modified", additions: 1, deletions: 0 }],
          },
        }),
      ],
    ],
    [
      "a file change item",
      [wake("wake-2"), work("edit", { itemType: "file_change" }), answer("answer-2")],
    ],
    [
      "a failed command",
      [
        wake("wake-2"),
        work("command", { itemType: "command_execution", toolLifecycleStatus: "failed" }),
        answer("answer-2"),
      ],
    ],
    [
      "a question to the user",
      [wake("wake-2"), work("question", { itemType: "user_input_request" })],
    ],
    ["an approval request", [wake("wake-2"), work("approval", { itemType: "approval_request" })]],
    ["a sub-agent", [wake("wake-2"), work("agent", { itemType: "subagent" }), answer("answer-2")]],
    [
      "a row of a kind that the rule does not know",
      [
        wake("wake-2"),
        { kind: "sent-message", id: "sent", createdAt: AT, text: "to another thread" },
      ],
    ],
  ])("a turn with %s stays on the screen and ends the sequence", (_name, turn) => {
    const rows = [...quiet("1"), ...turn, ...quiet("3")];
    expect(planPullRequestUpdateFolds(rows)).toEqual([]);
  });
});

describe("applyPullRequestUpdateFolds", () => {
  const rows = [...quiet("1"), ...quiet("2"), ...quiet("3")];
  const [fold] = planPullRequestUpdateFolds(rows);

  it("shows a closed fold as one stock fold line with the count of its turns", () => {
    expect(applyPullRequestUpdateFolds(rows, [fold!], closed)[0]).toEqual({
      kind: "turn-fold",
      id: "turn-fold:pull-request-updates:wake-1",
      createdAt: AT,
      runId: RunId.make("pull-request-updates:wake-1"),
      label: "2 earlier pull request updates",
      expanded: false,
    });
    expect(pullRequestUpdatesLabel(1)).toBe("1 earlier pull request update");
  });

  it("shows an open fold as its line and its rows", () => {
    const open = applyPullRequestUpdateFolds(rows, [fold!], () => true);
    expect(idsOf(open)).toEqual(["turn-fold:pull-request-updates:wake-1", ...idsOf(rows)]);
    expect(open[0]).toMatchObject({ expanded: true });
  });

  it("keeps the object of a line that did not change", () => {
    const first = applyPullRequestUpdateFolds(rows, [fold!], closed);
    expect(applyPullRequestUpdateFolds(rows, [fold!], closed, first)[0]).toBe(first[0]);
    expect(applyPullRequestUpdateFolds(rows, [fold!], () => true, first)[0]).not.toBe(first[0]);
  });

  it("is open by the stock set of expanded runs, and for a folded row that must show", () => {
    const none = new Set<RunId>();
    expect(foldIsOpen(rows, fold!, none, null)).toBe(false);
    expect(foldIsOpen(rows, fold!, new Set([fold!.runId]), null)).toBe(true);
    expect(foldIsOpen(rows, fold!, none, "answer-2")).toBe(true);
    // The newest update is not in the fold.
    expect(foldIsOpen(rows, fold!, none, "answer-3")).toBe(false);
  });
});

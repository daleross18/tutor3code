import type { ThreadPullRequestLink } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { derivePullRequestChip } from "./prChipState";
import type { CiStatusView } from "./ciStatus";

const term = { singular: "pull request", plural: "pull requests" };
const linkOf = (
  state: "open" | "merged" | "closed",
  isDraft = false,
): Pick<ThreadPullRequestLink, "number" | "snapshot"> => ({
  number: 123,
  snapshot: {
    state,
    title: "Add the kiosk footer",
    headBranch: "dale/footer",
    baseBranch: "dev",
    isDraft,
    updatedAt: null,
    syncedAt: "2026-11-19T10:00:00.000Z",
  },
});
const ciOf = (
  status: Partial<CiStatusView>,
  checksState: "pending" | "failing" | "passing" | null,
) => ({
  status: { tone: null, label: null, elapsed: null, autoMerge: false, details: [], ...status },
  checksState,
});

describe("derivePullRequestChip", () => {
  it("shows a red mark for failed lanes, with the lane names in the tooltip only", () => {
    const view = derivePullRequestChip({
      link: linkOf("open"),
      others: 0,
      ci: ciOf({ tone: "failed", label: "e2e +1", details: ["Failed: e2e, lint"] }, "failing"),
      term,
    });
    expect(view).toEqual({
      state: "open",
      number: "#123",
      mark: { tone: "failed", elapsed: null },
      autoMerge: false,
      label: "pull request #123, open, checks failed",
      details: ["#123: Add the kiosk footer", "Open, checks failed", "Failed: e2e, lint"],
    });
  });

  it("shows an amber mark with the time of the running lane, and no lane name", () => {
    const view = derivePullRequestChip({
      link: linkOf("open"),
      others: 0,
      ci: ciOf(
        {
          tone: "running",
          label: "build 7m +1",
          elapsed: "7m",
          details: ["Running (time since this app saw it): build 7m, test 3m"],
        },
        "pending",
      ),
      term,
    });
    expect(view.mark).toEqual({ tone: "running", elapsed: "7m" });
    expect(view.details).toEqual([
      "#123: Add the kiosk footer",
      "Open, checks run",
      "Running (time since this app saw it): build 7m, test 3m",
    ]);
  });

  it("shows no mark when every lane passed, and the auto-merge mark when auto-merge is on", () => {
    const passed = derivePullRequestChip({
      link: linkOf("open"),
      others: 0,
      ci: ciOf({}, "passing"),
      term,
    });
    expect(passed).toMatchObject({ mark: null, autoMerge: false });
    expect(passed.details).toEqual(["#123: Add the kiosk footer", "Open, checks passed"]);

    const auto = derivePullRequestChip({
      link: linkOf("open"),
      others: 0,
      ci: ciOf({ autoMerge: true, details: ["Auto-merge is on (squash)"] }, "passing"),
      term,
    });
    expect(auto).toMatchObject({ mark: null, autoMerge: true });
    expect(auto.label).toBe("pull request #123, open, checks passed, auto-merge is on");
    expect(auto.details.at(-1)).toBe("Auto-merge is on (squash)");
  });

  it("says nothing of checks while the host gave no state", () => {
    const view = derivePullRequestChip({
      link: linkOf("open"),
      others: 0,
      ci: ciOf({}, null),
      term,
    });
    expect(view).toMatchObject({ state: "open", mark: null });
    expect(view.details).toEqual(["#123: Add the kiosk footer", "Open"]);
  });

  it.each([
    ["a draft", linkOf("open", true), "draft", "Draft"],
    ["a merged pull request", linkOf("merged"), "merged", "Merged"],
    ["a closed pull request", linkOf("closed"), "closed", "Closed"],
  ] as const)("names the state of %s", (_name, link, state, word) => {
    const view = derivePullRequestChip({ link, others: 0, ci: null, term });
    expect(view).toMatchObject({ state, mark: null, autoMerge: false });
    expect(view.details).toEqual(["#123: Add the kiosk footer", word]);
  });

  it("shows the number alone for a link with no state yet", () => {
    const view = derivePullRequestChip({
      link: { number: 9, snapshot: null },
      others: 0,
      ci: null,
      term,
    });
    expect(view).toEqual({
      state: "unknown",
      number: "#9",
      mark: null,
      autoMerge: false,
      label: "pull request #9",
      details: ["#9"],
    });
  });

  it("says in the tooltip how many more pull requests the thread links, in the words of the host", () => {
    const one = derivePullRequestChip({ link: linkOf("merged"), others: 1, ci: null, term });
    expect(one.details.at(-1)).toBe("1 more linked pull request");
    const mergeRequests = derivePullRequestChip({
      link: linkOf("open"),
      others: 2,
      ci: ciOf({ tone: "failed", details: ["Failed: e2e"] }, "failing"),
      term: { singular: "merge request", plural: "merge requests" },
    });
    expect(mergeRequests.details.at(-1)).toBe("2 more linked merge requests");
    expect(mergeRequests.label).toBe(
      "merge request #123, open, checks failed, 2 more linked merge requests",
    );
  });
});

import { describe, expect, it } from "vite-plus/test";

import { previewBranchSlug, previewTemplateProblem, resolvePreviewUrl } from "./threadPreviewUrl";

const TUTOR_TEMPLATE = "https://{slug}.preview.tutorintelligence.com";

describe("previewBranchSlug", () => {
  // Each expected value is the output of the slug line of ~/.claude/bin/pr-url.sh for that branch:
  // tr '[:upper:]' '[:lower:]' | sed -E 's|[^a-z0-9]+|-|g; s|^-+||; s|-+$||' | cut -c1-50
  it.each([
    ["dev", "dev"],
    ["r3-thread", "r3-thread"],
    ["UPPER", "upper"],
    ["dale/kiosk-footer-icons", "dale-kiosk-footer-icons"],
    ["Feature/ABC_123", "feature-abc-123"],
    ["fix(merge): handle deleted gate runs", "fix-merge-handle-deleted-gate-runs"],
    ["--weird--branch--", "weird-branch"],
    ["release/2026.11.18", "release-2026-11-18"],
    ["a__b..c//d", "a-b-c-d"],
    ["task/33766_size-dolly-pallet-slots", "task-33766-size-dolly-pallet-slots"],
    ["dale/añadir-ñ", "dale-a-adir"],
    ["___", ""],
    [
      "dale/a-very-long-branch-name-that-goes-past-the-fifty-character-limit",
      "dale-a-very-long-branch-name-that-goes-past-the-fi",
    ],
    // The cut comes after the edge dashes are dropped, so the dash at character 50 stays.
    [
      "dale/exactly-forty-nine-characters-then-a-dash-xx/tail",
      "dale-exactly-forty-nine-characters-then-a-dash-xx-",
    ],
    [
      "x/1234567890123456789012345678901234567890123456-/y",
      "x-1234567890123456789012345678901234567890123456-y",
    ],
  ])("%s becomes %s", (branch, slug) => {
    expect(previewBranchSlug(branch)).toBe(slug);
  });
});

describe("resolvePreviewUrl", () => {
  it("puts the slug of the branch in the template", () => {
    expect(resolvePreviewUrl(TUTOR_TEMPLATE, "dale/kiosk-footer-icons")).toBe(
      "https://dale-kiosk-footer-icons.preview.tutorintelligence.com",
    );
    expect(resolvePreviewUrl(` ${TUTOR_TEMPLATE}/app?b={slug} `, "Feature/ABC_123")).toBe(
      "https://feature-abc-123.preview.tutorintelligence.com/app?b=feature-abc-123",
    );
  });

  it("makes no link without a template, without a branch, or without a slug", () => {
    expect(resolvePreviewUrl("", "dev")).toBeNull();
    expect(resolvePreviewUrl("   ", "dev")).toBeNull();
    expect(resolvePreviewUrl(TUTOR_TEMPLATE, null)).toBeNull();
    expect(resolvePreviewUrl(TUTOR_TEMPLATE, "___")).toBeNull();
  });

  it("makes no link from a template that is not a web URL with a slug", () => {
    expect(resolvePreviewUrl("https://preview.example.com", "dev")).toBeNull();
    expect(resolvePreviewUrl("{slug}.preview.example.com", "dev")).toBeNull();
    expect(resolvePreviewUrl("javascript:alert('{slug}')", "dev")).toBeNull();
  });
});

describe("previewTemplateProblem", () => {
  it("names the reason a template makes no link", () => {
    expect(previewTemplateProblem("")).toBeNull();
    expect(previewTemplateProblem(TUTOR_TEMPLATE)).toBe("valid");
    expect(previewTemplateProblem("https://preview.example.com")).toBe("no-slug");
    expect(previewTemplateProblem("{slug}.preview.example.com")).toBe("no-url");
  });
});

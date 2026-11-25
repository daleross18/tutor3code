/** The place of the branch slug in a preview URL template. */
export const PREVIEW_SLUG_TOKEN = "{slug}";

// The limit of the preview workflow (vercel_tutor_preview.yml): a DNS label holds 63 characters,
// and the workflow keeps room for a suffix such as `--prod`.
const PREVIEW_SLUG_MAX_LENGTH = 50;

/**
 * The slug of a branch, as `~/.claude/bin/pr-url.sh` and the preview workflow make it: lowercase,
 * each run of characters outside `[a-z0-9]` is one dash, no dash at either end, then the first 50
 * characters. The cut comes last, so a slug of 50 characters can end with a dash.
 */
export function previewBranchSlug(branch: string): string {
  return branch
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, PREVIEW_SLUG_MAX_LENGTH);
}

function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Null for an empty template. Otherwise the reason the template makes no link, or `valid`. */
export function previewTemplateProblem(template: string): "valid" | "no-slug" | "no-url" | null {
  const trimmed = template.trim();
  if (trimmed === "") return null;
  if (!trimmed.includes(PREVIEW_SLUG_TOKEN)) return "no-slug";
  return isWebUrl(trimmed.replaceAll(PREVIEW_SLUG_TOKEN, "branch")) ? "valid" : "no-url";
}

/** Null when the template is empty or not valid, or when the branch has no slug. */
export function resolvePreviewUrl(template: string, branch: string | null): string | null {
  if (branch === null || previewTemplateProblem(template) !== "valid") return null;
  const slug = previewBranchSlug(branch);
  return slug === "" ? null : template.trim().replaceAll(PREVIEW_SLUG_TOKEN, slug);
}

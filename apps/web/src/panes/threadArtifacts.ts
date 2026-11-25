import type { OrchestrationV2ProjectedTurnItem, ThreadId, TurnItemId } from "@t3tools/contracts";
import {
  turnItemDetailRevision,
  turnItemNeedsDetailFetch,
} from "@t3tools/client-runtime/work-log/item-detail";

import { isClaudeArtifactUrl } from "./artifactLinks";

const ARTIFACT_PATH = /^\/(?:code\/)?artifact\/([A-Za-z0-9_-]{8,})\/?$/;
const ARTIFACT_TEXT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/g;
const ARTIFACT_TOOLS: ReadonlySet<string> = new Set([
  "Artifact",
  "ArtifactData",
  "ArtifactComments",
]);
// Actions of the Artifact tool that name no page of the thread's own work.
const SKIPPED_ACTIONS: ReadonlySet<string> = new Set(["list", "quickstart", "read", "open"]);
const MAX_FETCH_CANDIDATES = 10;
const TEXT_MENTION = {};

/** One artifact that the thread's items name, at the position of its newest mention. */
export interface ThreadArtifactRef {
  readonly url: string;
  readonly id: string;
  readonly position: number;
  readonly title?: string;
  readonly description?: string;
}

/** A first publish, whose URL and title only the full output of its tool call has. */
export interface ArtifactFetchCandidate {
  readonly key: string;
  readonly threadId: ThreadId;
  readonly itemId: TurnItemId;
  readonly revision: string;
  readonly position: number;
}

export interface CollectedThreadArtifacts {
  readonly refs: ReadonlyArray<ThreadArtifactRef>;
  readonly fetchCandidates: ReadonlyArray<ArtifactFetchCandidate>;
  /** Position of the delete of each URL that the thread deleted last. */
  readonly removedAt: ReadonlyMap<string, number>;
}

export interface ArtifactPublishOutput {
  readonly url: string;
  readonly title?: string;
}

export interface ThreadArtifactRow {
  readonly url: string;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** The URL without hash, query and trailing slash. Null for a URL that is no artifact page. */
export function artifactUrlKey(raw: string): string | null {
  if (!URL.canParse(raw)) return null;
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.hostname !== "claude.ai") return null;
  const path = parsed.pathname.replace(/\/$/, "");
  if (!ARTIFACT_PATH.test(path)) return null;
  const url = `https://claude.ai${path}`;
  return isClaudeArtifactUrl(url) ? url : null;
}

export function artifactIdOf(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1);
}

function fetchCandidateKey(threadId: string, itemId: string): string {
  return `${threadId}\u0000${itemId}`;
}

/** Reads the URLs that the thread's own items name: Artifact tool calls and agent text. */
export function collectThreadArtifacts(
  items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>,
): CollectedThreadArtifacts {
  const refs = new Map<string, ThreadArtifactRef>();
  const removedAt = new Map<string, number>();
  // Keyed by file path: a redeploy of the same file goes to the same page.
  const candidates = new Map<string, ArtifactFetchCandidate>();

  const mention = (
    raw: string,
    position: number,
    detail: { readonly title?: string | undefined; readonly description?: string | undefined },
  ) => {
    const url = artifactUrlKey(raw);
    if (url === null) return;
    // Agent text names a page it deleted in its report. Only a later tool call brings it back.
    if (detail === TEXT_MENTION && removedAt.has(url)) return;
    const previous = refs.get(url);
    const title = detail.title ?? previous?.title;
    const description = detail.description ?? previous?.description;
    refs.set(url, {
      url,
      id: artifactIdOf(url),
      position,
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
    });
    removedAt.delete(url);
  };

  const sorted = items.toSorted((left, right) => left.position - right.position);
  for (const row of sorted) {
    const { item, position } = row;
    if (item.type === "assistant_message" || item.type === "subagent") {
      const text = item.type === "assistant_message" ? item.text : item.result;
      for (const match of text?.matchAll(ARTIFACT_TEXT_URL) ?? [])
        mention(match[0], position, TEXT_MENTION);
      continue;
    }
    if (item.type !== "dynamic_tool" || item.toolName === null) continue;
    if (!ARTIFACT_TOOLS.has(item.toolName)) continue;
    const input = isRecord(item.input) ? item.input : {};
    const action = nonEmptyString(input.action);
    const isArtifactTool = item.toolName === "Artifact";
    if (isArtifactTool && action !== undefined && SKIPPED_ACTIONS.has(action)) continue;
    const url = nonEmptyString(input.url);
    if (isArtifactTool && action === "delete") {
      const key = url === undefined ? null : artifactUrlKey(url);
      if (key !== null && input.path === undefined && item.status === "completed") {
        refs.delete(key);
        removedAt.set(key, position);
      }
      continue;
    }
    if (url !== undefined) {
      mention(url, position, {
        title: nonEmptyString(input.title),
        description: nonEmptyString(input.description),
      });
    }
    const isFirstPublish =
      isArtifactTool &&
      (action === undefined || action === "publish") &&
      url === undefined &&
      input.asset !== true;
    if (isFirstPublish && item.status === "completed" && turnItemNeedsDetailFetch(item)) {
      const key = fetchCandidateKey(row.sourceThreadId, row.sourceItemId);
      const file = nonEmptyString(input.file_path) ?? key;
      candidates.delete(file);
      candidates.set(file, {
        key,
        threadId: row.sourceThreadId,
        itemId: row.sourceItemId,
        revision: turnItemDetailRevision(item),
        position,
      });
    }
  }

  return {
    refs: [...refs.values()],
    fetchCandidates: [...candidates.values()].slice(-MAX_FETCH_CANDIDATES).toReversed(),
    removedAt,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The page of a publish output: an object, a JSON string, or text blocks that hold one. */
export function readArtifactPublishOutput(
  output: unknown,
  depth = 0,
): ArtifactPublishOutput | null {
  if (depth > 3) return null;
  if (typeof output === "string") return readArtifactPublishOutput(parseJson(output), depth + 1);
  if (Array.isArray(output)) {
    for (const block of output) {
      const text = isRecord(block) && block.type === "text" ? block.text : undefined;
      const found = readArtifactPublishOutput(text, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isRecord(output)) return null;
  const raw = nonEmptyString(output.url);
  if (raw !== undefined) {
    const url = artifactUrlKey(raw);
    if (url === null) return null;
    const title = nonEmptyString(output.title);
    return title === undefined ? { url } : { url, title };
  }
  if (Array.isArray(output.content)) return readArtifactPublishOutput(output.content, depth + 1);
  return null;
}

/**
 * The rows, newest first. Title order: the fetched publish output, the tool input, the title that
 * the app's browser recorded for the page, the id.
 */
export function mergeArtifactTitles(
  collected: CollectedThreadArtifacts,
  fetched: ReadonlyMap<string, ArtifactPublishOutput>,
  history: ReadonlyArray<{ readonly url: string; readonly title?: string | undefined }>,
): ReadonlyArray<ThreadArtifactRow> {
  const refs = new Map(collected.refs.map((ref) => [ref.url, ref]));
  const fetchedTitles = new Map<string, string>();
  for (const candidate of collected.fetchCandidates) {
    const output = fetched.get(candidate.key);
    if (output === undefined) continue;
    if (output.title !== undefined && !fetchedTitles.has(output.url)) {
      fetchedTitles.set(output.url, output.title);
    }
    const removed = collected.removedAt.get(output.url);
    if (removed !== undefined && removed > candidate.position) continue;
    const previous = refs.get(output.url);
    if (previous === undefined || previous.position < candidate.position) {
      refs.set(output.url, {
        ...previous,
        url: output.url,
        id: artifactIdOf(output.url),
        position: candidate.position,
      });
    }
  }
  const historyTitles = new Map<string, string>();
  for (const entry of history) {
    const url = artifactUrlKey(entry.url);
    const title = nonEmptyString(entry.title);
    if (url !== null && title !== undefined && !historyTitles.has(url)) {
      historyTitles.set(url, title);
    }
  }
  return [...refs.values()]
    .toSorted((left, right) => right.position - left.position)
    .map((ref) => ({
      url: ref.url,
      id: ref.id,
      title: fetchedTitles.get(ref.url) ?? ref.title ?? historyTitles.get(ref.url) ?? ref.id,
      ...(ref.description !== undefined ? { description: ref.description } : {}),
    }));
}

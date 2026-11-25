import type { ProviderDriverKind } from "@t3tools/contracts";
import type { Editor, TiptapEditorHTMLElement } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { useImperativeHandle, useLayoutEffect, useRef, type ClipboardEvent } from "react";

import {
  ComposerPromptEditorTiptap,
  type ComposerPromptEditorHandle,
  type ComposerPromptEditorProps,
} from "../components/ComposerPromptEditorTiptap";
import {
  readPastedComposerContext,
  readPastedPlainText,
} from "../components/composerInlineTokenPaste";
import { collapseExpandedComposerCursor, expandCollapsedComposerCursor } from "../composer-logic";
import { collapseShownMarkdownSource } from "../composer-markdown-source";
import { markAsClipboardEdit } from "../composer-undo-grouping";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  PASTE_CHIP_KIND,
  collapsePasteRanges,
  editorOffsetToPrompt,
  expandPasteTokens,
  lookupPastedText,
  pastedTextLabel,
  pastedTextToken,
  promptOffsetToEditor,
  rememberPastedText,
  shouldCollapsePaste,
  type PasteRange,
} from "./pasteCollapse";
import {
  CONTEXT_REFERENCE_NODE,
  consumePlainPaste,
  installPasteCollapseListeners,
  isPasteChipExpanding,
  takeRedirectedPaste,
} from "./pasteCollapseDom";
import {
  resolvePasteChipView,
  usePasteChipStore,
  usePasteCollapseSettingsStore,
  type PasteChipState,
} from "./pasteCollapseStore";
import { useClaudeKeywordStyle } from "./useClaudeKeywordStyle";

function editorCursorFor(
  prompt: string,
  editorValue: string,
  ranges: ReadonlyArray<PasteRange>,
  state: PasteChipState | null,
  cursor: number,
): number {
  if (ranges.length === 0) return cursor;
  // The collapsed cursor loses the place inside some stock tokens, so the cursor that the
  // editor sent for this prompt goes back to it unchanged.
  if (state?.cursor?.prompt === cursor) return state.cursor.editor;
  return collapseExpandedComposerCursor(
    editorValue,
    promptOffsetToEditor(expandCollapsedComposerCursor(prompt, cursor), ranges),
  );
}

function tiptapEditorIn(container: Element): Editor | null {
  const dom = container.querySelector<TiptapEditorHTMLElement>('[data-testid="composer-editor"]');
  return dom?.editor ?? null;
}

/**
 * The stock editor, with a long paste shown as one chip. The stock composer above it reads and
 * writes the full prompt, so a send, a queue, a stash and the length limit all see the pasted text.
 */
function CollapsingEditor(props: ComposerPromptEditorProps) {
  const { draftKey = "", value, cursor, disabled, onChange, onPaste, onCitationDraftSave } = props;
  const entry = usePasteChipStore((store) => store.entries[draftKey]);
  const view = resolvePasteChipView(value, entry);
  const editorValue = collapsePasteRanges(value, view.ranges);
  const editorCursor = editorCursorFor(value, editorValue, view.ranges, view.state, cursor);

  const stockRef = useRef<ComposerPromptEditorHandle | null>(null);
  const committedRef = useRef({ draftKey, prompt: value, editorValue, ranges: view.ranges });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the session's pasted texts and the chip store in step with a prompt that a stock edit or a reload changed
  useLayoutEffect(() => {
    const previous = committedRef.current;
    committedRef.current = { draftKey, prompt: value, editorValue, ranges: view.ranges };
    for (const range of view.ranges) {
      if (lookupPastedText(range.id) === undefined) {
        rememberPastedText(value.slice(range.start, range.end));
      }
    }
    if (view.source === "newest" || view.source === "recent") return;
    const { record } = usePasteChipStore.getState();
    const redirected =
      previous.draftKey === draftKey ? takeRedirectedPaste(previous.prompt, value) : null;
    if (redirected !== null) {
      const chip = {
        start: previous.prompt.length,
        end: value.length,
        id: rememberPastedText(redirected),
        token: pastedTextToken(redirected),
      };
      record(draftKey, { prompt: value, ranges: [...view.ranges, chip], cursor: null });
    } else if (view.source !== "none") {
      record(draftKey, { prompt: value, ranges: view.ranges, cursor: null });
    }
  }, [draftKey, editorValue, value, view]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the plain-paste key, a paste outside the editor, and copy and cut, while a collapsing editor is mounted
  useLayoutEffect(() => installPasteCollapseListeners(), []);

  const handleChange = useStableCallback<Parameters<ComposerPromptEditorProps["onChange"]>, void>(
    (nextEditorValue, nextCursor, nextExpandedCursor, cursorAdjacentToMention, contextIds) => {
      const { prompt, ranges } = expandPasteTokens(nextEditorValue, lookupPastedText);
      const known = usePasteChipStore.getState().entries[draftKey] !== undefined;
      if (ranges.length === 0) {
        if (known) usePasteChipStore.getState().record(draftKey, { prompt, ranges, cursor: null });
        onChange(prompt, nextCursor, nextExpandedCursor, cursorAdjacentToMention, contextIds);
        return;
      }
      const expandedCursor = editorOffsetToPrompt(nextExpandedCursor, ranges);
      const promptCursor = collapseExpandedComposerCursor(prompt, expandedCursor);
      usePasteChipStore.getState().record(draftKey, {
        prompt,
        ranges,
        cursor: { prompt: promptCursor, editor: nextCursor },
      });
      const chipIds = new Set(ranges.map((range) => range.id));
      onChange(
        prompt,
        promptCursor,
        expandedCursor,
        cursorAdjacentToMention,
        contextIds.filter((id) => !chipIds.has(id)),
      );
    },
  );

  const handlePaste = useStableCallback((event: ClipboardEvent<HTMLElement>) => {
    // A chip that expands pastes its own text; the stock composer must not fold or attach it.
    if (isPasteChipExpanding()) return;
    const plainPaste = consumePlainPaste();
    onPaste(event);
    if (event.defaultPrevented || event.isPropagationStopped() || plainPaste || disabled) return;
    const clipboardData = event.clipboardData;
    if (clipboardData.files.length > 0) return;
    if ((readPastedComposerContext(clipboardData)?.records.length ?? 0) > 0) return;
    const text = readPastedPlainText(clipboardData);
    if (!shouldCollapsePaste(text)) return;
    const editor = tiptapEditorIn(event.currentTarget);
    const nodeType = editor?.schema.nodes[CONTEXT_REFERENCE_NODE];
    if (!editor || !nodeType) return;
    const { selection } = editor.state;
    // A code block takes no chip, so a paste into one stays stock.
    if (!selection.$from.parent.type.contentMatch.matchType(nodeType)) return;
    const id = rememberPastedText(text);
    const isSameChip = (node: ProseMirrorNode | null | undefined) =>
      node?.type === nodeType && node.attrs.kind === PASTE_CHIP_KIND && node.attrs.contextId === id;
    // The same text again on its selected chip: the stock paste replaces the chip with it.
    if (selection instanceof NodeSelection && isSameChip(selection.node)) return;
    const before = selection.empty ? selection.$from.nodeBefore : null;
    if (before && isSameChip(before)) {
      // The same text again right behind its chip: select the chip for the stock paste.
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, selection.from - before.nodeSize),
        ),
      );
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    editor
      .chain()
      .command(({ tr }) => {
        markAsClipboardEdit(tr, "paste");
        return true;
      })
      .command(collapseShownMarkdownSource)
      .insertContent({
        type: CONTEXT_REFERENCE_NODE,
        attrs: {
          kind: PASTE_CHIP_KIND,
          contextId: id,
          label: pastedTextLabel(text),
          source: pastedTextToken(text),
        },
      })
      .scrollIntoView()
      .run();
  });

  const handleCitationDraftSave = useStableCallback((replacedValue: string, savedValue: string) => {
    onCitationDraftSave?.(
      expandPasteTokens(replacedValue, lookupPastedText).prompt,
      expandPasteTokens(savedValue, lookupPastedText).prompt,
    );
  });

  useImperativeHandle(
    props.editorRef,
    () => {
      const readLive = () => {
        const snapshot = stockRef.current?.readSnapshot();
        if (!snapshot) return null;
        return { snapshot, ...expandPasteTokens(snapshot.value, lookupPastedText) };
      };
      return {
        focus: () => stockRef.current?.focus(),
        focusAt: (nextCursor) => {
          const committed = committedRef.current;
          stockRef.current?.focusAt(
            editorCursorFor(
              committed.prompt,
              committed.editorValue,
              committed.ranges,
              null,
              nextCursor,
            ),
          );
        },
        focusAtEnd: () => stockRef.current?.focusAtEnd(),
        readSelectionRange: () => {
          const range = stockRef.current?.readSelectionRange() ?? { start: 0, end: 0 };
          const live = readLive();
          if (!live || live.ranges.length === 0) return range;
          return {
            start: editorOffsetToPrompt(range.start, live.ranges),
            end: editorOffsetToPrompt(range.end, live.ranges),
          };
        },
        captureAttachmentInsertion: () => stockRef.current?.captureAttachmentInsertion(),
        requestCitationComment: (request) => {
          const next = resolvePasteChipView(
            request.value,
            usePasteChipStore.getState().entries[draftKey],
          );
          stockRef.current?.requestCitationComment({
            ...request,
            previousValue:
              request.previousValue === committedRef.current.prompt
                ? committedRef.current.editorValue
                : request.previousValue,
            value: collapsePasteRanges(request.value, next.ranges),
            citationStart: promptOffsetToEditor(request.citationStart, next.ranges),
          });
        },
        readSnapshot: () => {
          const live = readLive();
          if (!live) {
            const committed = committedRef.current;
            return { value: committed.prompt, cursor: 0, expandedCursor: 0, contextIds: [] };
          }
          if (live.ranges.length === 0) return live.snapshot;
          const expandedCursor = editorOffsetToPrompt(live.snapshot.expandedCursor, live.ranges);
          const chipIds = new Set(live.ranges.map((range) => range.id));
          return {
            value: live.prompt,
            cursor: collapseExpandedComposerCursor(live.prompt, expandedCursor),
            expandedCursor,
            contextIds: live.snapshot.contextIds.filter((id) => !chipIds.has(id)),
          };
        },
        isCaretOnVisualEdge: (edge) => stockRef.current?.isCaretOnVisualEdge(edge) ?? false,
      };
    },
    [draftKey, props.editorRef],
  );

  return (
    <ComposerPromptEditorTiptap
      {...props}
      value={editorValue}
      cursor={editorCursor}
      editorRef={stockRef}
      onChange={handleChange}
      onPaste={handlePaste}
      {...(onCitationDraftSave ? { onCitationDraftSave: handleCitationDraftSave } : {})}
    />
  );
}

/**
 * Takes the place of the stock editor in the chat composer. With the setting off, and for an
 * answer that is sent as typed, it renders the stock editor with the stock props.
 * `keywordProvider` is the provider of the composer, for the style of the Claude keywords.
 */
export function PasteCollapseEditor({
  keywordProvider,
  ...stockProps
}: ComposerPromptEditorProps & { readonly keywordProvider?: ProviderDriverKind }) {
  const enabled = usePasteCollapseSettingsStore((settings) => settings.collapseLongPastes);
  const props = useClaudeKeywordStyle(stockProps, keywordProvider);
  return enabled && !props.literalText ? (
    <CollapsingEditor {...props} />
  ) : (
    <ComposerPromptEditorTiptap {...props} />
  );
}

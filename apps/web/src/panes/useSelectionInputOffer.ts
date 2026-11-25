import { useEffect, useState, type RefObject } from "react";
import { create } from "zustand";

import { contextMenuSourceOf } from "../contextMenuSource";
import { readLocalApi } from "../localApi";
import { isFloatingLayerOpen } from "./paneFocusInput";
import { useReadoutSettingsStore } from "./readoutSettings";
import {
  appendedText,
  caretIsInInputOf,
  selectionOfferOf,
  selectionPreview,
  selectionScopeOf,
  type SelectionOffer,
} from "./selectionToInput";

const useSelectionOfferStore = create<{ readonly offer: SelectionOffer | null }>(() => ({
  offer: null,
}));

function setOffer(offer: SelectionOffer | null): void {
  const current = useSelectionOfferStore.getState().offer;
  if (current?.text === offer?.text && current?.scope === offer?.scope) return;
  useSelectionOfferStore.setState({ offer });
}

let trackers = 0;

function inputHasFocus(scope: Element): boolean {
  const form = document.activeElement?.closest("[data-chat-composer-form]") ?? null;
  return form !== null && selectionScopeOf(form) === scope;
}

function trackSelection(): void {
  const selection = window.getSelection();
  const offer = selectionOfferOf(selection);
  // A new placeholder makes a focused editor write its caret back over the selection.
  if (offer !== null) return setOffer(inputHasFocus(offer.scope) ? null : offer);
  // A click in the input moves the selection there. The offer stays for the Tab key.
  const current = useSelectionOfferStore.getState().offer;
  if (
    current !== null &&
    selection?.isCollapsed === true &&
    caretIsInInputOf(selection, current.scope)
  ) {
    return;
  }
  setOffer(null);
}

function startSelectionTracking(): () => void {
  if (trackers === 0) document.addEventListener("selectionchange", trackSelection);
  trackers += 1;
  return () => {
    trackers -= 1;
    if (trackers > 0) return;
    document.removeEventListener("selectionchange", trackSelection);
    setOffer(null);
  };
}

/** True when focus is in a field other than the input in `form`. Tab then stays stock. */
function focusIsInOtherField(form: HTMLFormElement): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || form.contains(active)) return false;
  return active.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

type SelectionMenuAction = "fill" | "append" | "copy";

interface SelectionInputOfferInput {
  readonly formRef: RefObject<HTMLFormElement | null>;
  readonly promptRef: RefObject<string>;
  readonly prompt: string;
  /** False while the input answers a question or an approval, or takes no text. */
  readonly offerable: boolean;
  /** The stock edit of the input that the stock Tab key of a prompt suggestion uses. */
  readonly replace: (start: number, end: number, text: string) => boolean;
}

/**
 * Text selected in the chat of this input shows as its placeholder (the result) while the input
 * is empty. Tab puts the text in the input. A right click on the selection fills the input or
 * appends to it. Null with the setting off, so the input shows its stock placeholder.
 */
export function useSelectionInputOffer(input: SelectionInputOfferInput): string | null {
  const { formRef, promptRef, prompt, offerable, replace } = input;
  const enabled = useReadoutSettingsStore((settings) => settings.selectionToInput);
  const offer = useSelectionOfferStore((state) => state.offer);
  const [scope, setScope] = useState<Element | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the chat that holds this input from the DOM after mount, and tracks the document selection
  useEffect(() => {
    if (!enabled) return undefined;
    setScope(selectionScopeOf(formRef.current));
    return startSelectionTracking();
  }, [enabled, formRef]);

  const mine = enabled && offer !== null && scope !== null && offer.scope === scope;
  const text = mine ? offer.text : null;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- text typed in the input uses up the offer, so it does not return after a send
  useEffect(() => {
    if (prompt.length > 0 && useSelectionOfferStore.getState().offer?.scope === scope) {
      setOffer(null);
    }
  }, [prompt, scope]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- listens on the document: Tab must work while focus is in the chat, not in the input
  useEffect(() => {
    const form = formRef.current;
    if (text === null || !offerable || form === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        setOffer(null);
        return;
      }
      if (event.key !== "Tab" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }
      if (promptRef.current.length > 0 || isFloatingLayerOpen() || focusIsInOtherField(form)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setOffer(null);
      if (replace(0, promptRef.current.length, text)) window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [text, offerable, formRef, promptRef, replace]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- listens on the document for a right click on a selection in the chat of this input
  useEffect(() => {
    if (!enabled || scope === null) return undefined;
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Node)) return;
      const selection = window.getSelection();
      const selected = selectionOfferOf(selection);
      if (selected === null || selected.scope !== scope) return;
      if (selection === null || !selection.containsNode(event.target, true)) return;
      const api = readLocalApi();
      if (!api) return;
      event.preventDefault();
      const source = contextMenuSourceOf(event);
      void api.contextMenu
        .show<SelectionMenuAction>(
          [
            { id: "fill", label: "Fill input", disabled: !offerable },
            { id: "append", label: "Append to input", disabled: !offerable },
            { id: "copy", label: "Copy", separatorBefore: true },
          ],
          { x: event.clientX, y: event.clientY },
          source,
        )
        .then((action) => {
          if (action === "copy") return navigator.clipboard.writeText(selected.text);
          const current = promptRef.current;
          if (action === "fill") replace(0, current.length, selected.text);
          if (action === "append") {
            replace(current.length, current.length, appendedText(current, selected.text));
          }
          return undefined;
        })
        .catch(() => undefined);
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [enabled, scope, offerable, promptRef, replace]);

  return text === null || !offerable ? null : selectionPreview(text);
}

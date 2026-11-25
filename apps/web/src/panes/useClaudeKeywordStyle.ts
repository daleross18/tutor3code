import type { ProviderDriverKind } from "@t3tools/contracts";
import { useId, useLayoutEffect, useRef } from "react";

import { cn } from "~/lib/utils";

import { styleClaudeKeywordsIn, supportsClaudeKeywordHighlight } from "./claudeKeywordHighlight";
import { isClaudeKeywordProvider } from "./claudeKeywords";
import { useReadoutSettingsStore } from "./readoutSettings";

/**
 * Gives back the props of the stock prompt editor. While the setting is on and `provider` is a
 * Claude provider, the container of the editor gets one more class, by which this hook finds it
 * to style the keywords. In every other case the props are the stock props.
 */
export function useClaudeKeywordStyle<
  Props extends { readonly containerClassName?: string; readonly literalText?: boolean },
>(props: Props, provider: ProviderDriverKind | undefined): Props {
  const enabled = useReadoutSettingsStore((settings) => settings.styleClaudeKeywords);
  // An answer that is sent as typed is no prompt, so Claude Code reads no keyword in it.
  const active =
    enabled &&
    supportsClaudeKeywordHighlight &&
    isClaudeKeywordProvider(provider) &&
    props.literalText !== true;
  const marker = `claude-keywords-${useId().replace(/[^\w-]/g, "")}`;
  const styled = useRef<{ readonly container: Element; readonly stop: () => void } | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the container of the stock editor, which the editor makes again when its draft or its text mode changes
  useLayoutEffect(() => {
    const container = active ? (document.getElementsByClassName(marker)[0] ?? null) : null;
    if (container === (styled.current?.container ?? null)) return;
    styled.current?.stop();
    styled.current = container ? { container, stop: styleClaudeKeywordsIn(container) } : null;
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- removes the ranges of this composer from the shared highlight when the composer leaves
  useLayoutEffect(
    () => () => {
      styled.current?.stop();
      styled.current = null;
    },
    [],
  );

  return active ? { ...props, containerClassName: cn(props.containerClassName, marker) } : props;
}

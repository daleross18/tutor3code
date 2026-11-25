/** True for a node inside a visible pane that does not own the keyboard and the URL. */
export function isInPassivePane(node: Element | null | undefined): boolean {
  return node?.closest('[data-splitpane-cell][data-pane-focused="false"]') != null;
}

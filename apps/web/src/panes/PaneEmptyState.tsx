import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";

/**
 * A pane with no thread: no project exists to start a draft in. While the pane waits for its
 * new draft, the view is blank. The root takes DOM focus when the pane takes focus.
 */
export function PaneEmptyState({ filling }: { filling: boolean }) {
  return (
    <div
      data-pane-empty
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background outline-none"
    >
      {filling ? null : (
        <Empty className="flex-1">
          <EmptyHeader className="max-w-md">
            <EmptyTitle>No thread in this pane</EmptyTitle>
            <EmptyDescription>Select a thread in the sidebar.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

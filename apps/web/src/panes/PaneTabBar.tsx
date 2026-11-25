import { useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import {
  Columns2,
  Globe,
  MessagesSquare,
  Plus,
  SquareSplitHorizontal,
  SquareSplitVertical,
} from "lucide-react";
import type { ContextMenuItem } from "@t3tools/contracts";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { Button } from "~/components/ui/button";
import { PanelTabCloseButton } from "~/components/ui/panel-tab-close-button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { isElectron } from "~/env";
import { readLocalApi } from "~/localApi";
import { shortcutLabelForCommand } from "~/keybindings";
import { useComposerDraftStore } from "~/composerDraftStore";
import { cn } from "~/lib/utils";
import { useQuietThreadShell } from "~/state/entities";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

import { activateTab, closeTab, runPaneCommand } from "./paneActions";
import { returnFocusToFocusedPane } from "./paneFocusInput";
import type { PaneCommand } from "./paneKeybindings";
import { pressPaneTab } from "./paneTabDrag";
import { usePaneStore } from "./paneStore";
import {
  findLeaf,
  getActiveTab,
  isBrowserLeaf,
  leafCount,
  MAX_TAB_NAME_LENGTH,
  type PaneLayout,
  type PaneTab,
} from "./paneTree";

// The same two conditions as the stock titlebar inset: the bar then holds the traffic lights
// and the fixed sidebar button, which are as tall as the stock top bar.
const COLLAPSED_SIDEBAR_TITLEBAR_HEIGHT_CLASS =
  "[[data-sidebar-state=collapsed]_&]:h-[var(--workspace-topbar-height)] max-md:[[data-sidebar-state=expanded]_&]:h-[var(--workspace-topbar-height)]";

function preventMiddleButtonDefault(event: ReactMouseEvent) {
  if (event.button === 1) event.preventDefault();
}

const isOnCloseButton = (target: EventTarget) =>
  target instanceof Element && target.closest("[data-pane-tab-close]") !== null;

// Module level, so the ref is the same function in each render and selects the text once.
const focusAndSelect = (input: HTMLInputElement | null) => {
  input?.focus();
  input?.select();
};

/**
 * The name field of a tab. Enter or a press elsewhere saves, Escape keeps the old name. It starts
 * with the shown label. A value saved unchanged keeps the name, so an automatic label stays
 * automatic also when the thread title changes during the edit.
 */
function PaneTabNameInput({
  tabId,
  name,
  automatic,
  onDone,
}: {
  tabId: string;
  name: string | undefined;
  automatic: string;
  onDone: () => void;
}) {
  const [initial] = useState(name ?? automatic);
  const [value, setValue] = useState(initial);
  // Enter and Escape end the edit before the blur of the field that unmounts.
  const doneRef = useRef(false);
  const finish = (save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save && value.trim() !== initial.trim()) {
      usePaneStore.getState().renameTab(tabId, value);
    }
    onDone();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // An Enter that confirms an IME candidate.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finish(event.key === "Enter");
    returnFocusToFocusedPane();
  };
  return (
    <input
      ref={focusAndSelect}
      data-pane-tab-name-input
      aria-label="Tab name"
      value={value}
      maxLength={MAX_TAB_NAME_LENGTH}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
      className="h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-xs text-foreground outline-none select-text"
    />
  );
}

function PaneTabItem({
  tab,
  active,
  closable,
}: {
  tab: PaneTab;
  active: boolean;
  closable: boolean;
}) {
  const router = useRouter();
  const focusedLeaf = findLeaf(tab.root, tab.focusedPaneId);
  const target = focusedLeaf?.target ?? null;
  const draftId = target?.kind === "draft" ? target.draftId : null;
  // A sent draft in a tab that is not mounted keeps its draft target until the send is final.
  const promotedTo = useComposerDraftStore((store) =>
    draftId === null
      ? null
      : (store.getDraftSession(draftId)?.promotedTo ?? store.getPromotedDraftRedirect(draftId)),
  );
  const shell = useQuietThreadShell(target?.kind === "server" ? target.threadRef : promotedTo);
  const filling = usePaneStore((state) => state.fillingPaneIds.includes(tab.focusedPaneId));
  const automaticTitle =
    target === null
      ? filling
        ? "New thread"
        : "Empty"
      : (shell?.title ?? (target.kind === "draft" ? "New thread" : "Thread"));
  const title = tab.name ?? automaticTitle;
  const [editing, setEditing] = useState(false);
  const showContextMenu = (event: ReactMouseEvent) => {
    const api = readLocalApi();
    if (!api) return;
    event.preventDefault();
    const items: ContextMenuItem<"rename" | "close">[] = [
      { id: "rename", label: "Rename tab", icon: "pencil" },
      { id: "close", label: "Close tab", disabled: !closable },
    ];
    void api.contextMenu.show(items, { x: event.clientX, y: event.clientY }).then((action) => {
      if (action === "rename") setEditing(true);
      if (action === "close") closeTab(router, tab.id);
    });
  };
  const paneCount = leafCount(tab);
  const showsBrowser = focusedLeaf !== null && isBrowserLeaf(focusedLeaf);
  const TabIcon = paneCount > 1 ? Columns2 : showsBrowser ? Globe : MessagesSquare;
  const icon = <TabIcon className="size-3 shrink-0" />;
  return (
    <div
      data-pane-tab={tab.id}
      data-active-tab={active}
      onPointerDown={(event) => {
        if (!editing) pressPaneTab(event, tab.id);
      }}
      onMouseDown={preventMiddleButtonDefault}
      onMouseUp={preventMiddleButtonDefault}
      onAuxClick={(event) => {
        if (event.button === 1) closeTab(router, tab.id);
      }}
      // The whole tab selects it, also its padding and its icon. The close control stops there.
      onClick={(event) => {
        if (!editing && !isOnCloseButton(event.target)) activateTab(router, tab.id);
      }}
      onDoubleClick={(event) => {
        if (!editing && !isOnCloseButton(event.target)) setEditing(true);
      }}
      onContextMenu={editing ? undefined : showContextMenu}
      // The classes of a stock right-panel tab. The active tab also gets a medium weight and a
      // 2px line in the primary color, so it is not mistaken for a hovered tab.
      className={cn(
        "cursor-pointer group/tab relative flex select-none h-6 max-w-36 min-w-16 items-center gap-0.5 rounded-md pr-2 pl-1.5 text-xs [-webkit-app-region:no-drag]",
        active
          ? "bg-accent font-medium text-foreground after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {closable ? (
        <span data-pane-tab-close className="contents">
          <PanelTabCloseButton
            label={`Close tab ${title}`}
            onClick={() => closeTab(router, tab.id)}
          >
            {icon}
          </PanelTabCloseButton>
        </span>
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      )}
      {editing ? (
        <PaneTabNameInput
          tabId={tab.id}
          name={tab.name}
          automatic={automaticTitle}
          onDone={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className="cursor-pointer flex min-w-0 items-center gap-1"
        >
          <span className="truncate">{title}</span>
          {paneCount > 1 ? <span className="shrink-0 tabular-nums">{paneCount}</span> : null}
        </button>
      )}
    </div>
  );
}

function PaneTabBarButton({
  label,
  shortcutLabel,
  onClick,
  children,
}: {
  label: string;
  shortcutLabel: string | null;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {label}
        {shortcutLabel ? ` (${shortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

/** The top-level tabs. Rendered only when more than one tab or more than one pane exists. */
export function PaneTabBar({ layout }: { layout: PaneLayout }) {
  const router = useRouter();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const button = (command: PaneCommand, label: string, icon: ReactNode) => (
    <PaneTabBarButton
      label={label}
      shortcutLabel={shortcutLabelForCommand(keybindings, command)}
      onClick={() => runPaneCommand(router, command)}
    >
      {icon}
    </PaneTabBarButton>
  );
  const activeTabId = getActiveTab(layout).id;
  const tabListRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scrolls the tab list so the active tab is in view when the tabs do not all fit
  useEffect(() => {
    tabListRef.current
      ?.querySelector(`[data-pane-tab="${activeTabId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);
  return (
    <div
      data-pane-tabbar
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 border-b border-border bg-background px-2",
        isElectron && "drag-region wco:pr-(--workspace-native-controls-inset)",
        COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        COLLAPSED_SIDEBAR_TITLEBAR_HEIGHT_CLASS,
      )}
    >
      <div
        ref={tabListRef}
        data-pane-tablist
        role="tablist"
        // Tabs shrink to their minimum width first. Past that, the list scrolls with no bar.
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        {layout.tabs.map((tab) => (
          <PaneTabItem
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            closable={layout.tabs.length > 1}
          />
        ))}
      </div>
      {button("layout.newTab", "New tab", <Plus />)}
      {button("layout.splitRight", "Split right", <SquareSplitHorizontal />)}
      {button("layout.splitDown", "Split down", <SquareSplitVertical />)}
    </div>
  );
}

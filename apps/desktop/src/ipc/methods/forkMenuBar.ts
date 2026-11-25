/** What the renderer sends: the count, and the newest unread finished threads for the menu. */
export interface MenuBarUnread {
  readonly count: number;
  readonly threads: ReadonlyArray<{ readonly key: string; readonly title: string }>;
}

export type MenuBarMenuItem =
  | { readonly type: "show"; readonly label: string }
  | { readonly type: "separator" }
  | { readonly type: "thread"; readonly label: string; readonly key: string }
  | { readonly type: "more"; readonly label: string };

/** The stand-in of a test takes the place of the Electron `Tray`. */
export interface MenuBarTray {
  setTitle(title: string): void;
  setToolTip(text: string): void;
  onClick(listener: () => void): void;
  popUp(items: ReadonlyArray<MenuBarMenuItem>, onPick: (item: MenuBarMenuItem) => void): void;
  destroy(): void;
}

export interface MenuBarHost {
  readonly appName: string;
  createTray(): MenuBarTray;
  showWindow(): void;
  /** `key` is a thread key that the renderer sent. The renderer opens that thread. */
  openThread(key: string): void;
}

const MENU_THREAD_LIMIT = 10;
const MENU_TITLE_LIMIT = 60;
const MAX_SHOWN_COUNT = 99;

/** The text beside the icon. Zero shows the icon alone. */
export function menuBarTitle(count: number): string {
  if (count <= 0) return "";
  return count > MAX_SHOWN_COUNT ? `${MAX_SHOWN_COUNT}+` : String(count);
}

function menuLabel(title: string): string {
  const text = title.replace(/\s+/g, " ").trim();
  if (text === "") return "Untitled thread";
  return text.length > MENU_TITLE_LIMIT ? `${text.slice(0, MENU_TITLE_LIMIT - 1)}…` : text;
}

export function menuBarMenu(
  unread: MenuBarUnread,
  appName: string,
): ReadonlyArray<MenuBarMenuItem> {
  const threads = unread.threads.slice(0, MENU_THREAD_LIMIT);
  const rest = unread.count - threads.length;
  return [
    { type: "show", label: `Show ${appName}` },
    { type: "separator" },
    ...threads.map((thread): MenuBarMenuItem => ({
      type: "thread",
      label: menuLabel(thread.title),
      key: thread.key,
    })),
    ...(rest > 0 ? [{ type: "more", label: `${rest} more in ${appName}` } as const] : []),
  ];
}

/**
 * Owns the one menu bar item. `null` removes it. A click shows the app when no thread is
 * unread, and lists the unread finished threads when some are.
 */
export function createMenuBarController(host: MenuBarHost) {
  let tray: MenuBarTray | null = null;
  let unread: MenuBarUnread = { count: 0, threads: [] };
  const onPick = (item: MenuBarMenuItem) => {
    if (item.type === "thread") host.openThread(item.key);
    else if (item.type === "show") host.showWindow();
  };
  return {
    apply(next: MenuBarUnread | null): void {
      if (next === null) {
        tray?.destroy();
        tray = null;
        return;
      }
      unread = next;
      if (tray === null) {
        const created = host.createTray();
        created.onClick(() => {
          if (unread.count === 0) host.showWindow();
          else created.popUp(menuBarMenu(unread, host.appName), onPick);
        });
        tray = created;
      }
      tray.setTitle(menuBarTitle(next.count));
      tray.setToolTip(
        next.count === 0
          ? `${host.appName}: no unread finished thread`
          : `${host.appName}: ${next.count} unread finished ${next.count === 1 ? "thread" : "threads"}`,
      );
    },
    /** The renderer that sent the count is gone: keep the item, but show no number. */
    forget(): void {
      if (tray !== null) this.apply({ count: 0, threads: [] });
    },
  };
}

/** Distance to a box with round corners. Negative inside. */
function roundBox(x: number, y: number, half: number, radius: number): number {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

/** The mark in a unit square: a ring with round corners, and the letter T in it. */
function inMark(x: number, y: number): boolean {
  const edge = roundBox(x - 0.5, y - 0.5, 0.44, 0.14);
  if (edge <= 0 && edge >= -0.09) return true;
  const bar = x >= 0.27 && x <= 0.73 && y >= 0.29 && y <= 0.4;
  const stem = x >= 0.445 && x <= 0.555 && y >= 0.29 && y <= 0.73;
  return bar || stem;
}

const SAMPLES = 4;

/**
 * The icon as BGRA pixels, black with alpha, for a template image: macOS draws a template
 * image in the color of the menu bar text, so one image fits a light and a dark bar.
 */
export function drawMenuBarIcon(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (column + (sx + 0.5) / SAMPLES) / size;
          const y = (row + (sy + 0.5) / SAMPLES) / size;
          if (inMark(x, y)) covered += 1;
        }
      }
      pixels[(row * size + column) * 4 + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return pixels;
}

import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import * as DesktopWindow from "../../window/DesktopWindow.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";
import { SET_MENU_BAR_UNREAD_CHANNEL } from "../forkChannels.ts";
import { createMenuBarController, drawMenuBarIcon, type MenuBarTray } from "./forkMenuBar.ts";

const Unread = Schema.NullOr(
  Schema.Struct({
    count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
    threads: Schema.Array(
      Schema.Struct({
        key: Schema.String.check(Schema.isMaxLength(512)),
        title: Schema.String.check(Schema.isMaxLength(1024)),
      }),
    ),
  }),
);

// The renderer listens for this menu action (apps/web/src/panes/finishedThreads.ts).
const OPEN_THREAD_MENU_ACTION = "fork-open-thread:";
const ICON_POINTS = 18;

function menuBarIcon(): Electron.NativeImage {
  const icon = Electron.nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) {
    const size = ICON_POINTS * scaleFactor;
    icon.addRepresentation({
      scaleFactor,
      width: size,
      height: size,
      buffer: Buffer.from(drawMenuBarIcon(size)),
    });
  }
  icon.setTemplateImage(true);
  return icon;
}

function electronTray(): MenuBarTray {
  const tray = new Electron.Tray(menuBarIcon());
  return {
    setTitle: (title) => tray.setTitle(title),
    setToolTip: (text) => tray.setToolTip(text),
    onClick: (listener) => void tray.on("click", listener),
    popUp: (items, onPick) =>
      tray.popUpContextMenu(
        Electron.Menu.buildFromTemplate(
          items.map((item): Electron.MenuItemConstructorOptions => {
            if (item.type === "separator") return { type: "separator" };
            if (item.type === "more") return { label: item.label, enabled: false };
            return { label: item.label, click: () => onPick(item) };
          }),
        ),
      ),
    destroy: () => tray.destroy(),
  };
}

// One item for the life of the app. Electron removes a `Tray` that nothing holds.
let controller: ReturnType<typeof createMenuBarController> | null = null;
const watchedSenders = new Set<number>();

// On macOS the app stays open with no window, so a count from a closed or crashed renderer goes stale.
function forgetWhenSenderGoes(senderId: number): void {
  if (watchedSenders.has(senderId)) return;
  const sender = Electron.webContents.fromId(senderId);
  if (sender === undefined) return;
  watchedSenders.add(senderId);
  sender.once("destroyed", () => {
    watchedSenders.delete(senderId);
    controller?.forget();
  });
  sender.on("render-process-gone", () => controller?.forget());
}

export const setMenuBarUnread = makeIpcMethod({
  channel: SET_MENU_BAR_UNREAD_CHANNEL,
  payload: Unread,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.forkMenuBar.setMenuBarUnread")(function* (unread, event) {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    // The count beside the icon is a macOS feature of `Tray`.
    if (environment.platform !== "darwin") return;
    if (controller === null) {
      const desktopWindow = yield* DesktopWindow.DesktopWindow;
      const run = Effect.runPromiseWith(yield* Effect.context<never>());
      const start = (effect: Effect.Effect<void, DesktopWindow.DesktopWindowError>) =>
        void run(Effect.ignoreCause(effect));
      controller = createMenuBarController({
        appName: environment.displayName,
        createTray: electronTray,
        showWindow: () => start(desktopWindow.activate),
        openThread: (key) =>
          start(
            desktopWindow.dispatchMenuAction(`${OPEN_THREAD_MENU_ACTION}${key}`, { reveal: true }),
          ),
      });
    }
    if (event !== undefined) forgetWhenSenderGoes(event.sender.id);
    controller.apply(unread);
  }),
});

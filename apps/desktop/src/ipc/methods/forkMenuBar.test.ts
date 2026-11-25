import { expect, it } from "vite-plus/test";

import {
  createMenuBarController,
  drawMenuBarIcon,
  menuBarMenu,
  menuBarTitle,
  type MenuBarMenuItem,
  type MenuBarTray,
} from "./forkMenuBar.ts";

/** Stands in for the Electron `Tray`, and records what the menu bar would show. */
function fakeHost() {
  const log: Array<string> = [];
  const trays: Array<{
    title: string;
    toolTip: string;
    destroyed: boolean;
    click: () => void;
    menu: ReadonlyArray<MenuBarMenuItem> | null;
    pick: (item: MenuBarMenuItem) => void;
  }> = [];
  const controller = createMenuBarController({
    appName: "Tutor3",
    createTray: () => {
      const state: (typeof trays)[number] = {
        title: "",
        toolTip: "",
        destroyed: false,
        click: () => {},
        menu: null,
        pick: () => {},
      };
      trays.push(state);
      const tray: MenuBarTray = {
        setTitle: (title) => void (state.title = title),
        setToolTip: (text) => void (state.toolTip = text),
        onClick: (listener) => void (state.click = listener),
        popUp: (items, onPick) => {
          state.menu = items;
          state.pick = onPick;
        },
        destroy: () => void (state.destroyed = true),
      };
      return tray;
    },
    showWindow: () => void log.push("show"),
    openThread: (key) => void log.push(`open ${key}`),
  });
  return { controller, trays, log };
}

const thread = (index: number) => ({ key: `env:thread-${index}`, title: `Thread ${index}` });

it.each([
  [0, ""],
  [-1, ""],
  [1, "1"],
  [99, "99"],
  [100, "99+"],
])("shows the count %i as the text %j", (count, title) => {
  expect(menuBarTitle(count)).toBe(title);
});

it("lists at most ten threads by title, and says how many more exist", () => {
  const threads = Array.from({ length: 12 }, (_unused, index) => thread(index));
  const menu = menuBarMenu({ count: 14, threads }, "Tutor3");
  expect(menu.slice(0, 3)).toEqual([
    { type: "show", label: "Show Tutor3" },
    { type: "separator" },
    { type: "thread", label: "Thread 0", key: "env:thread-0" },
  ]);
  expect(menu.filter((item) => item.type === "thread")).toHaveLength(10);
  expect(menu.at(-1)).toEqual({ type: "more", label: "4 more in Tutor3" });
});

it("cuts a long title, joins its lines, and names a thread with no title", () => {
  const menu = menuBarMenu(
    {
      count: 2,
      threads: [
        { key: "a", title: `Fix the\n  build ${"x".repeat(80)}` },
        { key: "b", title: "  " },
      ],
    },
    "Tutor3",
  );
  const labels = menu.flatMap((item) => (item.type === "thread" ? [item.label] : []));
  expect(labels[0]).toHaveLength(60);
  expect(labels[0]?.startsWith("Fix the build xxx")).toBe(true);
  expect(labels[0]?.endsWith("…")).toBe(true);
  expect(labels[1]).toBe("Untitled thread");
  expect(menu.at(-1)?.type).toBe("thread");
});

it("makes one item, shows the count, and shows the app on a click with no unread thread", () => {
  const { controller, trays, log } = fakeHost();
  controller.apply({ count: 0, threads: [] });
  expect(trays).toHaveLength(1);
  expect(trays[0]).toMatchObject({ title: "", toolTip: "Tutor3: no unread finished thread" });
  trays[0]?.click();
  expect(log).toEqual(["show"]);
  expect(trays[0]?.menu).toBeNull();

  controller.apply({ count: 2, threads: [thread(1), thread(2)] });
  expect(trays).toHaveLength(1);
  expect(trays[0]).toMatchObject({ title: "2", toolTip: "Tutor3: 2 unread finished threads" });
  controller.apply({ count: 1, threads: [thread(2)] });
  expect(trays[0]).toMatchObject({ title: "1", toolTip: "Tutor3: 1 unread finished thread" });
});

it("lists the unread threads on a click, and a pick opens the thread or shows the app", () => {
  const { controller, trays, log } = fakeHost();
  controller.apply({ count: 2, threads: [thread(1), thread(2)] });
  trays[0]?.click();
  expect(log).toEqual([]);
  const menu = trays[0]?.menu ?? [];
  expect(menu.map((item) => item.type)).toEqual(["show", "separator", "thread", "thread"]);
  trays[0]?.pick(menu[3]!);
  trays[0]?.pick(menu[0]!);
  trays[0]?.pick(menu[1]!);
  expect(log).toEqual(["open env:thread-2", "show"]);
});

it("removes the item for null, and makes a new one when a count comes again", () => {
  const { controller, trays } = fakeHost();
  controller.apply(null);
  expect(trays).toHaveLength(0);
  controller.apply({ count: 3, threads: [] });
  controller.apply(null);
  expect(trays[0]?.destroyed).toBe(true);
  controller.apply({ count: 1, threads: [] });
  expect(trays).toHaveLength(2);
  expect(trays[1]).toMatchObject({ title: "1", destroyed: false });
});

it("forgets the count of a gone renderer: the icon stays with no number, and no item appears", () => {
  const { controller, trays } = fakeHost();
  controller.forget();
  expect(trays).toHaveLength(0);
  controller.apply({ count: 3, threads: [thread(1)] });
  controller.forget();
  expect(trays).toHaveLength(1);
  expect(trays[0]).toMatchObject({ title: "", destroyed: false });
  controller.apply(null);
  controller.forget();
  expect(trays).toHaveLength(1);
});

it.each([18, 36])("draws a %i px template icon: black, opaque in the mark only", (size) => {
  const pixels = drawMenuBarIcon(size);
  expect(pixels).toHaveLength(size * size * 4);
  const alpha = (x: number, y: number) =>
    pixels[(Math.floor(y * size) * size + Math.floor(x * size)) * 4 + 3];
  // The stem of the T, the top edge of the ring, the corner outside it, the space beside the stem.
  expect(alpha(0.5, 0.6)).toBe(255);
  expect(alpha(0.5, 0.1)).toBeGreaterThan(200);
  expect(alpha(0.01, 0.01)).toBe(0);
  expect(alpha(0.3, 0.6)).toBe(0);
  const colors = pixels.filter((_value, index) => index % 4 !== 3);
  expect(colors.every((value) => value === 0)).toBe(true);
});

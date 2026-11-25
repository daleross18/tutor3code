import "~/index.css";

import { RegistryContext } from "@effect/atom-react";
import { createMemoryHistory } from "@tanstack/react-router";
import { WS_METHODS } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes several seconds; importing it
// here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useLoadBalancedEnvironment } from "~/hooks/useLoadBalancedEnvironment";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import {
  ENVIRONMENT_ID,
  answerRpc,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";
import type { DiskSpace } from "./environmentResources";
import { useResourcesCollapseStore } from "./environmentResourcesCollapse";
import { usePaneStore } from "./paneStore";
import { createInitialLayout } from "./paneTree";
import { DEFAULT_READOUT_SETTINGS, useReadoutSettingsStore } from "./readoutSettings";

// The socket is faked; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver: driver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, driver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

// Stands in for the desktop bridge. A whole fake bridge would switch the app to its desktop mode.
const localDisk = vi.hoisted(() => ({ space: null as DiskSpace | null }));
vi.mock(import("./localDiskSpace"), () => ({
  localDiskSpaceReader: () => (localDisk.space ? () => Promise.resolve(localDisk.space) : null),
}));

const GB = 1024 ** 3;
const READOUT = "[data-environment-resources]";
const FOOTER = '[data-sidebar="footer"]';

/** The stores outlive a test, so each test starts from one pane, no drafts and the defaults. */
function setup(threads: ReadonlyArray<FakeThread>, disk: DiskSpace | null = null) {
  localDisk.space = disk;
  useResourcesCollapseStore.setState({ collapsed: false });
  usePaneStore.setState({
    layout: createInitialLayout(),
    lastRouteKey: null,
    fillingPaneIds: [],
  });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    promotedDraftRedirects: {},
  });
  useReadoutSettingsStore.setState(DEFAULT_READOUT_SETTINGS);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  return installFakeEnvironment(threads);
}

/** What a stock server answers to `server.getHostResources`. */
function serveMemory(availableGb: number, totalGb: number) {
  const asked = { count: 0 };
  const answer = answerRpc(WS_METHODS.serverGetHostResources, () => {
    asked.count += 1;
    return Effect.succeed({
      sampledAt: 1_700_000_000_000,
      cpuUtilization: 0.25,
      cpuCount: 8,
      availableMemoryBytes: availableGb * GB,
      totalMemoryBytes: totalGb * GB,
    });
  });
  return { asked, [Symbol.dispose]: () => answer[Symbol.dispose]() };
}

async function openApp(path: string) {
  const router = getRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  await using stack = new AsyncDisposableStack();
  stack.use(
    await render(<AppRoot router={router} />, {
      // AppRoot brings its own router.
      router: false,
    }),
  );
  return { router, stack: stack.move() };
}

async function openThread(thread: FakeThread) {
  const app = await openApp(`/${ENVIRONMENT_ID}/${thread.id}`);
  await using stack = new AsyncDisposableStack();
  stack.use(app.stack);
  await expect.element(page.getByText(`Answer 0 for ${thread.id}.`)).toBeVisible();
  return { router: app.router, stack: stack.move() };
}

const readout = () => document.querySelector<HTMLElement>(READOUT);
const rowText = () => readout()?.textContent ?? null;

it("shows the memory of a stock server in the sidebar footer, and no disk number", async () => {
  const thread = threadWithHistory("resources-memory", 1);
  using _environment = setup([thread]);
  using memory = serveMemory(12, 64);
  await page.viewport(1280, 800);
  const app = await openThread(thread);
  await using _app = app.stack;

  await vi.waitFor(() => expect(rowText()).toContain("RAM 12 / 64 GB"));
  const footer = document.querySelector<HTMLElement>(FOOTER)!;
  expect(footer.contains(readout())).toBe(true);
  const row = readout()!.querySelector<HTMLElement>("[data-environment-resources-row]")!;
  expect(row.dataset.environmentResourcesRow).toBe(ENVIRONMENT_ID);
  expect(row.textContent).not.toContain("GB free");
  expect(row.getAttribute("aria-label")).toContain(
    "The server of this environment does not report free disk space. 12 GB of 64 GB memory free.",
  );
  expect(row.querySelector("[data-low]")).toBeNull();
  // One quiet line inside the footer, above the stock buttons.
  const footerBox = footer.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  expect(rowBox.height).toBeGreaterThan(0);
  expect(rowBox.height).toBeLessThan(20);
  expect(rowBox.left).toBeGreaterThanOrEqual(footerBox.left);
  expect(rowBox.right).toBeLessThanOrEqual(footerBox.right);
  expect(rowBox.bottom).toBeLessThanOrEqual(
    page.getByRole("button", { name: "Settings" }).element().getBoundingClientRect().top,
  );
  expect(memory.asked.count).toBeGreaterThan(0);

  // The header closes the readout: no row, and no more request. It opens it again.
  const header = page.getByRole("button", { name: "Machines" });
  await header.click();
  await vi.waitFor(() =>
    expect(readout()!.querySelector("[data-environment-resources-row]")).toBeNull(),
  );
  expect(header.element().getAttribute("aria-expanded")).toBe("false");
  expect(useResourcesCollapseStore.getState().collapsed).toBe(true);
  await header.click();
  await vi.waitFor(() => expect(rowText()).toContain("RAM 12 / 64 GB"));
});

it("adds the disk space of the desktop app's own machine, and turns a low number amber", async () => {
  const thread = threadWithHistory("resources-disk", 1);
  // 8% of the disk is free and 5% of the memory: both are below the 10% limit.
  using _environment = setup([thread], { availableBytes: 40 * GB, totalBytes: 500 * GB });
  using _memory = serveMemory(3.2, 64);
  await page.viewport(1280, 800);
  const app = await openThread(thread);
  await using _app = app.stack;

  await vi.waitFor(() => {
    expect(rowText()).toContain("40 GB free");
    expect(rowText()).toContain("RAM 3.2 / 64 GB");
  });
  const row = readout()!.querySelector<HTMLElement>("[data-environment-resources-row]")!;
  expect(row.getAttribute("aria-label")).toContain(
    "40 GB of 500 GB disk space free. 3.2 GB of 64 GB memory free.",
  );
  const low = [...row.querySelectorAll<HTMLElement>("[data-low]")];
  expect(low.map((part) => part.textContent)).toEqual(["40 GB free", "RAM 3.2 / 64 GB"]);
  const nameColor = getComputedStyle(row.querySelector("span")!).color;
  for (const part of low) expect(getComputedStyle(part).color).not.toBe(nameColor);
});

it("leaves the stock footer when the setting is off, and Settings > Appearance turns it off and on", async () => {
  const thread = threadWithHistory("resources-off", 1);
  using _environment = setup([thread]);
  using memory = serveMemory(12, 64);
  useReadoutSettingsStore.getState().setReadoutSetting("showEnvironmentResources", false);
  await page.viewport(1280, 800);
  const app = await openThread(thread);
  await using _app = app.stack;

  // Off: the footer holds only stock nodes, and no request goes to the environment.
  const footer = document.querySelector<HTMLElement>(FOOTER)!;
  expect(readout()).toBeNull();
  expect(footer.querySelector("[data-environment-resources-row]")).toBeNull();
  expect(memory.asked.count).toBe(0);

  await app.router.navigate({ to: "/settings/appearance" });
  const toggle = page.getByRole("switch", { name: "Show environment resources" });
  await expect.element(toggle).toBeVisible();
  await expect.element(toggle).not.toBeChecked();
  await toggle.click();
  await vi.waitFor(() => expect(rowText()).toContain("RAM 12 / 64 GB"));
  expect(useReadoutSettingsStore.getState().showEnvironmentResources).toBe(true);

  await toggle.click();
  await vi.waitFor(() => expect(readout()).toBeNull());
  expect(useReadoutSettingsStore.getState().showEnvironmentResources).toBe(false);
});

/** Stands in for the stock composer of an automatic draft, the one reader of the stock sample. */
function LoadBalanceProbe() {
  const picked = useLoadBalancedEnvironment([ENVIRONMENT_ID], {});
  return <output data-load-balance-probe={picked.environmentId ?? ""} />;
}

it("leaves the stock sample of load balancing to stock, so a new automatic draft gets a fresh one", async () => {
  const thread = threadWithHistory("resources-load-balance", 1);
  using _environment = setup([thread]);
  using memory = serveMemory(12, 64);
  // The age of a sample is a difference of two `Date.now` readings.
  const startedAt = Date.parse("2026-11-18T10:00:00.000Z");
  using now = vi.spyOn(Date, "now").mockReturnValue(startedAt);
  await page.viewport(1280, 800);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  const tree = (probe: boolean) => (
    <>
      <AppRoot router={router} />
      {probe ? (
        <RegistryContext.Provider value={appAtomRegistry}>
          <LoadBalanceProbe />
        </RegistryContext.Provider>
      ) : null}
    </>
  );
  // AppRoot brings its own router.
  await using screen = await render(tree(false), { router: false });
  await expect.element(page.getByText(`Answer 0 for ${thread.id}.`)).toBeVisible();
  await vi.waitFor(() => expect(rowText()).toContain("RAM 12 / 64 GB"));
  const askedByReadout = memory.asked.count;

  // 20 s later the sample of the readout is older than the 15 s that load balancing accepts.
  now.mockReturnValue(startedAt + 20_000);
  await screen.rerender(tree(true));
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLElement>("[data-load-balance-probe]")?.dataset.loadBalanceProbe,
    ).toBe(ENVIRONMENT_ID),
  );
  expect(memory.asked.count).toBeGreaterThan(askedByReadout);
});

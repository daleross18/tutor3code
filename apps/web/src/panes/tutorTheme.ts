import type { ThemeColors, ThemeDefinition } from "@t3tools/shared/themePalettes";

import { refreshTheme, setAppearanceMode, setTheme } from "../hooks/useTheme";
import { getCustomThemes, installCustomTheme, updateCustomTheme } from "../themePalette";

const TUTOR_THEME_ID = "tutor";
/** Raise this number with every palette change, so that clients replace their stored copy. */
export const TUTOR_THEME_VERSION = 1;
// "v2": the default became the dark palette for every client, also for one that chose a theme.
const ADOPTED_STORAGE_KEY = "tutor3:default-theme-adopted:v2";

const INK = "#202020";
const YELLOW = "#ffd24c";
const YELLOW_HOVER = "#ffaa00";
const YELLOW_TEXT_ON_LIGHT = "#5d4400";
const YELLOW_TINT = "#fff1c4";
const YELLOW_TINT_ON_DARK = "#3d3725";

const TUTOR_LIGHT_COLORS: ThemeColors = {
  canvas: "#ffffff",
  chrome: "#ffffff",
  toolbar: "#ffffff",
  toolbarForeground: INK,
  toolbarBorder: "#ececec",
  toolbarControl: "#ffffff",
  toolbarControlForeground: INK,
  toolbarControlHover: "#f5f5f5",
  surface: "#ffffff",
  surfaceRaised: "#ffffff",
  surfaceOverlay: "#ffffff",
  text: INK,
  textMuted: "#666666",
  border: "#e4e4e4",
  input: "#d3d3d3",
  focus: INK,
  accent: YELLOW,
  accentForeground: INK,
  secondary: "#f5f5f5",
  secondaryForeground: INK,
  muted: "#f5f5f5",
  mutedForeground: "#666666",
  placeholder: "#727272",
  secondaryLabel: "#666666",
  iconMuted: "#727272",
  error: "#e86b6b",
  errorForeground: "#a12626",
  errorSurface: "#fde3e3",
  warning: "#e5a94d",
  warningForeground: "#7a4a00",
  warningSurface: "#fdf1dc",
  update: YELLOW,
  updateForeground: YELLOW_TEXT_ON_LIGHT,
  updateSurface: YELLOW_TINT,
  accentSurface: "#ececec",
  accentSurfaceForeground: INK,
  messageSurface: YELLOW_TINT,
  messageForeground: INK,
  messageAction: YELLOW,
  messageActionForeground: INK,
  messageActionHover: YELLOW_HOVER,
  codeBackground: "#f5f5f5",
  codeForeground: INK,
  searchMatchBackground: "#ffe699",
  searchMatchForeground: INK,
  searchMatchActiveBackground: YELLOW_HOVER,
  searchMatchActiveForeground: INK,
  sidebar: "#f5f5f5",
  sidebarForeground: INK,
  sidebarMutedForeground: "#666666",
  sidebarControlSurface: "#ececec",
  sidebarRowHover: "#ececec",
  sidebarRowActive: YELLOW_TINT,
  sidebarRowSelected: YELLOW_TINT,
  sidebarBorder: "#e4e4e4",
  terminalBackground: "#ffffff",
  terminalForeground: INK,
  terminalCursor: INK,
  terminalSelection: "#d9d9d9",
  terminalScrollbar: "#d3d3d3",
  terminalScrollbarHover: "#b8b8b8",
};

const TUTOR_DARK_COLORS: ThemeColors = {
  canvas: INK,
  chrome: INK,
  toolbar: INK,
  toolbarForeground: "#f5f5f5",
  toolbarBorder: "#333333",
  toolbarControl: "#2a2a2a",
  toolbarControlForeground: "#f5f5f5",
  toolbarControlHover: "#383838",
  surface: "#242424",
  surfaceRaised: "#2a2a2a",
  surfaceOverlay: "#2e2e2e",
  text: "#f5f5f5",
  textMuted: "#a5a5a5",
  border: "#333333",
  input: "#4d4d4d",
  focus: YELLOW,
  accent: YELLOW,
  accentForeground: INK,
  secondary: "#2e2e2e",
  secondaryForeground: "#f5f5f5",
  muted: "#2a2a2a",
  mutedForeground: "#a5a5a5",
  placeholder: "#a5a5a5",
  secondaryLabel: "#a5a5a5",
  iconMuted: "#a5a5a5",
  error: "#e86b6b",
  errorForeground: "#f39c9c",
  errorSurface: "#3d1a1a",
  warning: "#e5a94d",
  warningForeground: "#f0c98a",
  warningSurface: "#3a2c12",
  update: YELLOW,
  updateForeground: YELLOW,
  updateSurface: "#4a3800",
  accentSurface: "#383838",
  accentSurfaceForeground: "#f5f5f5",
  messageSurface: YELLOW_TINT_ON_DARK,
  messageForeground: "#f5f5f5",
  messageAction: YELLOW,
  messageActionForeground: INK,
  messageActionHover: YELLOW_HOVER,
  codeBackground: "#1b1b1b",
  codeForeground: "#f5f5f5",
  searchMatchBackground: "#5d4400",
  searchMatchForeground: "#ffffff",
  searchMatchActiveBackground: YELLOW,
  searchMatchActiveForeground: INK,
  sidebar: "#1b1b1b",
  sidebarForeground: "#f5f5f5",
  sidebarMutedForeground: "#a5a5a5",
  sidebarControlSurface: "#242424",
  sidebarRowHover: "#262626",
  sidebarRowActive: YELLOW_TINT_ON_DARK,
  sidebarRowSelected: YELLOW_TINT_ON_DARK,
  sidebarBorder: "#2b2b2b",
  terminalBackground: INK,
  terminalForeground: "#f5f5f5",
  terminalCursor: YELLOW,
  terminalSelection: "#454545",
  terminalScrollbar: "#3a3a3a",
  terminalScrollbarHover: "#4d4d4d",
};

// The stock markup also uses the action color as a text color. Tutor yellow on
// white has a contrast of 1.4, so the light theme shows that text in the dark yellow.
const TUTOR_THEME_CSS = `html[data-theme-id="${TUTOR_THEME_ID}"]:not(.dark) :is(.text-primary, .text-primary\\/70, .hover\\:text-primary:hover, .group:hover .group-hover\\:text-primary, [data-slot="empty-description"] > a:hover) { color: ${YELLOW_TEXT_ON_LIGHT}; }`;

export const TUTOR_THEME: ThemeDefinition = {
  id: TUTOR_THEME_ID,
  label: "Tutor",
  appearance: "light",
  colors: TUTOR_LIGHT_COLORS,
  variants: { dark: TUTOR_DARK_COLORS },
  css: TUTOR_THEME_CSS,
};

export type TutorThemeStep = "install" | "update" | "selectDark";

/**
 * `adoptedVersion` is null on a client that never ran this: it gets the theme in the dark
 * palette once, whatever it showed before. A later choice of the user wins.
 */
export function tutorThemeSteps(input: {
  readonly adoptedVersion: number | null;
  readonly installed: boolean;
}): ReadonlyArray<TutorThemeStep> {
  if (input.adoptedVersion === null) {
    return input.installed ? ["selectDark"] : ["install", "selectDark"];
  }
  return input.adoptedVersion < TUTOR_THEME_VERSION && input.installed ? ["update"] : [];
}

function readAdoptedVersion(): number | null {
  const version = Number.parseInt(window.localStorage.getItem(ADOPTED_STORAGE_KEY) ?? "", 10);
  return Number.isNaN(version) ? null : version;
}

/** Makes the dark Tutor theme the default look. Call it once at start, before the environment default theme. */
export function adoptTutorTheme(): void {
  if (typeof window === "undefined") return;
  try {
    const adoptedVersion = readAdoptedVersion();
    if (adoptedVersion === TUTOR_THEME_VERSION) return;
    const steps = tutorThemeSteps({
      adoptedVersion,
      installed: getCustomThemes().some((theme) => theme.id === TUTOR_THEME_ID),
    });
    if (steps.includes("install")) installCustomTheme(TUTOR_THEME);
    if (steps.includes("update")) {
      updateCustomTheme(TUTOR_THEME);
      refreshTheme();
    }
    // Both writes must succeed before the key records the adoption, so a failure tries again.
    if (steps.includes("selectDark") && !(setTheme(TUTOR_THEME_ID) && setAppearanceMode("dark"))) {
      return;
    }
    window.localStorage.setItem(ADOPTED_STORAGE_KEY, String(TUTOR_THEME_VERSION));
  } catch (cause) {
    // Storage that is not available leaves the stock look. The next start tries again.
    console.warn("Tutor theme was not adopted.", cause);
  }
}

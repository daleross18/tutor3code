import { describe, expect, it } from "vite-plus/test";

import { parseThemeFile, serializeThemeFile } from "../themePalette";
import { TUTOR_THEME, TUTOR_THEME_VERSION, tutorThemeSteps } from "./tutorTheme";

describe("tutorThemeSteps", () => {
  it.each([
    ["a new client", null, false, ["install", "selectDark"]],
    ["a new client that has a theme with the Tutor id", null, true, ["selectDark"]],
    ["the current version is adopted", TUTOR_THEME_VERSION, true, []],
    ["the user removed the theme", TUTOR_THEME_VERSION, false, []],
    ["an older palette is stored", TUTOR_THEME_VERSION - 1, true, ["update"]],
    ["an older palette that the user removed", TUTOR_THEME_VERSION - 1, false, []],
  ] as const)("%s", (_name, adoptedVersion, installed, steps) => {
    expect(tutorThemeSteps({ adoptedVersion, installed })).toEqual(steps);
  });
});

it("the stock theme parser keeps both palettes and the styles of the Tutor theme", () => {
  const parsed = parseThemeFile(JSON.parse(serializeThemeFile(TUTOR_THEME)));
  expect(parsed.id).toBe(TUTOR_THEME.id);
  expect(parsed.css).toBe(TUTOR_THEME.css);
  expect(parseThemeFile(JSON.parse(serializeThemeFile(parsed)))).toEqual(parsed);
  expect(Object.keys(parsed.variants ?? {})).toEqual(["dark"]);
});

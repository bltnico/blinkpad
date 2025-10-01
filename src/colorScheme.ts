import { COLOR_SCHEME_STORAGE_KEY } from "./constants.ts";
import storage from "./storage.ts";

export type ColorScheme = "light" | "dark";
export type ColorSchemePreference = ColorScheme | "auto";

type MatchMediaChangeHandler = (event: MediaQueryListEvent) => void;

type RemoveListener = () => void;

export function getSystemColorScheme(query?: MediaQueryList): ColorScheme {
  const mediaQuery = query ?? window.matchMedia("(prefers-color-scheme: dark)");
  return mediaQuery.matches ? "dark" : "light";
}

async function loadStoredColorSchemePreference(): Promise<ColorSchemePreference> {
  try {
    const stored = await storage.getItem<string>(COLOR_SCHEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch (error) {
    console.error("Unable to load stored color scheme", error);
  }
  return "auto";
}

async function persistColorSchemePreference(
  preference: ColorSchemePreference
): Promise<void> {
  try {
    if (preference === "auto") {
      await storage.removeItem(COLOR_SCHEME_STORAGE_KEY);
    } else {
      await storage.setItem(COLOR_SCHEME_STORAGE_KEY, preference);
    }
  } catch (error) {
    console.error("Unable to persist color scheme preference", error);
  }
}

function applyColorSchemePreference(preference: ColorSchemePreference) {
  const root = document.documentElement;
  const metaTheme = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );

  const setMetaThemeColor = (scheme: ColorScheme) => {
    if (!metaTheme) return;
    const color = scheme === "dark" ? "#000000" : "#ffffff";
    metaTheme.setAttribute("content", color);
  };

  if (preference === "auto") {
    setMetaThemeColor(getSystemColorScheme());
    root.removeAttribute("data-theme");
    return;
  }

  setMetaThemeColor(preference);
  root.setAttribute("data-theme", preference);
}

function getNextColorSchemePreference(
  current: ColorSchemePreference,
  system: ColorScheme
): ColorSchemePreference {
  if (current === "auto") {
    return system === "dark" ? "light" : "dark";
  }

  if (current === "light") {
    return "dark";
  }

  return "auto";
}

function describeColorSchemePreference(
  preference: ColorSchemePreference,
  effective: ColorScheme
): string {
  const capitalise = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1);
  if (preference === "auto") {
    return `System (${capitalise(effective)})`;
  }
  return capitalise(preference);
}

function addMatchMediaChangeListener(
  query: MediaQueryList,
  handler: MatchMediaChangeHandler
): RemoveListener {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }

  if (typeof query.addListener === "function") {
    query.addListener(handler);
    return () => query.removeListener(handler);
  }

  return () => {};
}

export async function setupColorSchemeManagement(button: HTMLButtonElement | null) {
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = await loadStoredColorSchemePreference();

  const updateToggleDescription = () => {
    if (!button) return;

    const systemScheme = getSystemColorScheme(systemQuery);
    const effectiveScheme = preference === "auto" ? systemScheme : preference;
    const description = describeColorSchemePreference(
      preference,
      effectiveScheme
    );
    const nextPreference = getNextColorSchemePreference(
      preference,
      systemScheme
    );
    const nextEffectiveScheme =
      nextPreference === "auto"
        ? getSystemColorScheme(systemQuery)
        : nextPreference;
    const nextDescription = describeColorSchemePreference(
      nextPreference,
      nextEffectiveScheme
    );
    const label = `Color scheme: ${description}.\nClick to switch to ${nextDescription}.`;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(preference !== "auto"));
  };

  const applyPreference = () => {
    applyColorSchemePreference(preference);
    updateToggleDescription();
  };

  applyPreference();

  addMatchMediaChangeListener(systemQuery, () => {
    applyPreference();
  });

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    const systemScheme = getSystemColorScheme(systemQuery);
    preference = getNextColorSchemePreference(preference, systemScheme);
    applyColorSchemePreference(preference);
    void persistColorSchemePreference(preference);
    updateToggleDescription();
  });
}

export type ThemeMode = "system" | "latte" | "one-dark";
export type ResolvedTheme = "latte" | "one-dark";

const THEME_KEY = "chatter3-theme";
const darkQuery = "(prefers-color-scheme: dark)";

export function getInitialThemeMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "latte" || stored === "one-dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function persistThemeMode(themeMode: ThemeMode) {
  localStorage.setItem(THEME_KEY, themeMode);
}

export function resolveThemeMode(themeMode: ThemeMode): ResolvedTheme {
  if (themeMode === "latte" || themeMode === "one-dark") {
    return themeMode;
  }
  return window.matchMedia(darkQuery).matches ? "one-dark" : "latte";
}

export function applyResolvedTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "one-dark" ? "dark" : "light";
}

export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void) {
  const query = window.matchMedia(darkQuery);
  const listener = () => onChange(query.matches ? "one-dark" : "latte");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

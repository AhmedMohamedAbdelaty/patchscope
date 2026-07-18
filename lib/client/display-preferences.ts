export type Theme =
  | "system"
  | "light"
  | "dark"
  | "paper"
  | "terminal"
  | "contrast"
  | "color-safe";
export type Density = "comfortable" | "compact";
export type TypeScale = "small" | "standard" | "large";
export type CodeFont = "default" | "system" | "sans";
export type Motion = "system" | "reduced";

export interface DisplayPreferences {
  theme: Theme;
  density: Density;
  typeScale: TypeScale;
  codeFont: CodeFont;
  motion: Motion;
}

export const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "paper", label: "Paper" },
  { value: "terminal", label: "Terminal" },
  { value: "contrast", label: "High contrast" },
  { value: "color-safe", label: "Color safe" },
];

export function isTheme(value: unknown): value is Theme {
  return THEME_OPTIONS.some((option) => option.value === value);
}

export function isDensity(value: unknown): value is Density {
  return value === "comfortable" || value === "compact";
}

export function isTypeScale(value: unknown): value is TypeScale {
  return value === "small" || value === "standard" || value === "large";
}

export function isCodeFont(value: unknown): value is CodeFont {
  return value === "default" || value === "system" || value === "sans";
}

export function isMotion(value: unknown): value is Motion {
  return value === "system" || value === "reduced";
}

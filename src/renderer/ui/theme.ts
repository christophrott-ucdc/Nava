/**
 * Scene themes -> CSS variables (subtitle border, vignette, glow) + epilogue white fade.
 */

import type { SceneTheme } from "../../shared/types";

export interface ThemePalette {
  accent: string;
  glow: string;
  vignette: string;
  /** 0..1 strength of the vignette layer. */
  vignetteStrength: number;
}

export const THEME_PALETTES: Record<SceneTheme, ThemePalette> = {
  prologue: { accent: "oklch(0.72 0.14 250)", glow: "oklch(0.82 0.12 255)", vignette: "oklch(0.16 0.07 262 / 0.8)", vignetteStrength: 1 },
  launch: { accent: "oklch(0.86 0.1 228)", glow: "oklch(0.96 0.04 220)", vignette: "oklch(0.3 0.09 240 / 0.55)", vignetteStrength: 0.8 },
  light: { accent: "#fcd34d", glow: "#fde68a", vignette: "oklch(0.35 0.1 80 / 0.55)", vignetteStrength: 0.8 },
  nature: { accent: "#86efac", glow: "#22c55e", vignette: "oklch(0.28 0.09 150 / 0.65)", vignetteStrength: 0.9 },
  tech: { accent: "#a5f3fc", glow: "#67e8f9", vignette: "oklch(0.3 0.06 232 / 0.6)", vignetteStrength: 0.85 },
  void: { accent: "oklch(0.7 0.2 300)", glow: "oklch(0.62 0.24 305)", vignette: "oklch(0.08 0.07 300 / 0.9)", vignetteStrength: 1 },
  home: { accent: "oklch(0.78 0.16 215)", glow: "oklch(0.85 0.18 200)", vignette: "oklch(0.22 0.08 240 / 0.6)", vignetteStrength: 0.8 },
  white: { accent: "oklch(0.75 0.08 75)", glow: "oklch(0.98 0.02 80)", vignette: "oklch(0.98 0.02 80 / 0)", vignetteStrength: 0 },
};

export const ALL_THEMES: readonly SceneTheme[] = ["prologue", "launch", "light", "nature", "tech", "void", "home", "white"];

export function isSceneTheme(v: unknown): v is SceneTheme {
  return typeof v === "string" && (ALL_THEMES as readonly string[]).includes(v);
}

export interface ThemeController {
  /** Apply a theme (idempotent). `fast` shortens the white-fade transition (used on restart / seek). */
  apply(theme: SceneTheme, opts?: { fast?: boolean }): void;
  current(): SceneTheme;
  /** Force the white overlay independently of the theme (e.g. epilogue entered manually). */
  setWhiteFade(on: boolean, opts?: { fast?: boolean }): void;
  palette(theme?: SceneTheme): ThemePalette;
  /** R4 — notified on every theme CHANGE (ambient bed auto-follow, lights preview...). Returns an unsubscribe. */
  onChange(listener: (theme: SceneTheme, previous: SceneTheme | null) => void): () => void;
}

export function createTheme(root: HTMLElement, whiteFade: HTMLElement | null, initial: SceneTheme = "prologue"): ThemeController {
  let cur: SceneTheme | null = null;
  const style = document.documentElement.style;
  const listeners = new Set<(theme: SceneTheme, previous: SceneTheme | null) => void>();

  const setWhite = (on: boolean, fast: boolean) => {
    if (!whiteFade) return;
    whiteFade.classList.toggle("fast", fast);
    whiteFade.classList.toggle("on", on);
  };

  const apply = (theme: SceneTheme, opts?: { fast?: boolean }) => {
    const p = THEME_PALETTES[theme] ?? THEME_PALETTES.prologue;
    style.setProperty("--theme-accent", p.accent);
    style.setProperty("--theme-glow", p.glow);
    style.setProperty("--theme-vignette", p.vignette);
    style.setProperty("--theme-vignette-strength", String(p.vignetteStrength));
    root.dataset.theme = theme;
    setWhite(theme === "white", !!opts?.fast);
    const previous = cur;
    cur = theme;
    if (previous !== theme) {
      for (const fn of listeners) {
        try {
          fn(theme, previous);
        } catch {
          /* listeners must never break theming */
        }
      }
    }
  };

  apply(initial, { fast: true });

  return {
    apply,
    current: () => cur ?? initial,
    setWhiteFade: (on, opts) => setWhite(on, !!opts?.fast),
    palette: (theme) => THEME_PALETTES[theme ?? cur ?? initial],
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

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
  prologue: { accent: "#c2a8ff", glow: "#e6dbff", vignette: "#8975b84d", vignetteStrength: 0.8 },
  launch: { accent: "#7cc4ff", glow: "#d4ecff", vignette: "#6597c04d", vignetteStrength: 0.8 },
  light: { accent: "#ffd166", glow: "#fff0b9", vignette: "#c6a5574d", vignetteStrength: 0.8 },
  nature: { accent: "#7be0b5", glow: "#c3f2dc", vignette: "#579e7d4d", vignetteStrength: 0.8 },
  tech: { accent: "#7cc4ff", glow: "#ceeaff", vignette: "#7298c24d", vignetteStrength: 0.8 },
  void: { accent: "#c2a8ff", glow: "#d2bfee", vignette: "#65589059", vignetteStrength: 1 },
  home: { accent: "#ffcfa8", glow: "#ffddc3", vignette: "#bd9b814d", vignetteStrength: 0.8 },
  white: { accent: "#ffd166", glow: "#fff8e9", vignette: "#fff8e900", vignetteStrength: 0 },
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
    document.documentElement.dataset.theme = theme;
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

/**
 * Bottom-centre subtitles with a coloured speaker label. Fade 250 ms (CSS).
 */

import { SPEAKERS, type Speaker } from "../../shared/types";

export interface Subtitles {
  show(speaker: Speaker, text: string): void;
  /** Hide immediately. */
  hide(): void;
  /** Hide after `ms` unless a new subtitle is shown meanwhile. */
  hideAfter(ms: number): void;
  isVisible(): boolean;
  setEnabled(enabled: boolean): void;
}

export function createSubtitles(el: HTMLElement, opts: { enabled: boolean }): Subtitles {
  const speakerEl = el.querySelector<HTMLElement>(".speaker");
  const textEl = el.querySelector<HTMLElement>(".text");
  let enabled = opts.enabled;
  let visible = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hide = () => {
    clearTimer();
    visible = false;
    el.classList.remove("on");
  };

  return {
    show(speaker, text) {
      clearTimer();
      if (!enabled) return;
      const profile = SPEAKERS[speaker];
      el.dataset.speaker = speaker;
      if (speakerEl) {
        speakerEl.textContent = profile?.label ?? speaker;
      }
      el.style.setProperty("--subtitle-speaker", profile?.color ?? "var(--theme-accent)");
      if (textEl) textEl.textContent = text;
      visible = true;
      el.classList.add("on");
    },
    hide,
    hideAfter(ms) {
      clearTimer();
      if (!visible) return;
      hideTimer = setTimeout(() => {
        hideTimer = null;
        hide();
      }, Math.max(0, ms));
    },
    isVisible: () => visible,
    setEnabled(v) {
      enabled = v;
      if (!v) hide();
    },
  };
}

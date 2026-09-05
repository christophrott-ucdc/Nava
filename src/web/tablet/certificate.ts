/**
 * D-06 — certificatul de misiune desenat pe tabletă (canvas 1200×1700 → PNG).
 * Conținut: titlul „CERTIFICAT DE MISIUNE · EXODUS-7”, postul + lentila, alegerile confirmate ale perechii
 * (zona A / zona B, per interacțiune), data și replica de încheiere. Fără biblioteci.
 */

import type { SceneTheme, TabletPost } from "@shared/types";
import { TABLET_POSTS } from "@shared/types";

export interface CertificateChoice {
  cueId: string;
  prompt: string;
  /** Eticheta aleasă (sau „Doar privesc”) per zonă; lipsă = nu a răspuns. */
  A?: string;
  B?: string;
}

export interface CertificateInput {
  post: TabletPost;
  lens: string;
  choices: CertificateChoice[];
  date: Date;
  theme: SceneTheme;
}

export const CERT_W = 1200;
export const CERT_H = 1700;
export const CLOSING_LINE = "Ați plecat ca să găsiți alte lumi. V-ați întors cu a voastră, văzută pentru prima dată.";

const THEME_INK: Record<SceneTheme, string> = {
  prologue: "#6ee7ff",
  launch: "#8edfff",
  light: "#ffd875",
  nature: "#82e6a3",
  tech: "#8cecff",
  void: "#bd92ff",
  home: "#68c9ff",
  white: "#2f7184",
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = test;
  }
  if (current) lines.push(current);
  return lines;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function drawCertificate(canvas: HTMLCanvasElement, input: CertificateInput): void {
  canvas.width = CERT_W;
  canvas.height = CERT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ink = THEME_INK[input.theme] ?? THEME_INK.home;
  const W = CERT_W;
  const H = CERT_H;

  // Background: deep space gradient + stars.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#071a2e");
  bg.addColorStop(0.55, "#04101c");
  bg.addColorStop(1, "#020609");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 260; i += 1) star(ctx, rnd(i) * W, rnd(i + 1000) * H, 0.6 + rnd(i + 2000) * 1.8, 0.25 + rnd(i + 3000) * 0.6);
  const glow = ctx.createRadialGradient(W / 2, 360, 20, W / 2, 360, 520);
  glow.addColorStop(0, `${ink}55`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Frame.
  ctx.strokeStyle = `${ink}aa`;
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 60, W - 120, H - 120);
  ctx.strokeStyle = `${ink}44`;
  ctx.lineWidth = 1;
  ctx.strokeRect(80, 80, W - 160, H - 160);
  for (const [x, y] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]] as Array<[number, number]>) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#04101c";
    ctx.fillRect(-16, -16, 32, 32);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(-16, -16, 32, 32);
    ctx.restore();
  }

  // Ship seal.
  ctx.save();
  ctx.translate(W / 2, 250);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(Math.PI / 4);
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-24, -24, 48, 48);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "#eef8ff";
  ctx.font = "700 30px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("7", 0, 1);
  ctx.beginPath();
  ctx.moveTo(-160, 0);
  ctx.lineTo(-90, 0);
  ctx.moveTo(90, 0);
  ctx.lineTo(160, 0);
  ctx.strokeStyle = `${ink}88`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = "700 26px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText("A  P A T R A  L U M E", W / 2, 395);
  ctx.fillStyle = "#eef8ff";
  ctx.font = "800 58px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText("CERTIFICAT DE MISIUNE", W / 2, 470);
  ctx.fillStyle = ink;
  ctx.font = "700 40px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText("· EXODUS-7 ·", W / 2, 525);

  ctx.fillStyle = "#9bb2c1";
  ctx.font = "500 24px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText("se atestă că echipajul de la", W / 2, 615);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 64px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText(TABLET_POSTS[input.post].label, W / 2, 695);
  ctx.fillStyle = ink;
  ctx.font = "700 34px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText(`LENTILA: ${input.lens.toUpperCase()}`, W / 2, 745);
  ctx.fillStyle = "#9bb2c1";
  ctx.font = "500 24px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText("a ținut semnalul navei până la capăt și a ales, în pereche, ce ia cu sine.", W / 2, 800);

  // Choices.
  const [pA, pB] = TABLET_POSTS[input.post].perspectives;
  let y = 880;
  ctx.textAlign = "left";
  if (!input.choices.length) {
    ctx.fillStyle = "#9bb2c1";
    ctx.font = "italic 500 26px 'Segoe UI', Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Acest post a privit și a ascultat — și asta face parte din misiune.", W / 2, y + 30);
    y += 110;
  } else {
    for (const choice of input.choices.slice(0, 4)) {
      ctx.fillStyle = `${ink}22`;
      ctx.fillRect(120, y - 34, W - 240, 132);
      ctx.fillStyle = ink;
      ctx.fillRect(120, y - 34, 6, 132);
      ctx.fillStyle = "#c8d7e1";
      ctx.font = "600 24px 'Segoe UI', Inter, system-ui, sans-serif";
      const promptLines = wrap(ctx, choice.prompt, W - 300).slice(0, 2);
      promptLines.forEach((line, i) => ctx.fillText(line, 150, y + i * 30));
      const rowY = y + 30 * promptLines.length + 32;
      ctx.font = "700 20px 'Segoe UI', Inter, system-ui, sans-serif";
      ctx.fillStyle = "#9bb2c1";
      ctx.fillText(`A · ${pA}`, 150, rowY);
      ctx.fillText(`B · ${pB}`, W / 2 + 20, rowY);
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 30px 'Segoe UI', Inter, system-ui, sans-serif";
      ctx.fillText(choice.A ?? "—", 150, rowY + 38);
      ctx.fillText(choice.B ?? "—", W / 2 + 20, rowY + 38);
      y += 168;
    }
  }

  // Closing line.
  ctx.textAlign = "center";
  const closeY = Math.max(y + 60, H - 380);
  ctx.strokeStyle = `${ink}66`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(200, closeY - 50);
  ctx.lineTo(W - 200, closeY - 50);
  ctx.stroke();
  ctx.fillStyle = "#eef8ff";
  ctx.font = "italic 500 30px 'Segoe UI', Inter, system-ui, sans-serif";
  wrap(ctx, CLOSING_LINE, W - 280).forEach((line, i) => ctx.fillText(line, W / 2, closeY + i * 42));

  // Date + footer.
  const dateText = input.date.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillStyle = ink;
  ctx.font = "700 24px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText(dateText.toUpperCase(), W / 2, H - 200);
  ctx.fillStyle = "#87a4b8";
  ctx.font = "500 20px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText("A Patra Lume · UCDC HUB AI · Nava EXODUS-7", W / 2, H - 160);
  ctx.fillStyle = "#5c7688";
  ctx.font = "500 16px 'Segoe UI', Inter, system-ui, sans-serif";
  ctx.fillText("Certificat anonim: aparține postului, nu unui nume.", W / 2, H - 125);
}

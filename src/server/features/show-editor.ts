/**
 * D-04 — editorul de cue-uri (router Hono, montat de orchestrator la `/api/show`):
 *
 *   GET    /                 show-ul curent (cel din director, nu neaparat cel de pe disc)
 *   PUT    /  | POST /       corp = ShowFile complet → validare (features/show-validate.ts) → backup
 *                            `assets/show/backups/show-<timestamp>.json` (pastreaza 30) → scriere → reload → difuzare
 *   PATCH  /cue/:id          { at?, text?, manual?, note? } — corectii rapide (text = text.ro pentru voice)
 *   GET    /backups          lista backup-urilor (cel mai nou primul)
 *   POST   /restore/:file    restaureaza un backup (validat), cu backup al fisierului curent
 *
 * Toate scrierile trec prin acelasi pipeline: validare → backup → scriere atomica (tmp + rename) → `reload()`
 * (functia orchestratorului care reciteste fisierul, face director.setShow si trimite `welcome` tuturor).
 * Cue-urile sunt reordonate canonic (faza, apoi `at`) inainte de scriere.
 *
 * Previzualizarea cadrelor (`GET /api/frame?t=`) este a orchestratorului (src/server/debug.ts).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import type { Cue, ShowFile } from "../../shared/types";
import type { DispatchResult } from "../state";
import type { LogFn } from "../runlog";
import { sortCues, validateShowFile, type ShowValidation } from "./show-validate";

export interface ShowEditorDeps {
  /** Calea absoluta a show.json. */
  showPath: string;
  /** Folderul backup-urilor (implicit `<dirname(showPath)>/backups`). */
  backupsDir?: string;
  /** Cate backup-uri se pastreaza (implicit 30). */
  maxBackups?: number;
  getShow: () => ShowFile;
  /** Reciteste fisierul de pe disc, aplica in director si difuzeaza (index.ts `reloadShow`). */
  reload: () => Promise<DispatchResult>;
  log: LogFn;
}

export interface ShowEditor {
  router: Hono;
  /** Scrie un show validat (backup + scriere + reload). Folosit si de PATCH/restore. */
  save(show: unknown, reason: string): Promise<SaveResult>;
  listBackups(): Promise<BackupInfo[]>;
}

export interface BackupInfo {
  file: string;
  bytes: number;
  mtime: string;
}

export type SaveResult =
  | { ok: true; warnings: string[]; backup: string | null; cues: number; version: string }
  | { ok: false; reason: string; errors: string[]; warnings: string[]; status: 400 | 500 };

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const BACKUP_RE = /^show-\d{8}-\d{6}(-\d+)?\.json$/;
const DEFAULT_MAX_BACKUPS = 30;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function backupStamp(d = new Date()): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

/** JSON lizibil, cu cheile in ordinea in care sunt in obiect (cea din editor/validator). */
export function serializeShow(show: ShowFile): string {
  return `${JSON.stringify(show, null, 2)}\n`;
}

export function createShowEditor(deps: ShowEditorDeps): ShowEditor {
  const backupsDir = deps.backupsDir ?? path.join(path.dirname(deps.showPath), "backups");
  const maxBackups = deps.maxBackups ?? DEFAULT_MAX_BACKUPS;
  let writing: Promise<unknown> = Promise.resolve();

  const listBackups = async (): Promise<BackupInfo[]> => {
    try {
      const names = (await fs.readdir(backupsDir)).filter((n) => BACKUP_RE.test(n));
      const infos = await Promise.all(
        names.map(async (file) => {
          const st = await fs.stat(path.join(backupsDir, file));
          return { file, bytes: st.size, mtime: st.mtime.toISOString() };
        }),
      );
      return infos.sort((a, b) => (a.file < b.file ? 1 : a.file > b.file ? -1 : 0));
    } catch {
      return [];
    }
  };

  const backupCurrent = async (): Promise<string | null> => {
    let raw: string;
    try {
      raw = await fs.readFile(deps.showPath, "utf8");
    } catch {
      return null; // nothing to back up yet
    }
    await fs.mkdir(backupsDir, { recursive: true });
    let file = `show-${backupStamp()}.json`;
    let n = 1;
    while (await fs.stat(path.join(backupsDir, file)).then(() => true, () => false)) {
      n += 1;
      file = `show-${backupStamp()}-${n}.json`;
    }
    await fs.writeFile(path.join(backupsDir, file), raw, "utf8");
    // Keep the newest `maxBackups`.
    const all = await listBackups();
    for (const old of all.slice(maxBackups)) {
      await fs.rm(path.join(backupsDir, old.file), { force: true }).catch(() => undefined);
    }
    return file;
  };

  const writeAtomic = async (content: string): Promise<void> => {
    const tmp = `${deps.showPath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, deps.showPath);
  };

  const save = (input: unknown, reason: string): Promise<SaveResult> => {
    const job = writing.then(async (): Promise<SaveResult> => {
      const v: ShowValidation = validateShowFile(input);
      if (!v.ok || !v.show) {
        return { ok: false, reason: `Show invalid: ${v.errors[0] ?? "?"}`, errors: v.errors, warnings: v.warnings, status: 400 };
      }
      const show: ShowFile = { ...v.show, cues: sortCues(v.show.cues) };
      let backup: string | null = null;
      try {
        backup = await backupCurrent();
        await writeAtomic(serializeShow(show));
      } catch (err) {
        const msg = String(err instanceof Error ? err.message : err);
        deps.log("error", "show-editor: write failed", { err: msg });
        return { ok: false, reason: `Scrierea show.json a eșuat: ${msg}`, errors: [msg], warnings: v.warnings, status: 500 };
      }
      const r = await deps.reload();
      if (!r.ok) {
        deps.log("error", "show-editor: reload after save failed", { reason: r.reason });
        return { ok: false, reason: r.reason ?? "Reîncărcarea a eșuat", errors: [r.reason ?? "reload"], warnings: v.warnings, status: 500 };
      }
      deps.log("info", `show-editor: saved (${reason})`, { version: show.version, cues: show.cues.length, backup, warnings: v.warnings.length });
      return { ok: true, warnings: v.warnings, backup, cues: show.cues.length, version: show.version };
    });
    writing = job.catch(() => undefined);
    return job;
  };

  const router = new Hono();

  const readJson = async (c: { req: { header(name: string): string | undefined; text(): Promise<string> } }): Promise<unknown | Error> => {
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > MAX_BODY_BYTES) return new Error(`Corpul depășește ${MAX_BODY_BYTES} bytes`);
    const text = await c.req.text();
    if (text.length > MAX_BODY_BYTES) return new Error(`Corpul depășește ${MAX_BODY_BYTES} bytes`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return new Error("Corp JSON invalid");
    }
  };

  router.get("/", (c) => c.json(deps.getShow()));

  const putHandler = async (c: Context): Promise<Response> => {
    const body = await readJson(c);
    if (body instanceof Error) return c.json({ ok: false, reason: body.message }, 400);
    const r = await save(body, "PUT /api/show");
    return c.json(r, r.ok ? 200 : r.status);
  };
  router.put("/", putHandler);
  router.post("/", putHandler);

  router.patch("/cue/:id", async (c) => {
    const id = c.req.param("id");
    const body = await readJson(c);
    if (body instanceof Error) return c.json({ ok: false, reason: body.message }, 400);
    if (!body || typeof body !== "object") return c.json({ ok: false, reason: "Corp invalid" }, 400);
    const patch = body as Record<string, unknown>;
    const show = deps.getShow();
    const index = show.cues.findIndex((cue) => cue.id === id);
    if (index < 0) return c.json({ ok: false, reason: `Cue necunoscut: ${id}` }, 404);
    const cue = { ...show.cues[index] } as Cue & Record<string, unknown>;
    if (patch.at !== undefined) {
      if (typeof patch.at !== "number" || !Number.isFinite(patch.at)) return c.json({ ok: false, reason: "`at` invalid" }, 400);
      cue.at = Math.round(patch.at * 10) / 10;
    }
    if (patch.manual !== undefined) {
      if (typeof patch.manual !== "boolean") return c.json({ ok: false, reason: "`manual` invalid" }, 400);
      if (patch.manual) cue.manual = true;
      else delete cue.manual;
    }
    if (patch.note !== undefined) {
      if (typeof patch.note !== "string") return c.json({ ok: false, reason: "`note` invalid" }, 400);
      if (patch.note.trim()) cue.note = patch.note.trim();
      else delete cue.note;
    }
    if (patch.text !== undefined) {
      if (typeof patch.text !== "string" || !patch.text.trim()) return c.json({ ok: false, reason: "`text` invalid" }, 400);
      if (cue.kind === "voice") cue.text = { ...cue.text, ro: patch.text.trim() };
      else if (cue.kind === "marker") cue.label = patch.text.trim();
      else if (cue.kind === "dynamic-voice") cue.template = { ro: patch.text.trim() };
      else return c.json({ ok: false, reason: "Acest tip de cue nu are text editabil" }, 400);
    }
    const next: ShowFile = { ...show, cues: show.cues.map((x, i) => (i === index ? (cue as Cue) : x)) };
    const r = await save(next, `PATCH /api/show/cue/${id}`);
    return c.json(r, r.ok ? 200 : r.status);
  });

  router.get("/backups", async (c) => c.json({ dir: backupsDir, backups: await listBackups() }));

  router.post("/restore/:file", async (c) => {
    const file = c.req.param("file");
    if (!BACKUP_RE.test(file)) return c.json({ ok: false, reason: "Nume de backup invalid" }, 400);
    let raw: string;
    try {
      raw = await fs.readFile(path.join(backupsDir, file), "utf8");
    } catch {
      return c.json({ ok: false, reason: "Backup inexistent" }, 404);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return c.json({ ok: false, reason: "Backup corupt (JSON invalid)" }, 400);
    }
    const r = await save(parsed, `restore ${file}`);
    return c.json(r, r.ok ? 200 : r.status);
  });

  return { router, save, listBackups };
}

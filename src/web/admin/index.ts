/**
 * Administrare (/admin/) — accounts, sessions and the audit journal for administrators.
 *
 * Reads:   GET  /api/admin/overview, GET /api/admin/audit
 * Writes:  POST /api/users, PATCH /api/users/:id, POST /api/users/:id/pin, DELETE /api/users/:id,
 *          POST /api/admin/sessions/:id/revoke, POST /api/admin/users/:id/sessions/revoke
 *
 * Every mutation is authorised on the server; hiding a control here is presentation, not RBAC.
 * 401 → back to /login (data cleared). 403 → "no access" (data cleared). A response that arrives after
 * logout or after a newer request is ignored (generation counter + AbortController).
 */

import { applyTheme, icon } from "../shared/glass";
import { ROLE_HELP, ROLE_LABELS, type AdminAuditResponse, type AdminOverview, type AdminSession, type AdminUser, type AuditEntry } from "@shared/admin";
import type { UserRole } from "@shared/types";

type ViewId = "prezentare" | "utilizatori" | "sesiuni" | "audit" | "instalatie";
const VIEWS: Record<ViewId, { title: string; eyebrow: string; cta: boolean }> = {
  prezentare: { title: "Prezentare", eyebrow: "Administrare", cta: false },
  utilizatori: { title: "Utilizatori", eyebrow: "Conturi și roluri", cta: true },
  sesiuni: { title: "Sesiuni", eyebrow: "Cine este conectat", cta: false },
  audit: { title: "Audit", eyebrow: "Istoricul modificărilor", cta: false },
  instalatie: { title: "Instalație", eyebrow: "Planificat", cta: false },
};

const ACTION_LABELS: Record<AuditEntry["action"], string> = {
  "user.create": "Cont creat",
  "user.update": "Cont modificat",
  "user.pin": "PIN resetat",
  "user.delete": "Cont șters",
  "session.revoke": "Sesiune închisă",
  "session.revoke-user": "Sesiunile contului închise",
  "auth.login": "Autentificare",
  "auth.logout": "Ieșire",
};

// ---------------------------------------------------------------------------
// DOM

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element lipsă: #${id}`);
  return el as T;
}

const dom = {
  nav: byId<HTMLElement>("nav"),
  viewTitle: byId<HTMLHeadingElement>("view-title"),
  viewEyebrow: byId<HTMLParagraphElement>("view-eyebrow"),
  identity: byId<HTMLSpanElement>("identity"),
  refresh: byId<HTMLButtonElement>("refresh"),
  cta: byId<HTMLButtonElement>("cta"),
  logout: byId<HTMLButtonElement>("logout"),
  main: byId<HTMLElement>("main"),
  status: byId<HTMLParagraphElement>("page-status"),
  denied: byId<HTMLDivElement>("denied"),
  views: byId<HTMLDivElement>("views"),
  factUsers: byId<HTMLParagraphElement>("fact-users"),
  factUsersNote: byId<HTMLParagraphElement>("fact-users-note"),
  factSessions: byId<HTMLParagraphElement>("fact-sessions"),
  factSessionsNote: byId<HTMLParagraphElement>("fact-sessions-note"),
  factMe: byId<HTMLParagraphElement>("fact-me"),
  factMeNote: byId<HTMLParagraphElement>("fact-me-note"),
  factAudit: byId<HTMLParagraphElement>("fact-audit"),
  factAuditNote: byId<HTMLParagraphElement>("fact-audit-note"),
  recent: byId<HTMLOListElement>("recent"),
  recentEmpty: byId<HTMLParagraphElement>("recent-empty"),
  users: byId<HTMLTableSectionElement>("users"),
  usersTable: byId<HTMLTableElement>("users-table"),
  usersEmpty: byId<HTMLDivElement>("users-empty"),
  usersSummary: byId<HTMLParagraphElement>("users-summary"),
  sessions: byId<HTMLTableSectionElement>("sessions"),
  sessionsTable: byId<HTMLTableElement>("sessions-table"),
  sessionsEmpty: byId<HTMLDivElement>("sessions-empty"),
  audit: byId<HTMLTableSectionElement>("audit"),
  auditTable: byId<HTMLTableElement>("audit-table"),
  auditEmpty: byId<HTMLDivElement>("audit-empty"),
  auditSummary: byId<HTMLParagraphElement>("audit-summary"),
  dlgUser: byId<HTMLDialogElement>("dlg-user"),
  formUser: byId<HTMLFormElement>("form-user"),
  dlgUserTitle: byId<HTMLHeadingElement>("dlg-user-title"),
  dlgUserIntro: byId<HTMLParagraphElement>("dlg-user-intro"),
  fName: byId<HTMLInputElement>("f-name"),
  fRole: byId<HTMLSelectElement>("f-role"),
  fRoleHelp: byId<HTMLParagraphElement>("f-role-help"),
  fPinField: byId<HTMLDivElement>("f-pin-field"),
  fPin: byId<HTMLInputElement>("f-pin"),
  fStateField: byId<HTMLDivElement>("f-state-field"),
  fDisabled: byId<HTMLInputElement>("f-disabled"),
  formUserError: byId<HTMLParagraphElement>("form-user-error"),
  formUserSubmit: byId<HTMLButtonElement>("form-user-submit"),
  dlgPin: byId<HTMLDialogElement>("dlg-pin"),
  formPin: byId<HTMLFormElement>("form-pin"),
  dlgPinIntro: byId<HTMLParagraphElement>("dlg-pin-intro"),
  pPin: byId<HTMLInputElement>("p-pin"),
  formPinError: byId<HTMLParagraphElement>("form-pin-error"),
  formPinSubmit: byId<HTMLButtonElement>("form-pin-submit"),
  dlgConfirm: byId<HTMLDialogElement>("dlg-confirm"),
  formConfirm: byId<HTMLFormElement>("form-confirm"),
  dlgConfirmTitle: byId<HTMLHeadingElement>("dlg-confirm-title"),
  dlgConfirmText: byId<HTMLParagraphElement>("dlg-confirm-text"),
  formConfirmError: byId<HTMLParagraphElement>("form-confirm-error"),
  formConfirmSubmit: byId<HTMLButtonElement>("form-confirm-submit"),
  toast: byId<HTMLDivElement>("toast"),
};

document.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
  el.innerHTML = icon(el.dataset.icon ?? "star");
});
// The admin surface stays on the calm welcome theme; it is not linked to the live show.
applyTheme("prologue");

// ---------------------------------------------------------------------------
// State

let overview: AdminOverview | null = null;
let auditData: AdminAuditResponse | null = null;
let currentView: ViewId = "prezentare";
/** Bumped on every load and on logout; responses from older generations are dropped. */
let generation = 0;
let inflight: AbortController | null = null;
let loggedOut = false;

const fmtDateTime = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtTime = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit" });
const fmtRelativeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
const fmtRelative = new Intl.RelativeTimeFormat("ro", { numeric: "auto" });

function relative(iso: string): string {
  const delta = Date.parse(iso) - Date.now();
  for (const [unit, ms] of fmtRelativeUnits) {
    if (Math.abs(delta) >= ms) return fmtRelative.format(Math.round(delta / ms), unit);
  }
  return fmtRelative.format(Math.round(delta / 60_000), "minute");
}

function when(iso: string | undefined): HTMLElement {
  const time = document.createElement("time");
  if (!iso) {
    time.textContent = "niciodată";
    time.className = "muted";
    return time;
  }
  time.dateTime = iso;
  time.textContent = fmtDateTime.format(new Date(iso));
  time.title = relative(iso);
  return time;
}

// ---------------------------------------------------------------------------
// Feedback

let toastTimer: number | null = null;
function toast(message: string, error = false): void {
  dom.toast.textContent = message;
  dom.toast.classList.toggle("error", error);
  dom.toast.hidden = false;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, error ? 6000 : 3200);
}

function setStatus(text: string, kind: "info" | "error" = "info"): void {
  dom.status.textContent = text;
  dom.status.dataset.kind = kind;
}

function clearSensitiveData(): void {
  overview = null;
  auditData = null;
  dom.users.replaceChildren();
  dom.sessions.replaceChildren();
  dom.audit.replaceChildren();
  dom.recent.replaceChildren();
  dom.identity.textContent = "";
  dom.views.hidden = true;
}

// ---------------------------------------------------------------------------
// API

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Serverul nu răspunde. Verifică rețeaua și încearcă din nou.", 0);
  }
  if (res.status === 401) {
    clearSensitiveData();
    location.replace("/login/?next=%2Fadmin%2F");
    throw new ApiError("Sesiunea a expirat", 401);
  }
  const data = (await res.json().catch(() => ({}))) as Partial<T> & { ok?: boolean; reason?: string };
  if (res.status === 403) throw new ApiError(data.reason ?? "Nu ai acces la această acțiune.", 403);
  if (!res.ok || data.ok === false) throw new ApiError(data.reason ?? `Eroare ${res.status}`, res.status);
  return data as T;
}

async function load(): Promise<void> {
  if (loggedOut) return;
  const gen = ++generation;
  inflight?.abort();
  const controller = new AbortController();
  inflight = controller;
  dom.refresh.disabled = true;
  dom.refresh.setAttribute("aria-busy", "true");
  setStatus(overview ? "Se actualizează…" : "Se încarcă administrarea…");
  try {
    const [next, audit] = await Promise.all([
      api<AdminOverview>("/api/admin/overview", {}, controller.signal),
      api<AdminAuditResponse>("/api/admin/audit?limit=100", {}, controller.signal).catch((err: unknown) => {
        // Audit unavailable is a degraded state, not a page failure.
        if (err instanceof ApiError && (err.status === 503 || err.status === 0)) return null;
        throw err;
      }),
    ]);
    if (gen !== generation || loggedOut) return;
    overview = next;
    auditData = audit;
    dom.denied.hidden = true;
    dom.views.hidden = false;
    render();
    setStatus(`Actualizat la ${fmtTime.format(new Date(next.generatedAt))}.`);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (gen !== generation || loggedOut) return;
    if (err instanceof ApiError && err.status === 403) {
      clearSensitiveData();
      dom.denied.hidden = false;
      setStatus("");
      return;
    }
    if (err instanceof ApiError && err.status === 401) return;
    const message = err instanceof Error ? err.message : "Eroare necunoscută";
    setStatus(overview ? `Datele afișate pot fi vechi: ${message}` : message, "error");
  } finally {
    if (gen === generation) {
      dom.refresh.disabled = false;
      dom.refresh.removeAttribute("aria-busy");
    }
  }
}

// ---------------------------------------------------------------------------
// Routing

function viewFromHash(): ViewId {
  const key = location.hash.replace(/^#\/?/, "").split("?")[0];
  return (Object.keys(VIEWS) as ViewId[]).includes(key as ViewId) ? (key as ViewId) : "prezentare";
}

function route(): void {
  currentView = viewFromHash();
  const meta = VIEWS[currentView];
  dom.viewTitle.textContent = meta.title;
  dom.viewEyebrow.textContent = meta.eyebrow;
  document.title = `EXODUS-7 · Administrare · ${meta.title}`;
  dom.cta.hidden = !(meta.cta && overview);
  dom.nav.querySelectorAll<HTMLAnchorElement>("a[data-view]").forEach((a) => {
    if (a.dataset.view === currentView) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.querySelectorAll<HTMLElement>(".view").forEach((section) => {
    section.hidden = section.id !== `view-${currentView}`;
  });
}

// ---------------------------------------------------------------------------
// Rendering

function roleBadge(role: UserRole): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "status-badge neutral";
  badge.textContent = ROLE_LABELS[role];
  return badge;
}

function stateBadge(disabled: boolean): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `status-badge ${disabled ? "warning" : "success"}`;
  badge.innerHTML = `${icon(disabled ? "pause" : "check")}<span>${disabled ? "Dezactivat" : "Activ"}</span>`;
  return badge;
}

function cell(content: string | Node): HTMLTableCellElement {
  const td = document.createElement("td");
  if (typeof content === "string") td.textContent = content;
  else td.append(content);
  return td;
}

function menuButton(label: string, onClick: () => void, opts: { danger?: boolean; disabled?: boolean; title?: string } = {}): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  if (opts.danger) b.className = "danger";
  if (opts.disabled) b.disabled = true;
  if (opts.title) b.title = opts.title;
  b.addEventListener("click", (e) => {
    (e.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
    onClick();
  });
  return b;
}

function rowMenu(items: HTMLElement[], label = "Acțiuni"): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "row-menu";
  const summary = document.createElement("summary");
  summary.textContent = label;
  const menu = document.createElement("menu");
  menu.append(...items);
  details.append(summary, menu);
  return details;
}

function renderUsers(): void {
  if (!overview) return;
  const me = overview.currentUser;
  const active = overview.users.filter((u) => !u.disabled).length;
  dom.usersSummary.textContent = `${overview.users.length} ${overview.users.length === 1 ? "cont" : "conturi"}, ${active} ${active === 1 ? "activ" : "active"}. Trebuie să rămână mereu cel puțin un administrator activ.`;
  dom.users.replaceChildren();
  const empty = overview.users.length === 0;
  dom.usersTable.hidden = empty;
  dom.usersEmpty.hidden = !empty;
  const activeAdmins = overview.users.filter((u) => u.role === "admin" && !u.disabled).length;
  for (const user of overview.users) {
    const tr = document.createElement("tr");
    if (user.disabled) tr.classList.add("is-disabled");
    if (user.id === me.id) tr.classList.add("is-me");
    const isLastAdmin = user.role === "admin" && !user.disabled && activeAdmins <= 1;
    const isSelf = user.id === me.id;
    const openSessions = overview.sessions.filter((s) => s.userId === user.id).length;
    const hr = document.createElement("hr");
    const items: HTMLElement[] = [
      menuButton("Schimbă numele sau rolul", () => openUserDialog("edit", user)),
      menuButton("Resetează PIN-ul", () => openPinDialog(user)),
      menuButton(
        user.disabled ? "Reactivează contul" : "Dezactivează contul",
        () => void toggleDisabled(user),
        isSelf ? { disabled: true, title: "Nu îți poți dezactiva propriul cont" } : isLastAdmin && !user.disabled ? { disabled: true, title: "Este singurul administrator activ" } : {},
      ),
      menuButton(
        openSessions ? `Închide ${openSessions} ${openSessions === 1 ? "sesiune" : "sesiuni"}` : "Închide sesiunile",
        () => void revokeUserSessions(user),
        { disabled: openSessions === 0 || (isSelf && openSessions === 1), title: isSelf ? "Sesiunea ta curentă rămâne deschisă" : undefined },
      ),
      hr,
      menuButton("Șterge contul", () => void deleteUser(user), {
        danger: true,
        disabled: isSelf || isLastAdmin,
        title: isSelf ? "Nu te poți șterge pe tine" : isLastAdmin ? "Este singurul administrator activ" : undefined,
      }),
    ];
    tr.append(cell(user.name), cell(roleBadge(user.role)), cell(stateBadge(user.disabled)), cell(when(user.lastLoginAt)), cell(rowMenu(items)));
    dom.users.append(tr);
  }
}

function renderSessions(): void {
  if (!overview) return;
  dom.sessions.replaceChildren();
  const empty = overview.sessions.length === 0;
  dom.sessionsTable.hidden = empty;
  dom.sessionsEmpty.hidden = !empty;
  for (const session of overview.sessions) {
    const tr = document.createElement("tr");
    if (session.current) tr.classList.add("is-me");
    const expires = when(session.expiresAt);
    expires.textContent = `${fmtDateTime.format(new Date(session.expiresAt))} · ${relative(session.expiresAt)}`;
    let actions: HTMLElement;
    if (session.current) {
      actions = document.createElement("span");
      actions.className = "status-badge neutral";
      actions.textContent = "Sesiunea ta";
    } else {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Închide sesiunea";
      b.addEventListener("click", () => void revokeSession(session));
      actions = b;
    }
    tr.append(cell(session.name), cell(roleBadge(session.role)), cell(when(session.createdAt)), cell(expires), cell(actions));
    dom.sessions.append(tr);
  }
}

function describeTarget(entry: AuditEntry): string {
  if (!entry.target) return "—";
  if (entry.target.kind === "session") return entry.target.name ? `sesiunea lui ${entry.target.name}` : "o sesiune";
  return entry.target.name || "cont fără nume";
}

function renderAudit(): void {
  dom.audit.replaceChildren();
  if (!auditData) {
    dom.auditTable.hidden = true;
    dom.auditEmpty.hidden = true;
    dom.auditSummary.textContent = "Jurnalul nu este disponibil acum. Modificările se aplică, dar nu pot fi consultate aici până revine.";
    return;
  }
  const empty = auditData.entries.length === 0;
  dom.auditTable.hidden = empty;
  dom.auditEmpty.hidden = !empty;
  dom.auditSummary.textContent = empty
    ? "Cine a schimbat ce, când și cu ce rezultat. Fără PIN-uri sau tokenuri."
    : `Ultimele ${auditData.entries.length} din ${auditData.total} ${auditData.total === 1 ? "înregistrare" : "înregistrări"}. Fără PIN-uri sau tokenuri.`;
  for (const entry of auditData.entries) {
    const tr = document.createElement("tr");
    const result = document.createElement("span");
    result.className = `status-badge ${entry.ok ? "success" : "error"}`;
    result.textContent = entry.ok ? (entry.detail ?? "Reușit") : `Respins: ${entry.detail ?? "motiv necunoscut"}`;
    tr.append(cell(when(entry.t)), cell(entry.actor ? `${entry.actor.name} (${ROLE_LABELS[entry.actor.role]})` : "—"), cell(ACTION_LABELS[entry.action] ?? entry.action), cell(describeTarget(entry)), cell(result));
    dom.audit.append(tr);
  }
}

function renderOverview(): void {
  if (!overview) return;
  const disabled = overview.users.filter((u) => u.disabled).length;
  dom.factUsers.textContent = String(overview.users.length);
  dom.factUsersNote.textContent = disabled ? `${disabled} ${disabled === 1 ? "dezactivat" : "dezactivate"}` : "toate active";
  dom.factSessions.textContent = String(overview.sessions.length);
  const others = overview.sessions.filter((s) => !s.current).length;
  dom.factSessionsNote.textContent = others ? `${others} în afară de a ta` : "doar sesiunea ta";
  dom.factMe.textContent = overview.currentUser.name;
  dom.factMeNote.textContent = ROLE_LABELS[overview.currentUser.role];
  dom.factAudit.textContent = overview.audit.available ? String(overview.audit.entries) : "—";
  dom.factAuditNote.textContent = overview.audit.available ? `${overview.audit.entries === 1 ? "înregistrare" : "înregistrări"} păstrate` : "indisponibil acum";
  dom.recent.replaceChildren();
  const recent = auditData?.entries.slice(0, 5) ?? [];
  dom.recentEmpty.hidden = recent.length > 0;
  for (const entry of recent) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = `${entry.actor?.name ?? "—"} · ${ACTION_LABELS[entry.action] ?? entry.action} · ${describeTarget(entry)}${entry.ok ? "" : " · respins"}`;
    li.append(when(entry.t), text);
    dom.recent.append(li);
  }
}

function render(): void {
  if (!overview) return;
  dom.identity.textContent = `${overview.currentUser.name} · ${ROLE_LABELS[overview.currentUser.role]}`;
  renderOverview();
  renderUsers();
  renderSessions();
  renderAudit();
  route();
}

// ---------------------------------------------------------------------------
// Dialog helpers

let opener: HTMLElement | null = null;

function openDialog(dialog: HTMLDialogElement, focus: HTMLElement): void {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.showModal();
  focus.focus();
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) dialog.close();
  opener?.focus();
  opener = null;
}

function showFormError(el: HTMLParagraphElement, message: string | null): void {
  el.hidden = !message;
  el.textContent = message ?? "";
}

function setBusy(button: HTMLButtonElement, busy: boolean, busyLabel: string): void {
  if (busy) {
    button.dataset.label = button.textContent ?? "";
    button.textContent = busyLabel;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.label ?? button.textContent;
    button.removeAttribute("aria-busy");
  }
  button.disabled = busy;
}

for (const dialog of [dom.dlgUser, dom.dlgPin, dom.dlgConfirm]) {
  dialog.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((b) => b.addEventListener("click", () => closeDialog(dialog)));
  dialog.addEventListener("cancel", (e) => {
    // Escape is blocked while a request is in flight so the outcome is not lost.
    if (dialog.querySelector('[aria-busy="true"]')) e.preventDefault();
  });
  dialog.addEventListener("close", () => {
    // PINs never linger in the DOM after the dialog closes.
    dom.fPin.value = "";
    dom.pPin.value = "";
  });
}

dom.fRole.addEventListener("change", () => {
  dom.fRoleHelp.textContent = ROLE_HELP[dom.fRole.value as UserRole] ?? "";
});

// ---------------------------------------------------------------------------
// Users: create / edit

let editing: AdminUser | null = null;

function openUserDialog(mode: "create" | "edit", user?: AdminUser): void {
  editing = mode === "edit" && user ? user : null;
  dom.formUser.reset();
  showFormError(dom.formUserError, null);
  dom.dlgUserTitle.textContent = editing ? `Modifică contul ${editing.name}` : "Adaugă utilizator";
  dom.dlgUserIntro.textContent = editing
    ? "Schimbările de rol se aplică imediat: consola acelui cont se reconectează cu noile drepturi."
    : "Contul primește un PIN unic, cu care se autentifică pe consolă.";
  dom.fPinField.hidden = !!editing;
  dom.fPin.required = !editing;
  dom.fStateField.hidden = !editing;
  dom.fName.value = editing?.name ?? "";
  dom.fRole.value = editing?.role ?? "operator";
  dom.fDisabled.checked = !!editing?.disabled;
  const isSelf = !!editing && overview?.currentUser.id === editing.id;
  dom.fRole.disabled = isSelf;
  dom.fDisabled.disabled = isSelf;
  dom.fRoleHelp.textContent = isSelf ? "Propriul rol de administrator nu se poate schimba de aici." : ROLE_HELP[dom.fRole.value as UserRole];
  dom.formUserSubmit.textContent = editing ? "Salvează modificările" : "Creează contul";
  openDialog(dom.dlgUser, dom.fName);
}

dom.formUser.addEventListener("submit", async (e) => {
  e.preventDefault();
  showFormError(dom.formUserError, null);
  const name = dom.fName.value.trim();
  const role = dom.fRole.value as UserRole;
  if (!name) {
    showFormError(dom.formUserError, "Scrie un nume pentru cont.");
    dom.fName.focus();
    return;
  }
  if (!editing && !/^\d{4,8}$/.test(dom.fPin.value)) {
    showFormError(dom.formUserError, "PIN-ul trebuie să aibă între 4 și 8 cifre.");
    dom.fPin.focus();
    return;
  }
  setBusy(dom.formUserSubmit, true, "Se salvează…");
  try {
    let audited = true;
    if (editing) {
      const patch: { name?: string; role?: UserRole; disabled?: boolean } = {};
      if (name !== editing.name) patch.name = name;
      if (!dom.fRole.disabled && role !== editing.role) patch.role = role;
      if (!dom.fDisabled.disabled && dom.fDisabled.checked !== editing.disabled) patch.disabled = dom.fDisabled.checked;
      if (Object.keys(patch).length === 0) {
        closeDialog(dom.dlgUser);
        return;
      }
      const res = await api<{ audited?: boolean }>(`/api/users/${encodeURIComponent(editing.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      audited = res.audited !== false;
      toast(`Contul ${name} a fost actualizat.`);
    } else {
      const res = await api<{ audited?: boolean }>("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role, pin: dom.fPin.value }) });
      audited = res.audited !== false;
      toast(`Contul ${name} a fost creat.`);
    }
    dom.fPin.value = "";
    closeDialog(dom.dlgUser);
    if (!audited) toast("Modificarea s-a aplicat, dar nu a putut fi scrisă în jurnalul de audit.", true);
    await load();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    showFormError(dom.formUserError, err instanceof Error ? err.message : "Salvarea nu a reușit.");
  } finally {
    setBusy(dom.formUserSubmit, false, "");
  }
});

// ---------------------------------------------------------------------------
// Users: PIN

let pinTarget: AdminUser | null = null;

function openPinDialog(user: AdminUser): void {
  pinTarget = user;
  dom.formPin.reset();
  showFormError(dom.formPinError, null);
  dom.dlgPinIntro.textContent = `PIN nou pentru ${user.name}. Alege unul pe care nu îl mai folosește alt cont.`;
  openDialog(dom.dlgPin, dom.pPin);
}

dom.formPin.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pinTarget) return;
  showFormError(dom.formPinError, null);
  if (!/^\d{4,8}$/.test(dom.pPin.value)) {
    showFormError(dom.formPinError, "PIN-ul trebuie să aibă între 4 și 8 cifre.");
    dom.pPin.focus();
    return;
  }
  setBusy(dom.formPinSubmit, true, "Se schimbă…");
  const target = pinTarget;
  try {
    const res = await api<{ audited?: boolean }>(`/api/users/${encodeURIComponent(target.id)}/pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: dom.pPin.value }) });
    dom.pPin.value = "";
    closeDialog(dom.dlgPin);
    toast(`PIN-ul lui ${target.name} a fost schimbat; sesiunile contului au fost închise.`);
    if (res.audited === false) toast("Modificarea s-a aplicat, dar nu a putut fi scrisă în jurnalul de audit.", true);
    await load();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    showFormError(dom.formPinError, err instanceof Error ? err.message : "Schimbarea nu a reușit.");
  } finally {
    setBusy(dom.formPinSubmit, false, "");
  }
});

// ---------------------------------------------------------------------------
// Confirmations (disable, delete, revoke)

interface ConfirmOptions {
  title: string;
  text: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Runs while the dialog stays open; a thrown error is shown inside the dialog. */
  action: () => Promise<void>;
}

function confirmAction(opts: ConfirmOptions): void {
  dom.dlgConfirmTitle.textContent = opts.title;
  dom.dlgConfirmText.textContent = opts.text;
  dom.formConfirmSubmit.textContent = opts.confirmLabel;
  dom.formConfirmSubmit.className = opts.destructive ? "button-destructive" : "button-primary";
  showFormError(dom.formConfirmError, null);
  const handler = async (e: Event): Promise<void> => {
    e.preventDefault();
    setBusy(dom.formConfirmSubmit, true, "Se aplică…");
    try {
      await opts.action();
      dom.formConfirm.removeEventListener("submit", handler);
      closeDialog(dom.dlgConfirm);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      showFormError(dom.formConfirmError, err instanceof Error ? err.message : "Acțiunea nu a reușit.");
    } finally {
      setBusy(dom.formConfirmSubmit, false, "");
    }
  };
  dom.formConfirm.addEventListener("submit", handler);
  dom.dlgConfirm.addEventListener("close", () => dom.formConfirm.removeEventListener("submit", handler), { once: true });
  openDialog(dom.dlgConfirm, dom.formConfirmSubmit);
}

function reportAudit(res: { audited?: boolean }): void {
  if (res.audited === false) toast("Modificarea s-a aplicat, dar nu a putut fi scrisă în jurnalul de audit.", true);
}

async function toggleDisabled(user: AdminUser): Promise<void> {
  const disabling = !user.disabled;
  confirmAction({
    title: disabling ? `Dezactivezi contul ${user.name}?` : `Reactivezi contul ${user.name}?`,
    text: disabling
      ? "Contul nu se va mai putea autentifica, iar consola lui, dacă este deschisă, se închide acum. Poți reactiva contul oricând."
      : "Contul se va putea autentifica din nou cu PIN-ul lui actual.",
    confirmLabel: disabling ? "Dezactivează contul" : "Reactivează contul",
    destructive: disabling,
    action: async () => {
      const res = await api<{ audited?: boolean }>(`/api/users/${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabled: disabling }) });
      toast(disabling ? `Contul ${user.name} a fost dezactivat.` : `Contul ${user.name} a fost reactivat.`);
      reportAudit(res);
    },
  });
}

async function deleteUser(user: AdminUser): Promise<void> {
  confirmAction({
    title: `Ștergi contul ${user.name}?`,
    text: "Contul dispare definitiv, împreună cu sesiunile lui deschise. Istoricul din jurnalul de audit rămâne.",
    confirmLabel: "Șterge contul",
    destructive: true,
    action: async () => {
      const res = await api<{ audited?: boolean }>(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      toast(`Contul ${user.name} a fost șters.`);
      reportAudit(res);
    },
  });
}

async function revokeUserSessions(user: AdminUser): Promise<void> {
  confirmAction({
    title: `Închizi sesiunile lui ${user.name}?`,
    text: "Toate consolele autentificate cu acest cont se deconectează și cer PIN-ul din nou. Sesiunea ta curentă nu este afectată.",
    confirmLabel: "Închide sesiunile",
    action: async () => {
      const res = await api<{ count: number; audited?: boolean }>(`/api/admin/users/${encodeURIComponent(user.id)}/sessions/revoke`, { method: "POST" });
      toast(res.count === 0 ? `${user.name} nu avea sesiuni deschise.` : `${res.count} ${res.count === 1 ? "sesiune închisă" : "sesiuni închise"} pentru ${user.name}.`);
      reportAudit(res);
    },
  });
}

async function revokeSession(session: AdminSession): Promise<void> {
  confirmAction({
    title: `Închizi sesiunea lui ${session.name}?`,
    text: `Consola autentificată cu acest cont (${ROLE_LABELS[session.role]}) se deconectează imediat și cere PIN-ul din nou.`,
    confirmLabel: "Închide sesiunea",
    action: async () => {
      const res = await api<{ audited?: boolean }>(`/api/admin/sessions/${encodeURIComponent(session.id)}/revoke`, { method: "POST" });
      toast(`Sesiunea lui ${session.name} a fost închisă.`);
      reportAudit(res);
    },
  });
}

// ---------------------------------------------------------------------------
// Header actions

dom.refresh.addEventListener("click", () => void load());
dom.cta.addEventListener("click", () => openUserDialog("create"));
dom.logout.addEventListener("click", async () => {
  loggedOut = true;
  generation += 1;
  inflight?.abort();
  clearSensitiveData();
  setStatus("Se închide sesiunea…");
  try {
    const res = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (!res.ok) throw new Error();
    try {
      sessionStorage.removeItem("nava_session");
      sessionStorage.removeItem("nava_user");
    } catch {
      /* storage may be blocked */
    }
    location.replace("/login/");
  } catch {
    loggedOut = false;
    setStatus("Ieșirea nu a fost confirmată de server. Încearcă din nou.", "error");
  }
});

window.addEventListener("hashchange", route);
document.addEventListener("click", (e) => {
  // Close any open row menu when clicking elsewhere.
  const target = e.target as HTMLElement;
  document.querySelectorAll<HTMLDetailsElement>("details.row-menu[open]").forEach((d) => {
    if (!d.contains(target)) d.removeAttribute("open");
  });
});

route();
void load();

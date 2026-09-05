/**
 * PIN login page (/login/). On success the server sets the HttpOnly cookie `nava_session`; we also keep
 * the token in sessionStorage so the console can send it in the WS `hello`. Then redirect to `?next=`
 * (same-origin path only) or /control/.
 */

const form = document.getElementById("form") as HTMLFormElement;
const pinInput = document.getElementById("pin") as HTMLInputElement;
const pad = document.getElementById("pad") as HTMLDivElement;
const dots = document.getElementById("pin-display") as HTMLDivElement;
const msg = document.getElementById("msg") as HTMLParagraphElement;
const who = document.getElementById("who") as HTMLDivElement;

let pin = "";
let busy = false;

function safeNext(): string {
  const next = new URLSearchParams(location.search).get("next") ?? "/control/";
  return /^\/[a-zA-Z0-9_\-/?.=&%]*$/.test(next) && !next.startsWith("//") ? next : "/control/";
}

function renderDots(): void {
  const n = Math.max(4, pin.length);
  dots.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const d = document.createElement("span");
    d.className = "dot" + (i < pin.length ? " on" : "");
    dots.append(d);
  }
  pinInput.value = pin;
}

function setMsg(text: string, ok = false): void {
  msg.textContent = text;
  msg.className = "msg" + (ok ? " ok" : "");
}

async function submit(): Promise<void> {
  if (busy) return;
  if (pin.length < 4) {
    setMsg("PIN-ul are cel puțin 4 cifre.");
    return;
  }
  busy = true;
  setMsg("Verific…", true);
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; token?: string; user?: { name: string; role: string } };
    if (!res.ok || !data.ok) {
      setMsg(data.reason ?? `Eroare ${res.status}`);
      pin = "";
      renderDots();
      return;
    }
    try {
      if (data.token) sessionStorage.setItem("nava_session", data.token);
      if (data.user) sessionStorage.setItem("nava_user", JSON.stringify(data.user));
    } catch {
      /* storage may be blocked */
    }
    setMsg(`Bun venit, ${data.user?.name ?? "operator"}.`, true);
    location.assign(safeNext());
  } catch (err) {
    setMsg(`Serverul nu răspunde (${String(err)})`);
  } finally {
    busy = false;
  }
}

pad.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!btn || btn.type === "submit") return;
  const k = btn.dataset.k ?? "";
  if (k === "del") pin = pin.slice(0, -1);
  else if (/^\d$/.test(k) && pin.length < 8) pin += k;
  renderDots();
  setMsg("");
});

document.addEventListener("keydown", (e) => {
  if (/^\d$/.test(e.key) && pin.length < 8) {
    pin += e.key;
    renderDots();
    setMsg("");
  } else if (e.key === "Backspace") {
    pin = pin.slice(0, -1);
    renderDots();
  } else if (e.key === "Enter") {
    e.preventDefault();
    void submit();
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void submit();
});

// Already logged in? Show who, offer to continue.
void fetch("/api/auth/me", { credentials: "same-origin" })
  .then((r) => (r.ok ? r.json() : null))
  .then((data: { authenticated?: boolean; user?: { name: string; role: string } } | null) => {
    if (data?.authenticated && data.user) {
      who.innerHTML = `Ești autentificat ca <b>${data.user.name}</b> (${data.user.role}). <a href="${safeNext()}">Continuă</a> · <a href="#" id="logout">Ieși</a>`;
      document.getElementById("logout")?.addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        try {
          sessionStorage.removeItem("nava_session");
          sessionStorage.removeItem("nava_user");
        } catch {
          /* ignore */
        }
        who.textContent = "";
        setMsg("Ai ieșit.", true);
      });
    }
  })
  .catch(() => undefined);

renderDots();

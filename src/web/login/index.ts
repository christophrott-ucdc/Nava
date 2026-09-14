import '../shared/client-errors';
import { ROLE_LABELS } from "@shared/ui-labels";
import { icon } from "../shared/glass";
/** Authentication uses the server-owned HttpOnly cookie only. */

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
      body: JSON.stringify({username:(document.getElementById('username') as HTMLInputElement).value,pin,code:(document.getElementById('pin-otp') as HTMLInputElement).value,...(!(document.getElementById('pin-change-field') as HTMLElement).hidden?{newCredential:(document.getElementById('pin-new') as HTMLInputElement).value}:{})}),
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; changeRequired?:boolean;factorRequired?:boolean; user?: { name: string; role: string } };
    if (!res.ok || !data.ok) {
      setMsg(data.reason ?? `Eroare ${res.status}`);
      if(data.changeRequired)document.getElementById("pin-change-field")!.hidden=false;
      if(data.factorRequired)document.getElementById("pin-otp-field")!.hidden=false;
      if(data.changeRequired||data.factorRequired)return;
      pin = "";
      renderDots();
      return;
    }

    setMsg(`Bun venit, ${data.user?.name ?? "operator"}.`, true);
    location.assign(safeNext());
  } catch (err) {
    setMsg(`Serverul nu răspunde (${String(err)})`);
  } finally {
    busy = false;
    pinInput.focus({preventScroll:true});
  }
}

pad.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!btn || busy || btn.type === "submit") return;
  const k = btn.dataset.k ?? "";
  if (k === "del") pin = pin.slice(0, -1);
  else if (/^\d$/.test(k) && pin.length < 8) pin += k;
  renderDots();
  setMsg("");
});

document.addEventListener("keydown", (e) => {
  if ((e.target instanceof HTMLInputElement && e.target!==pinInput) || form.hidden || busy || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Enter") { e.preventDefault(); void submit(); return; }
  if (e.target === pinInput) return;
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

pinInput.addEventListener("input", () => { pin = pinInput.value.replace(/\D/g, "").slice(0, 8); renderDots(); setMsg(""); });

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void submit();
});

// Already logged in? Show who, offer to continue.
void fetch("/api/auth/me", { credentials: "same-origin" })
  .then((r) => (r.ok ? r.json() : null))
  .then((data: { authenticated?: boolean; user?: { name: string; role: string } } | null) => {
    if (data?.authenticated && data.user) {
      const name = document.createElement('strong'); name.textContent = data.user.name;
      const next = document.createElement('a'); next.href = safeNext(); next.textContent = 'Continuă';
      const logout = document.createElement('a'); logout.href = '#'; logout.id = 'logout'; logout.textContent = 'Ieși';
      who.replaceChildren('Ești autentificat ca ', name, ' (' + (ROLE_LABELS[data.user.role] ?? data.user.role) + '). ', next, ' · ', logout);
      document.getElementById("logout")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try { const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); if (!response.ok) throw new Error(); }
        catch { setMsg("Deconectarea nu a fost confirmată. Încearcă din nou."); return; }
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

document.querySelectorAll<HTMLElement>("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon!); });
import {startUiLocalization} from '../shared/localization';
startUiLocalization();

const accountForm=document.getElementById('account-form') as HTMLFormElement;
for(const id of ['login-pin','login-account'])document.getElementById(id)!.addEventListener('click',()=>{const account=id==='login-account';form.hidden=account;accountForm.hidden=!account;document.getElementById('login-pin')!.setAttribute('aria-pressed',String(!account));document.getElementById('login-account')!.setAttribute('aria-pressed',String(account));document.querySelector('.hint')!.textContent=account?'Autentificare cu nume, parolă și MFA, dacă este activ.':'Introdu PIN-ul de operator ca să intri în consolă.';(account?accountForm.querySelector('input')!:pinInput).focus();});
accountForm.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;const button=accountForm.querySelector('button')!,message=document.getElementById('account-msg')!;button.disabled=true;message.textContent='Verific…';try{const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries([...new FormData(accountForm)].filter(([key,value])=>key!=='newCredential'||value!=='')))});const result=await response.json();if(!response.ok){message.textContent=result.reason??'Autentificarea nu a reușit.';if(result.changeRequired){document.getElementById('password-change-field')!.hidden=false;(accountForm.elements.namedItem('newCredential') as HTMLInputElement).focus();}if(result.factorRequired)(accountForm.elements.namedItem('code') as HTMLInputElement).focus();return;}accountForm.reset();location.assign(new URLSearchParams(location.search).has('next')?safeNext():'/admin/');}catch{message.textContent='Serverul nu răspunde. Încearcă din nou.';}finally{busy=false;button.disabled=false;}});

void Promise.all([fetch('/api/auth/setup').then(r=>r.json()),fetch('/api/auth/providers').then(r=>r.json())]).then(([setup,providers])=>{document.getElementById('google-login')!.hidden=!providers.google;if(setup.required){const setupPanel=document.getElementById('setup-form')!;setupPanel.hidden=!setup.local;if(setup.local)document.querySelector('.login-tabs')!.before(setupPanel);document.querySelector('.hint')!.textContent='Administratorul se configurează sau se recuperează pe PC-ul navei. Conturile existente se pot autentifica.';}}).catch(()=>{});
const setupForm=document.getElementById('setup-form') as HTMLFormElement;setupForm.addEventListener('submit',async e=>{e.preventDefault();const button=setupForm.querySelector('button')!;button.disabled=true;try{const r=await fetch('/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(setupForm)))}),data=await r.json();if(!r.ok)throw Error(data.reason??'Configurarea a eșuat.');setupForm.reset();location.reload();}catch(error){document.getElementById('setup-msg')!.textContent=String(error);}finally{button.disabled=false;}});
if(new URLSearchParams(location.search).has('authError'))document.querySelector('.hint')!.textContent='Autentificarea Google nu a fost finalizată. Verifică domeniul @ucdc.ro și configurația OAuth; poți folosi contul local.';

/** Cookie-only requests shared by authenticated operator pages. */
export class SessionError extends Error {
 constructor(public readonly status: 401 | 403) { super(status === 401 ? 'Sesiunea a expirat. Autentifică-te din nou.' : 'Contul tău nu are dreptul de a folosi această acțiune.'); this.name = 'SessionError'; }
}
let redirecting = false;
export async function sessionFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
 const deadline = AbortSignal.timeout(init.method && init.method.toUpperCase() !== "GET" ? 120000 : 30000);
 const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
 const response = await window.fetch(input, { credentials: 'same-origin', cache: 'no-store', ...init, signal });
 if (response.status === 401 || response.status === 403) {
  if (response.status === 401 && !redirecting) { redirecting = true; location.assign('/login/?next=' + encodeURIComponent(location.pathname + location.search)); }
  throw new SessionError(response.status);
 }
 return response;
}
export function latestSessionRead() {
 let generation = 0;
 let controller: AbortController | undefined;
 return {
  begin() { controller?.abort(); controller = new AbortController(); const current = ++generation; return { signal: controller.signal, current: () => current === generation }; },
  cancel() { generation++; controller?.abort(); },
 };
}

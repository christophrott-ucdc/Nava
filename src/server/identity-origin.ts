import type { Context } from 'hono';
/** Honor HTTPS forwarding only from a reverse proxy on the same machine. Preserve Host at that proxy. */
export function secureRequest(c: Context) { const peer = (c.env as {
    incoming?: {
        socket?: {
            remoteAddress?: string;
        };
    };
})?.incoming?.socket?.remoteAddress; return c.req.url.startsWith('https:') || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '') && c.req.header('x-forwarded-proto') === 'https'; }
export function requestOrigin(c: Context) { const url = new URL(c.req.url); if (secureRequest(c))
    url.protocol = 'https:'; return url.origin; }

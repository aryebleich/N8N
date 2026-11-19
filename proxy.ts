import { NextResponse, type NextRequest } from 'next/server';

/**
 * Runs before every request.
 *
 * 1. Localhost guard. There is no login: whoever can open this site is the admin. So unless
 *    ADMIN_PUBLIC=true is set in .env, the admin pages and admin API only answer requests
 *    addressed to localhost / 127.0.0.1 / [::1]. This also blocks "DNS rebinding" tricks.
 *    The n8n endpoints (/api/internal/*, protected by INTERNAL_API_SECRET), the chat widget
 *    endpoints (/api/public/*) and /api/health are always reachable.
 * 2. A strict, nonce-based Content Security Policy on every page.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const ALWAYS_OPEN = ['/api/internal/', '/api/public/', '/api/health'];

export function hostIsLocal(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return LOCAL_HOSTS.has(name) || name.endsWith('.localhost');
}

const blockedPage = (host: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin panel is private</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:10vh auto;padding:0 16px;color:#1f2328}code{background:#f3f4f6;padding:2px 6px;border-radius:4px}h1{font-size:24px}</style></head>
<body><h1>This admin panel only opens on this computer</h1>
<p>There is no login, so the panel answers only at <code>http://localhost:3000</code>. You opened it as <code>${host.replace(/[<>&"]/g, '')}</code>.</p>
<p>To open it from other computers, first put it behind a login of your own (for example your hosting provider's password protection or a VPN), then set <code>ADMIN_PUBLIC=true</code> in the <code>.env</code> file and restart. Read the security section of the README first.</p></body></html>`;

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (ALWAYS_OPEN.some((p) => path.startsWith(p))) return NextResponse.next();

  const host = request.headers.get('host');
  if (process.env.ADMIN_PUBLIC !== 'true' && !hostIsLocal(host)) {
    return path.startsWith('/api/')
      ? NextResponse.json({ error: 'The admin panel only answers on localhost. Set ADMIN_PUBLIC=true in .env to change this.' }, { status: 403 })
      : new NextResponse(blockedPage(host || 'an unknown address'), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (path.startsWith('/api/')) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }],
    },
  ],
};

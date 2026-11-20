/**
 * Cleans up a database address pasted by hand: trims spaces and line breaks, removes
 * surrounding quotes, and adds libsql:// when only the host name was pasted
 * (e.g. "support-bot-yourorg.turso.io").
 */
export function normalizeDbUrl(raw: string | undefined | null, fallback = 'file:./data/support.db'): string {
  let url = String(raw ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  if (!url) return fallback;
  if (url.startsWith('TURSO_DATABASE_URL=')) url = url.slice('TURSO_DATABASE_URL='.length).trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = `libsql://${url}`;
  return url.replace(/\/+$/, '');
}

/** "libsql://… (host ending .turso.io)" — safe to print in logs, no full address. */
export function describeDbUrl(url: string): string {
  const scheme = url.split(':')[0];
  if (scheme === 'file') return 'a local file';
  try {
    const host = new URL(url).hostname;
    return `${scheme}:// (host ending "${host.slice(-12)}")`;
  } catch {
    return `${scheme}: (not a valid address)`;
  }
}

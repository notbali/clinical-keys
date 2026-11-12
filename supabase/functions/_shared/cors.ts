// CORS helpers for Edge Functions. Plain TypeScript with no Deno-only APIs, so the unit tests can import it.

/** Trims spaces, lowercases the scheme and host, and removes trailing slashes. "https://X.app/" becomes "https://x.app". */
const normalizeOrigin = (o: string): string => o.trim().replace(/\/+$/, '').toLowerCase();

/**
 * Reads the ALLOWED_ORIGIN setting: one site or several separated by commas or spaces. Blank or unset means any site ("*").
 * Trailing slashes are removed because a browser's Origin header never has one, so a stray slash would block everyone.
 */
export function parseAllowedOrigins(value: string | undefined): string[] {
  const list = (value ?? '').split(/[\s,]+/).map(normalizeOrigin).filter(Boolean);
  return list.length ? list : ['*'];
}

/** Headers for one response. A site that is not on the list gets no allow-origin header, so the browser refuses to use the reply. */
export function corsHeaders(requestOrigin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (allowed.includes('*')) headers['Access-Control-Allow-Origin'] = '*';
  else if (requestOrigin && allowed.includes(normalizeOrigin(requestOrigin))) headers['Access-Control-Allow-Origin'] = normalizeOrigin(requestOrigin);
  return headers;
}

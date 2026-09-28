/**
 * CycleGuard Backend — Origin validation
 *
 * One strict check shared by CORS (HTTP) and the WebSocket upgrade.
 *
 * Rules:
 *  1. No Origin header  -> allow (curl, native clients; not a browser CSRF vector).
 *  2. Same-origin       -> allow. The browser's Origin host equals the Host the
 *                          request was sent to. This is what makes the bundled
 *                          frontend work on Render without any CORS_ORIGINS entry.
 *  3. Explicit allowlist-> allow only on EXACT scheme + host + port match.
 *                          (The old `endsWith()` check let "evil-example.com"
 *                          pass for an allowlisted "example.com".)
 */

function normalize(origin) {
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * @param {string|undefined} origin      value of the Origin header
 * @param {string|undefined} hostHeader  value of the Host header (or X-Forwarded-Host)
 * @param {string[]} allowedOrigins      exact origins, e.g. ["https://app.example.com"]
 */
function isOriginAllowed(origin, hostHeader, allowedOrigins = []) {
  if (!origin) return true;

  const normalized = normalize(origin);
  if (!normalized) return false;

  // Same-origin: compare host[:port] only, so http/https proxy hops don't matter.
  if (hostHeader) {
    const originHost = new URL(normalized).host;
    if (originHost === String(hostHeader).toLowerCase()) return true;
  }

  return allowedOrigins.map(normalize).filter(Boolean).includes(normalized);
}

module.exports = { isOriginAllowed };

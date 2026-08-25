const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key|mongo_uri|database_url)/i;
const SENSITIVE_QUERY_KEY = /^(password|secret|token|access_token|refresh_token|api[-_]?key|key|authorization)$/i;

function sanitizeUrl(value) {
  if (typeof value !== 'string') return value;

  const [pathname, query = ''] = value.split('?', 2);
  if (!query) return value;

  const params = new URLSearchParams(query);
  let changed = false;
  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) {
      params.set(key, '[REDACTED]');
      changed = true;
    }
  }
  return changed ? `${pathname}?${params.toString()}` : value;
}

function sanitizeLogValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogValue(item, seen));
  }

  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      clean[key] = '[REDACTED]';
    } else if (/^(url|originalUrl|referer|referrer)$/i.test(key)) {
      clean[key] = sanitizeUrl(child);
    } else {
      clean[key] = sanitizeLogValue(child, seen);
    }
  }
  return clean;
}

module.exports = { sanitizeLogValue, sanitizeUrl };

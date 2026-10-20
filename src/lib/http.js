// fetch helpers: JSON with timeout, retry with backoff on 429/5xx, and a small concurrency limiter.

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Global back-off shared by every request to the same host: when any request gets a 429, all
// requests to that host pause until the retry-after window has passed.
const hostPause = new Map();
export const rateStats = { hits429: 0 };

export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 20000, retries = 3, onRateLimit } = {}) {
  let attempt = 0;
  let lastErr;
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  while (attempt <= retries) {
    const until = hostPause.get(host) || 0;
    if (until > Date.now()) await sleep(until - Date.now());
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { accept: 'application/json', ...headers },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        const wait = ra ? Math.min(30000, ra * 1000) : Math.min(10000, 800 * 2 ** attempt + Math.random() * 400);
        lastErr = new HttpError(res.status, url, await safeText(res));
        if (res.status === 429) {
          rateStats.hits429++;
          hostPause.set(host, Date.now() + wait);
          onRateLimit?.(wait);
        }
        attempt++;
        if (attempt > retries) throw lastErr;
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, url, await safeText(res));
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new HttpError(res.status, url, text.slice(0, 200));
      }
    } catch (e) {
      clearTimeout(t);
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
      attempt++;
      if (attempt > retries) throw lastErr;
      await sleep(Math.min(8000, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}

/** Run async tasks with at most `limit` in flight. Returns results in order; errors become {error}. */
export async function pMap(items, fn, limit = 6) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        out[i] = { error: e?.message || String(e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

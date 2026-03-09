const cache = new Map();
const inflight = new Map();

export async function fetchData(url, options = {}) {
  const { timeout = 10000, retries = 1, retryDelay = 2000 } = options;

  // Deduplicate concurrent requests
  if (inflight.has(url)) {
    return inflight.get(url);
  }

  const promise = _fetchWithRetry(url, timeout, retries, retryDelay);
  inflight.set(url, promise);

  try {
    const result = await promise;
    return result;
  } finally {
    inflight.delete(url);
  }
}

async function _fetchWithRetry(url, timeout, retries, retryDelay) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        // On 429, wait 90s then retry once — don't burn through rate limits with fast retries
        if (response.status === 429) {
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, 90000));
            continue;
          }
          if (cache.has(url)) {
            return { data: cache.get(url), stale: true };
          }
          return { data: null, error: true, message: 'Rate limited' };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      cache.set(url, data);
      return { data, stale: false };
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, retryDelay));
        continue;
      }

      // All retries exhausted
      if (cache.has(url)) {
        return { data: cache.get(url), stale: true };
      }
      return { data: null, error: true, message: 'Failed to load' };
    }
  }
}

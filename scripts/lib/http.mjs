// HTTP helpers shared by the seeding scripts: fetch with per-request timeout,
// retry + exponential backoff with jitter on transient failures, a polite
// inter-request delay, and a consistent User-Agent.

import {USER_AGENT} from "../config.mjs";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry network errors / timeouts and these transient HTTP statuses. Any other
// non-2xx status is treated as a hard failure and propagates immediately.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFAULTS = {
  retries: 4,
  baseDelayMs: 500,
  timeoutMs: 15000,
  delayMs: 200,
  method: "GET",
  headers: {},
};

async function attemptFetch(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    return await fetch(url, {
      method: opts.method,
      headers: {"User-Agent": USER_AGENT, ...opts.headers},
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, options = {}) {
  const opts = {...DEFAULTS, ...options};
  let lastErr;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      const res = await attemptFetch(url, opts);
      if (res.ok) {
        if (opts.delayMs) await sleep(opts.delayMs); // be polite between requests
        return res;
      }
      // Non-retryable status or no retries left: throw, carrying .status.
      if (!RETRYABLE_STATUS.has(res.status) || attempt === opts.retries) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      // A hard HTTP failure carries .status and must propagate, not retry.
      if (err.status !== undefined) throw err;
      lastErr = err; // network error / timeout / abort -> retry
      if (attempt === opts.retries) break;
    }
    const backoff = opts.baseDelayMs * 2 ** attempt + Math.floor(Math.random() * opts.baseDelayMs);
    await sleep(backoff);
  }
  throw new Error(`fetch failed after ${opts.retries + 1} attempts: ${url} (${lastErr?.message ?? lastErr})`);
}

export async function fetchJson(url, options) {
  const res = await fetchWithRetry(url, options);
  return res.json();
}

export async function fetchBuffer(url, options) {
  const res = await fetchWithRetry(url, options);
  return Buffer.from(await res.arrayBuffer());
}

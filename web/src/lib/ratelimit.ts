/**
 * Dead-simple in-memory rate limiter. Fine for a single-process dev/FYP
 * deployment; swap for Redis (or Upstash) if this ever runs multi-instance.
 */

const hits = new Map<string, number[]>();

/**
 * Returns true if the action is allowed. Records the hit when allowed.
 * `key` should scope the limit, e.g. `otp:alice@example.com`.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// Opportunistic cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, times] of hits) {
    const kept = times.filter((t) => t > cutoff);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
  }
}, 15 * 60 * 1000).unref?.();

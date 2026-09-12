/** Best-effort client IP from proxy headers (for rate limiting / Turnstile). */
export function clientIp(request: Request): string | undefined {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? undefined;
}

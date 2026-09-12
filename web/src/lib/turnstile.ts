import "server-only";

// Cloudflare's documented test keys — these always pass, so the widget works in
// dev with no setup. Replace with your real keys in production.
const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Public site key for the widget. Falls back to Cloudflare's test key. */
export function turnstileSiteKey(): string {
  return process.env.TURNSTILE_SITE_KEY || TEST_SITE_KEY;
}

/** True when a real secret is configured (i.e. verification will be enforced). */
export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Server-side check of a Turnstile token. When no real secret is configured and
 * we're not in production, skip the network call so local dev works offline.
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return true; // dev, unconfigured — let it through
  }

  const body = new URLSearchParams({ secret: secret || TEST_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

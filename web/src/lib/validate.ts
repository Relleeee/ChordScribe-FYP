/** Tiny input helpers for the auth forms — no schema library needed. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Credentials {
  email: string;
  password: string;
  name?: string;
}

export const MIN_PASSWORD = 8;

export function parseCredentials(
  body: unknown,
  { requireName }: { requireName: boolean },
): { data: Credentials } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Invalid request body" };
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address" };
  if (!password) return { error: "Enter your password" };
  // Length rule only applies when setting a password (registration).
  if (requireName && password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters` };
  }
  if (requireName && name.length < 2) return { error: "Enter your name" };

  return { data: { email, password, name: requireName ? name : undefined } };
}

import "server-only";

import { Facebook, Google } from "arctic";

const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? "http://localhost:3000";

export type Provider = "google" | "facebook";
export const PROVIDERS: Provider[] = ["google", "facebook"];

export function isProviderConfigured(p: Provider): boolean {
  return p === "google"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
}

export function configuredProviders(): Provider[] {
  return PROVIDERS.filter(isProviderConfigured);
}

export function googleClient(): Google {
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${redirectBase}/api/auth/oauth/google/callback`,
  );
}

export function facebookClient(): Facebook {
  return new Facebook(
    process.env.FACEBOOK_CLIENT_ID!,
    process.env.FACEBOOK_CLIENT_SECRET!,
    `${redirectBase}/api/auth/oauth/facebook/callback`,
  );
}

export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  name: string;
  image: string | null;
}

export async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Could not load Google profile");
  const p = (await res.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    providerAccountId: p.sub,
    email: p.email_verified && p.email ? p.email.toLowerCase() : null,
    name: p.name || p.email?.split("@")[0] || "Google user",
    image: p.picture ?? null,
  };
}

export async function fetchFacebookProfile(accessToken: string): Promise<OAuthProfile> {
  const url = new URL("https://graph.facebook.com/me");
  url.searchParams.set("fields", "id,name,email,picture.type(large)");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load Facebook profile");
  const p = (await res.json()) as {
    id: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };
  return {
    providerAccountId: p.id,
    email: p.email ? p.email.toLowerCase() : null,
    name: p.name || "Facebook user",
    image: p.picture?.data?.url ?? null,
  };
}

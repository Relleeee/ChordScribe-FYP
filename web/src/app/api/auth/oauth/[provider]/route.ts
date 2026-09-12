import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { generateCodeVerifier, generateState } from "arctic";
import { facebookClient, googleClient, isProviderConfigured } from "@/lib/oauth";

const OAUTH_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 10,
  sameSite: "lax",
} as const;

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/auth/oauth/[provider]">,
): Promise<Response> {
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "facebook") {
    return new Response("Unknown provider", { status: 404 });
  }
  if (!isProviderConfigured(provider)) {
    return Response.redirect(new URL("/login?error=oauth_unconfigured", _req.url));
  }

  const state = generateState();
  const store = await cookies();
  store.set(`oauth_state_${provider}`, state, OAUTH_COOKIE);

  let authUrl: URL;
  if (provider === "google") {
    const codeVerifier = generateCodeVerifier();
    store.set("oauth_verifier_google", codeVerifier, OAUTH_COOKIE);
    authUrl = googleClient().createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
  } else {
    authUrl = facebookClient().createAuthorizationURL(state, ["email", "public_profile"]);
  }

  return Response.redirect(authUrl);
}

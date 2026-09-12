import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/auth";
import { upsertOAuthUser } from "@/lib/account";
import {
  facebookClient,
  fetchFacebookProfile,
  fetchGoogleProfile,
  googleClient,
  isProviderConfigured,
  type OAuthProfile,
} from "@/lib/oauth";

function backToLogin(req: NextRequest, error: string): Response {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", error);
  return Response.redirect(url);
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/auth/oauth/[provider]/callback">,
): Promise<Response> {
  const { provider } = await ctx.params;
  if ((provider !== "google" && provider !== "facebook") || !isProviderConfigured(provider)) {
    return backToLogin(req, "oauth_failed");
  }

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  const store = await cookies();
  const storedState = store.get(`oauth_state_${provider}`)?.value;
  store.delete(`oauth_state_${provider}`);

  if (params.get("error") === "access_denied") return backToLogin(req, "oauth_cancelled");
  if (!code || !state || !storedState || state !== storedState) {
    return backToLogin(req, "oauth_failed");
  }

  try {
    let profile: OAuthProfile;
    if (provider === "google") {
      const verifier = store.get("oauth_verifier_google")?.value;
      store.delete("oauth_verifier_google");
      if (!verifier) return backToLogin(req, "oauth_failed");
      const tokens = await googleClient().validateAuthorizationCode(code, verifier);
      profile = await fetchGoogleProfile(tokens.accessToken());
    } else {
      const tokens = await facebookClient().validateAuthorizationCode(code);
      profile = await fetchFacebookProfile(tokens.accessToken());
    }

    const result = await upsertOAuthUser(provider, profile);
    if ("error" in result) return backToLogin(req, encodeURIComponent(result.error));

    await createSession(result.userId);
    return Response.redirect(new URL("/", req.url));
  } catch (err) {
    console.error("[oauth callback]", err);
    return backToLogin(req, "oauth_failed");
  }
}

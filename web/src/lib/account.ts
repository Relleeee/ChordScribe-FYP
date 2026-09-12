import "server-only";

import { prisma } from "./db";
import type { OAuthProfile, Provider } from "./oauth";

const providerLabel = (p: Provider) => (p === "google" ? "Google" : "Facebook");

/**
 * Resolve a user for a verified OAuth identity, creating or linking as needed.
 * - known (provider, id) → that user
 * - same email as an existing account → link the OAuth identity to it
 * - otherwise → create a new account (needs an email from the provider)
 */
export async function upsertOAuthUser(
  provider: Provider,
  profile: OAuthProfile,
): Promise<{ userId: string } | { error: string }> {
  const existingLink = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId },
    },
    select: { userId: true },
  });
  if (existingLink) return { userId: existingLink.userId };

  if (profile.email) {
    const byEmail = await prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true },
    });
    if (byEmail) {
      await prisma.oAuthAccount.create({
        data: { provider, providerAccountId: profile.providerAccountId, userId: byEmail.id },
      });
      return { userId: byEmail.id };
    }
  }

  if (!profile.email) {
    return {
      error: `${providerLabel(provider)} didn't share a verified email. Sign up with email instead.`,
    };
  }

  const user = await prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      image: profile.image,
      emailVerified: new Date(),
      // Continuing through the provider's consent screen counts as accepting
      // our terms (the button copy says so).
      termsAgreedAt: new Date(),
      oauthAccounts: { create: { provider, providerAccountId: profile.providerAccountId } },
    },
    select: { id: true },
  });
  return { userId: user.id };
}

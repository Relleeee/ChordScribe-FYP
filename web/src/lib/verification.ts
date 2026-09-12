import "server-only";

import { prisma } from "./db";
import { hashesEqual, sha256, sixDigitCode, urlToken } from "./rand";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const OTP = "email-otp";
const RESET = "password-reset";

async function issue(identifier: string, purpose: string, raw: string, ttlMs: number): Promise<void> {
  await prisma.verificationCode.deleteMany({ where: { identifier, purpose } });
  await prisma.verificationCode.create({
    data: {
      identifier,
      purpose,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
}

/** Create + store a 6-digit login code, returning the raw code to email. */
export async function issueOtp(email: string): Promise<string> {
  const code = sixDigitCode();
  await issue(email, OTP, code, OTP_TTL_MS);
  return code;
}

/** Create + store a password-reset token, returning the raw token for the link. */
export async function issueResetToken(email: string): Promise<string> {
  const token = urlToken();
  await issue(email, RESET, token, RESET_TTL_MS);
  return token;
}

export type OtpResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "locked" };

/** Check a login code. Consumes it on success; counts failed attempts. */
export async function verifyOtp(email: string, code: string): Promise<OtpResult> {
  const row = await prisma.verificationCode.findFirst({
    where: { identifier: email, purpose: OTP },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "invalid" };

  if (row.expiresAt < new Date()) {
    await prisma.verificationCode.delete({ where: { id: row.id } });
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.verificationCode.delete({ where: { id: row.id } });
    return { ok: false, reason: "locked" };
  }
  if (!hashesEqual(row.tokenHash, sha256(code))) {
    await prisma.verificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "invalid" };
  }

  await prisma.verificationCode.delete({ where: { id: row.id } });
  return { ok: true };
}

/** Look up (without consuming) the email a reset token belongs to. */
export async function peekResetToken(token: string): Promise<string | null> {
  const row = await prisma.verificationCode.findFirst({
    where: { purpose: RESET, tokenHash: sha256(token) },
  });
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await prisma.verificationCode.delete({ where: { id: row.id } });
    return null;
  }
  return row.identifier;
}

/** Consume a reset token, returning the email it belonged to. */
export async function consumeResetToken(token: string): Promise<string | null> {
  const email = await peekResetToken(token);
  if (email) {
    await prisma.verificationCode.deleteMany({ where: { purpose: RESET, tokenHash: sha256(token) } });
  }
  return email;
}

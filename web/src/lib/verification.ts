import "server-only";

import { prisma } from "./db";
import { hashesEqual, sha256, sixDigitCode } from "./rand";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** What a code is for — a code issued for one purpose never verifies for another. */
export type OtpPurpose = "email-otp" | "password-reset-otp";

/** Create + store a 6-digit code (replacing any earlier one), returning the raw code to email. */
export async function issueOtp(email: string, purpose: OtpPurpose = "email-otp"): Promise<string> {
  const code = sixDigitCode();
  await prisma.verificationCode.deleteMany({ where: { identifier: email, purpose } });
  await prisma.verificationCode.create({
    data: {
      identifier: email,
      purpose,
      tokenHash: sha256(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return code;
}

export type OtpResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "locked" };

/** Check a code. Consumes it on success; counts failed attempts and locks after 5. */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: OtpPurpose = "email-otp",
): Promise<OtpResult> {
  const row = await prisma.verificationCode.findFirst({
    where: { identifier: email, purpose },
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

export const OTP_MESSAGES = {
  invalid: "That code isn't right",
  expired: "That code has expired — request a new one",
  locked: "Too many wrong tries — request a new code",
} as const;

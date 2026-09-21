import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { OTP_MESSAGES, verifyOtp } from "@/lib/verification";
import { MIN_PASSWORD } from "@/lib/validate";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; code?: string; password?: string }
    | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const code = body?.code?.trim() ?? "";
  const password = body?.password ?? "";

  if (!email || !/^\d{6}$/.test(code)) {
    return Response.json({ error: "Enter the 6-digit code" }, { status: 400 });
  }
  // Checked before the code so a too-short password doesn't burn a valid code.
  if (password.length < MIN_PASSWORD) {
    return Response.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters` },
      { status: 400 },
    );
  }

  const result = await verifyOtp(email, code, "password-reset-otp");
  if (!result.ok) {
    return Response.json({ error: OTP_MESSAGES[result.reason] }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { email },
    data: { password: await hashPassword(password), emailVerified: new Date() },
    select: { id: true },
  });

  await createSession(user.id);
  return Response.json({ ok: true });
}

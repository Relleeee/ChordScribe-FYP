import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { verifyOtp } from "@/lib/verification";

const MESSAGES = {
  invalid: "That code isn't right",
  expired: "That code has expired — request a new one",
  locked: "Too many wrong tries — request a new code",
} as const;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; code?: string }
    | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const code = body?.code?.trim() ?? "";
  if (!email || !/^\d{6}$/.test(code)) {
    return Response.json({ error: "Enter the 6-digit code" }, { status: 400 });
  }

  const result = await verifyOtp(email, code);
  if (!result.ok) {
    return Response.json({ error: MESSAGES[result.reason] }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return Response.json({ error: "Account not found" }, { status: 404 });

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  });
  await createSession(user.id);
  return Response.json({ ok: true });
}

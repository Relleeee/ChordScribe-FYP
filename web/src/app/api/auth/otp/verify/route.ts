import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { OTP_MESSAGES, verifyOtp } from "@/lib/verification";

/** "jane.doe+tag@example.com" → "jane.doe" — a placeholder until they rename themselves. */
function nameFromEmail(email: string): string {
  return email.split("@")[0]!.split("+")[0]! || "Guitarist";
}

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
    return Response.json({ error: OTP_MESSAGES[result.reason] }, { status: 400 });
  }

  // Proving control of the inbox is enough: sign in, or create the account on
  // first use. Terms were accepted at the request step (which refuses without it).
  const user = await prisma.user.upsert({
    where: { email },
    update: { emailVerified: new Date() },
    create: {
      email,
      name: nameFromEmail(email),
      emailVerified: new Date(),
      termsAgreedAt: new Date(),
    },
    select: { id: true },
  });

  await createSession(user.id);
  return Response.json({ ok: true });
}

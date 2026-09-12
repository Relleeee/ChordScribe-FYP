import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { parseCredentials } from "@/lib/validate";
import { verifyTurnstile } from "@/lib/turnstile";
import { clientIp } from "@/lib/request";

export async function POST(request: Request): Promise<Response> {
  const raw = (await request.json().catch(() => null)) as
    | { turnstileToken?: string; agreedToTerms?: boolean }
    | null;

  if (raw?.agreedToTerms !== true) {
    return Response.json({ error: "Please accept the Terms and Conditions" }, { status: 400 });
  }
  if (!(await verifyTurnstile(raw?.turnstileToken ?? "", clientIp(request)))) {
    return Response.json({ error: "Human check failed — please try again" }, { status: 400 });
  }

  const parsed = parseCredentials(raw, { requireName: true });
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return Response.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: name!,
      password: await hashPassword(password),
      termsAgreedAt: new Date(),
    },
    select: { id: true, name: true, email: true },
  });

  await createSession(user.id);
  return Response.json({ user }, { status: 201 });
}

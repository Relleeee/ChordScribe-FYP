import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { consumeResetToken } from "@/lib/verification";
import { MIN_PASSWORD } from "@/lib/validate";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { token?: string; password?: string }
    | null;
  const token = body?.token ?? "";
  const password = body?.password ?? "";

  if (password.length < MIN_PASSWORD) {
    return Response.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters` },
      { status: 400 },
    );
  }

  const email = await consumeResetToken(token);
  if (!email) {
    return Response.json({ error: "This reset link is invalid or has expired" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { email },
    data: { password: await hashPassword(password), emailVerified: new Date() },
    select: { id: true },
  });

  await createSession(user.id);
  return Response.json({ ok: true });
}

import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { parseCredentials } from "@/lib/validate";

export async function POST(request: Request): Promise<Response> {
  const parsed = parseCredentials(await request.json().catch(() => null), { requireName: false });
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Accounts created only via Google/Facebook have no password set.
  if (user && user.password === null) {
    return Response.json(
      { error: "This account uses social sign-in. Use Google/Facebook, or reset your password." },
      { status: 401 },
    );
  }

  // Same response whether the email is unknown or the password is wrong.
  if (!user || !user.password || !(await verifyPassword(password, user.password))) {
    return Response.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  await createSession(user.id);
  return Response.json({ user: { id: user.id, name: user.name, email: user.email } });
}

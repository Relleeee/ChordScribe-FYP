import { prisma } from "@/lib/db";
import { issueResetToken } from "@/lib/verification";
import { sendMail } from "@/lib/email";
import { resetEmail } from "@/lib/email-templates";
import { rateLimit } from "@/lib/ratelimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_URL = process.env.OAUTH_REDIRECT_BASE ?? "http://localhost:3000";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!rateLimit(`reset:${email}`, 3, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many requests — wait a few minutes" }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  let previewUrl: string | null = null;
  if (user) {
    const token = await issueResetToken(email);
    const link = `${APP_URL}/reset-password?token=${token}`;
    ({ previewUrl } = await sendMail({ to: email, ...resetEmail(link) }));
  }

  // Same response whether or not the account exists.
  return Response.json({ ok: true, previewUrl });
}

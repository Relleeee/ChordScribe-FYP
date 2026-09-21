import { prisma } from "@/lib/db";
import { issueOtp } from "@/lib/verification";
import { sendMail } from "@/lib/email";
import { resetOtpEmail } from "@/lib/email-templates";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/request";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (
    !rateLimit(`reset:${email}`, 3, 15 * 60 * 1000) ||
    !rateLimit(`reset-ip:${clientIp(request) ?? "unknown"}`, 10, 15 * 60 * 1000)
  ) {
    return Response.json({ error: "Too many requests — wait a few minutes" }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  let previewUrl: string | null = null;
  if (user) {
    const code = await issueOtp(email, "password-reset-otp");
    ({ previewUrl } = await sendMail({ to: email, ...resetOtpEmail(code) }));
  }

  // Same response whether or not the account exists.
  return Response.json({ ok: true, previewUrl });
}

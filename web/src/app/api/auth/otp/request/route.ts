import { prisma } from "@/lib/db";
import { issueOtp } from "@/lib/verification";
import { sendMail } from "@/lib/email";
import { otpEmail } from "@/lib/email-templates";
import { rateLimit } from "@/lib/ratelimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!rateLimit(`otp:${email}`, 3, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many code requests — wait a few minutes" }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    return Response.json(
      { error: "No account uses that email. Create one first." },
      { status: 404 },
    );
  }

  const code = await issueOtp(email);
  const { previewUrl } = await sendMail({ to: email, ...otpEmail(code) });

  // previewUrl is only ever set on the Ethereal dev fallback.
  return Response.json({ ok: true, previewUrl });
}

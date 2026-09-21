import { issueOtp } from "@/lib/verification";
import { sendMail } from "@/lib/email";
import { otpEmail } from "@/lib/email-templates";
import { rateLimit } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { clientIp } from "@/lib/request";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email-only sign-in: emails a 6-digit code to any address. The account is
 * created (if new) when the code is verified, so there is no "does this email
 * exist" tell here — the response is identical either way.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { email?: string; agreedToTerms?: boolean; turnstileToken?: string }
    | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (body?.agreedToTerms !== true) {
    return Response.json({ error: "Please accept the Terms and Conditions" }, { status: 400 });
  }

  const ip = clientIp(request);
  if (!(await verifyTurnstile(body?.turnstileToken ?? "", ip))) {
    return Response.json({ error: "Human check failed — please try again" }, { status: 400 });
  }
  if (
    !rateLimit(`otp:${email}`, 3, 15 * 60 * 1000) ||
    !rateLimit(`otp-ip:${ip ?? "unknown"}`, 10, 15 * 60 * 1000)
  ) {
    return Response.json({ error: "Too many code requests — wait a few minutes" }, { status: 429 });
  }

  const code = await issueOtp(email);
  const { previewUrl } = await sendMail({ to: email, ...otpEmail(code) });

  // previewUrl is only ever set on the Ethereal dev fallback.
  return Response.json({ ok: true, previewUrl });
}

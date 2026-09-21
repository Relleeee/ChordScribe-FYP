import type { Mail } from "./email";

const shell = (heading: string, body: string) => `
<div style="font-family:system-ui,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#211a14">
  <div style="font-weight:700;font-size:18px;color:#b45309">ChordScribe</div>
  <h1 style="font-size:18px;margin:16px 0 8px">${heading}</h1>
  ${body}
  <p style="margin-top:24px;font-size:12px;color:#8a7f75">
    If you didn't request this, you can ignore this email.
  </p>
</div>`;

export function otpEmail(code: string): Omit<Mail, "to"> {
  return {
    subject: `Your ChordScribe sign-in code: ${code}`,
    text: `Your ChordScribe sign-in code is ${code}. It expires in 10 minutes.`,
    html: shell(
      "Your sign-in code",
      `<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:8px 0">${code}</p>
       <p style="font-size:14px;color:#5f574e">Enter this code to finish signing in. It expires in 10 minutes.</p>`,
    ),
  };
}

export function resetOtpEmail(code: string): Omit<Mail, "to"> {
  return {
    subject: `Your ChordScribe password reset code: ${code}`,
    text: `Your ChordScribe password reset code is ${code}. It expires in 10 minutes.`,
    html: shell(
      "Reset your password",
      `<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:8px 0">${code}</p>
       <p style="font-size:14px;color:#5f574e">Enter this code, then choose a new password. It expires in 10 minutes.</p>`,
    ),
  };
}

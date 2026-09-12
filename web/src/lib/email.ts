import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "ChordScribe <no-reply@chordscribe.local>";

let transporterPromise: Promise<{ transporter: Transporter; isEthereal: boolean }> | null = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    const host = process.env.SMTP_HOST;
    if (host) {
      return {
        isEthereal: false,
        transporter: nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_PORT === "465",
          auth:
            process.env.SMTP_USER && process.env.SMTP_PASS
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
        }),
      };
    }

    // No SMTP configured — spin up a throwaway Ethereal inbox. Nothing is
    // actually delivered; each send prints a preview URL to the server console.
    const test = await nodemailer.createTestAccount();
    console.info("[email] No SMTP_HOST set — using Ethereal test inbox (%s)", test.user);
    return {
      isEthereal: true,
      transporter: nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: test.user, pass: test.pass },
      }),
    };
  })();

  return transporterPromise;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Send an email. Returns a preview URL when running on the Ethereal fallback. */
export async function sendMail(mail: Mail): Promise<{ previewUrl: string | null }> {
  const { transporter, isEthereal } = await getTransporter();
  const info = await transporter.sendMail({ from: EMAIL_FROM, ...mail });
  const previewUrl = isEthereal ? (nodemailer.getTestMessageUrl(info) || null) : null;
  if (previewUrl) console.info("[email] Preview %s → %s", mail.to, previewUrl);
  return { previewUrl };
}

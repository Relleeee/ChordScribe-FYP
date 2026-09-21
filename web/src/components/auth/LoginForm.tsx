"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Provider } from "@/lib/oauth";
import type { ApiError } from "@/lib/types";
import { AuthShell, Divider, Field, FormError, SubmitButton } from "./AuthShell";
import { SocialButtons } from "./SocialButtons";
import { TermsGate } from "./TermsGate";
import { DevPreviewLink } from "./DevPreviewLink";
import { Turnstile } from "./Turnstile";

const OAUTH_ERRORS: Record<string, string> = {
  oauth_failed: "Social sign-in didn't complete. Please try again.",
  oauth_cancelled: "Sign-in was cancelled.",
  oauth_unconfigured: "That provider isn't set up on this server yet.",
};

export function LoginForm({
  configured,
  next,
  error,
  turnstileSiteKey,
}: {
  configured: Provider[];
  next: string;
  error?: string;
  turnstileSiteKey: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Turnstile tokens are single-use; bumping this remounts the widget for a fresh one.
  const [captchaKey, setCaptchaKey] = useState(0);
  const handleToken = useCallback((t: string | null) => setCaptchaToken(t), []);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    error ? (OAUTH_ERRORS[error] ?? decodeURIComponent(error)) : null,
  );
  const [devPreview, setDevPreview] = useState<string | null>(null);

  const goHome = () => {
    router.replace(next.startsWith("/") ? next : "/");
    router.refresh();
  };

  async function call(url: string, payload: unknown): Promise<Record<string, unknown> | null> {
    setFormError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) throw new Error((body as ApiError | null)?.error ?? `HTTP ${res.status}`);
      return body;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/auth/login", { email, password })) goHome();
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    const body = await call("/api/auth/otp/request", {
      email,
      agreedToTerms: agreed,
      turnstileToken: captchaToken,
    });
    if (body) {
      setDevPreview(typeof body.previewUrl === "string" ? body.previewUrl : null);
      setOtpStep("code");
    } else {
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/auth/otp/verify", { email, code })) goHome();
  }

  return (
    <AuthShell
      subtitle="Sign in to your account"
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SocialButtons
        verb="Continue"
        configured={configured}
        disabled={!agreed}
        disabledHint="Accept the Terms and Conditions first"
      />

      <Divider />

      {mode === "password" ? (
        <form onSubmit={submitPassword} className="space-y-3">
          <Field label="Email" type="email" value={email} autoComplete="email" onChange={setEmail} />
          <Field
            label="Password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={setPassword}
          />
          <div className="flex justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setMode("otp");
                setFormError(null);
              }}
              className="text-accent hover:underline"
            >
              Sign in with email only
            </button>
            <Link href="/forgot-password" className="text-foreground/60 hover:underline">
              Forgot password?
            </Link>
          </div>
          <TermsGate checked={agreed} onChange={setAgreed} />
          <FormError>{formError}</FormError>
          <SubmitButton busy={busy} disabled={!agreed}>
            Sign in
          </SubmitButton>
        </form>
      ) : otpStep === "email" ? (
        <form onSubmit={requestCode} className="space-y-3">
          <Field
            label="Email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={setEmail}
            hint="No password needed — we'll email a 6-digit code. New here? Your account is created automatically."
          />
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setFormError(null);
            }}
            className="text-xs text-accent hover:underline"
          >
            Use a password instead
          </button>
          <Turnstile key={captchaKey} siteKey={turnstileSiteKey} onToken={handleToken} />
          <TermsGate checked={agreed} onChange={setAgreed} />
          <FormError>{formError}</FormError>
          <SubmitButton busy={busy} disabled={!agreed || !captchaToken}>
            Send code
          </SubmitButton>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <p className="text-sm text-foreground/70">
            Enter the code sent to <span className="font-medium">{email}</span>.
          </p>
          <DevPreviewLink url={devPreview} />
          <Field
            label="6-digit code"
            type="text"
            inputMode="numeric"
            value={code}
            autoComplete="one-time-code"
            onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
          />
          <button
            type="button"
            onClick={() => {
              setOtpStep("email");
              setCode("");
              setFormError(null);
            }}
            className="text-xs text-accent hover:underline"
          >
            Use a different email
          </button>
          <FormError>{formError}</FormError>
          <SubmitButton busy={busy}>Verify &amp; sign in</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

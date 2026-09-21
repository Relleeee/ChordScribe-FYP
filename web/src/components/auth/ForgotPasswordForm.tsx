"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ApiError } from "@/lib/types";
import { AuthShell, Field, FormError, SubmitButton } from "./AuthShell";
import { DevPreviewLink } from "./DevPreviewLink";

type Step = "email" | "reset";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devPreview, setDevPreview] = useState<string | null>(null);

  async function post(url: string, payload: unknown): Promise<Record<string, unknown> | null> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) throw new Error((body as ApiError | null)?.error ?? `HTTP ${res.status}`);
      return body ?? {};
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    const body = await post("/api/auth/password/forgot", { email });
    if (body) {
      setDevPreview(typeof body.previewUrl === "string" ? body.previewUrl : null);
      setStep("reset");
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (await post("/api/auth/password/reset", { email, code, password })) {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <AuthShell
      subtitle={step === "email" ? "Reset your password" : "Choose a new password"}
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {step === "email" ? (
        <form onSubmit={requestCode} className="space-y-3">
          <Field
            label="Email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={setEmail}
            hint="We'll email you a 6-digit code."
          />
          <FormError>{error}</FormError>
          <SubmitButton busy={busy}>Send code</SubmitButton>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="space-y-3">
          <p className="text-sm text-foreground/70">
            If an account uses <span className="font-medium">{email}</span>, a code is on its way.
            It expires in 10 minutes.
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
          <Field
            label="New password"
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={setPassword}
            hint="At least 8 characters"
          />
          <Field
            label="Confirm password"
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={setConfirm}
          />
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="text-xs text-accent hover:underline"
          >
            Use a different email
          </button>
          <FormError>{error}</FormError>
          <SubmitButton busy={busy} disabled={code.length !== 6}>
            Set password &amp; sign in
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

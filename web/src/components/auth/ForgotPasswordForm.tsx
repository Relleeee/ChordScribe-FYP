"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApiError } from "@/lib/types";
import { AuthShell, Field, FormError, SubmitButton } from "./AuthShell";
import { DevPreviewLink } from "./DevPreviewLink";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [devPreview, setDevPreview] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => null)) as
        | (ApiError & { previewUrl?: string | null })
        | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setDevPreview(body?.previewUrl ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      subtitle="Reset your password"
      footer={
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-3 text-sm text-foreground/80">
          <p>
            If an account uses <span className="font-medium">{email}</span>, a reset link is on its
            way. The link expires in an hour.
          </p>
          <DevPreviewLink url={devPreview} />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field
            label="Email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={setEmail}
            hint="We'll email you a link to set a new password."
          />
          <FormError>{error}</FormError>
          <SubmitButton busy={busy}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

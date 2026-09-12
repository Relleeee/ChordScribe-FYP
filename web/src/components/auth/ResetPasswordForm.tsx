"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ApiError } from "@/lib/types";
import { AuthShell, Field, FormError, SubmitButton } from "./AuthShell";

export function ResetPasswordForm({ token, valid }: { token: string; valid: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (!valid) {
    return (
      <AuthShell
        subtitle="Reset your password"
        footer={
          <Link href="/forgot-password" className="font-medium text-accent hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-foreground/80">
          This reset link is invalid or has expired. Reset links are single-use and last one hour.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Choose a new password">
      <form onSubmit={submit} className="space-y-3">
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
        <FormError>{error}</FormError>
        <SubmitButton busy={busy}>Set password &amp; sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}

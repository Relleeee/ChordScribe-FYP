"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Provider } from "@/lib/oauth";
import type { ApiError } from "@/lib/types";
import { AuthShell, Divider, Field, FormError, SubmitButton } from "./AuthShell";
import { SocialButtons } from "./SocialButtons";
import { TermsGate } from "./TermsGate";
import { Turnstile } from "./Turnstile";

export function RegisterForm({
  configured,
  next,
  turnstileSiteKey,
}: {
  configured: Provider[];
  next: string;
  turnstileSiteKey: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToken = useCallback((t: string | null) => setCaptchaToken(t), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          agreedToTerms: agreed,
          turnstileToken: captchaToken,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      subtitle="Create an account"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SocialButtons
        verb="Sign up"
        configured={configured}
        disabled={!agreed}
        disabledHint="Accept the Terms and Conditions first"
      />

      <Divider />

      <form onSubmit={submit} className="space-y-3">
        <Field label="Name" type="text" value={name} autoComplete="name" onChange={setName} />
        <Field label="Email" type="email" value={email} autoComplete="email" onChange={setEmail} />
        <Field
          label="Password"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={setPassword}
          hint="At least 8 characters"
        />

        <Turnstile siteKey={turnstileSiteKey} onToken={handleToken} />

        <TermsGate checked={agreed} onChange={setAgreed} />

        <FormError>{error}</FormError>

        <SubmitButton busy={busy} disabled={!agreed || !captchaToken}>
          Create account
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

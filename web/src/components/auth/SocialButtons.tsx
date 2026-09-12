import type { ReactElement } from "react";
import type { Provider } from "@/lib/oauth";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12Z"
      />
    </svg>
  );
}

const META: Record<Provider, { label: string; Icon: () => ReactElement }> = {
  google: { label: "Google", Icon: GoogleIcon },
  facebook: { label: "Facebook", Icon: FacebookIcon },
};

export function SocialButtons({
  verb,
  configured,
  disabled = false,
  disabledHint,
}: {
  verb: string;
  configured: Provider[];
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className="space-y-2">
      {(["google", "facebook"] as Provider[]).map((p) => {
        const { label, Icon } = META[p];
        const notConfigured = !configured.includes(p);
        const isDisabled = disabled || notConfigured;
        const title = notConfigured
          ? "Add this provider's client ID/secret to web/.env.local"
          : disabled
            ? disabledHint
            : undefined;

        return isDisabled ? (
          <button
            key={p}
            type="button"
            disabled
            title={title}
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium opacity-45"
          >
            <Icon />
            {verb} with {label}
          </button>
        ) : (
          <a
            key={p}
            href={`/api/auth/oauth/${p}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent-soft"
          >
            <Icon />
            {verb} with {label}
          </a>
        );
      })}
    </div>
  );
}

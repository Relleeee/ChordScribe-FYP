import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";

export function AuthShell({
  subtitle,
  children,
  footer,
}: {
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 flex items-center justify-center gap-2 font-display text-2xl font-semibold tracking-tight">
            <LogoMark className="h-6 w-6" />
            ChordScribe
          </div>
          <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
          {children}
        </div>

        {footer && <p className="mt-4 text-center text-sm text-foreground/60">{footer}</p>}
      </div>
    </div>
  );
}

export function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  hint,
  inputMode,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
  inputMode?: "text" | "email" | "numeric";
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type={type}
        required
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {hint && <span className="mt-1 block text-xs text-foreground/40">{hint}</span>}
    </label>
  );
}

export function SubmitButton({
  children,
  disabled,
  busy,
}: {
  children: ReactNode;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "Please wait…" : children}
    </button>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

export function Divider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-foreground/40">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

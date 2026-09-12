"use client";

import { useState } from "react";
import { TermsDialog } from "./TermsDialog";

export function TermsGate({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <label className="flex items-start gap-2 text-sm text-foreground/80">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 shrink-0"
        />
        <span>
          I agree to the{" "}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-medium text-accent underline"
          >
            Terms and Conditions
          </button>
        </span>
      </label>
      <TermsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

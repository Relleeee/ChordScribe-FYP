"use client";

import { useEffect } from "react";

const SECTIONS: { h: string; p: string }[] = [
  {
    h: "1. About these terms",
    p: "ChordScribe is a student final-year-project prototype for automatic guitar chord recognition. By creating an account or signing in you agree to these Terms. If you do not agree, do not use the service.",
  },
  {
    h: "2. The service",
    p: "ChordScribe estimates chord progressions from audio you upload or from a YouTube link you provide, and presents them as a timestamped chord sheet with transpose and capo tools. Chord recognition is automatic and approximate — see section 6.",
  },
  {
    h: "3. Your account",
    p: "You are responsible for keeping your login details secure and for activity under your account. Provide a real email address so account-recovery and one-time codes can reach you. You may delete your account and its saved analyses at any time.",
  },
  {
    h: "4. Acceptable use",
    p: "Do not use ChordScribe to break the law, to infringe others' rights, to upload malware, or to overload or probe the service. Do not attempt to access other users' data. Automated or bulk use is not permitted without prior permission.",
  },
  {
    h: "5. Content and third-party sources",
    p: "You keep ownership of files you upload. You confirm you have the right to process any audio or video you submit, including material fetched from YouTube links, and that doing so is permitted for your personal, non-commercial use in your jurisdiction. ChordScribe stores the audio only transiently to analyse it; the saved result is the chord data, not the audio. ChordScribe is not affiliated with YouTube or any rights holder.",
  },
  {
    h: "6. Accuracy",
    p: "Chord and key estimates are produced by signal-processing heuristics and are frequently imperfect, especially for dense mixes, complex chords, or major/minor ambiguity. Output is provided for learning and practice only and must not be relied on as an authoritative transcription.",
  },
  {
    h: "7. Data we store",
    p: "We store your name, email address, a hashed password (if you set one), which social login you linked (if any), and the analyses you run (title, source reference, detected key/tempo/chords, timestamps). One-time codes and reset tokens are stored hashed and expire quickly. We do not sell your data or use it for advertising.",
  },
  {
    h: "8. Availability and changes",
    p: "The service is offered on a best-effort basis and may change, break, or be withdrawn at any time without notice. These Terms may be updated; continued use after a change means you accept the new version.",
  },
  {
    h: "9. No warranty; limitation of liability",
    p: "The service is provided “as is” without warranties of any kind. To the fullest extent permitted by law, the project and its author are not liable for any loss or damage arising from use of, or inability to use, ChordScribe.",
  },
  {
    h: "10. Termination",
    p: "We may suspend or remove accounts that breach these Terms or that put the service or other users at risk.",
  },
  {
    h: "11. Contact",
    p: "Questions about these Terms can be raised with the project author through the channels listed in the project documentation.",
  },
];

export function TermsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Terms and Conditions"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-display text-lg font-semibold">Terms &amp; Conditions</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-foreground/50 hover:bg-accent-soft hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="themed-scrollbar space-y-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
          <p className="text-xs text-foreground/50">Last updated on first publication of this prototype.</p>
          {SECTIONS.map((s) => (
            <div key={s.h}>
              <h3 className="mb-1 font-semibold">{s.h}</h3>
              <p className="text-foreground/75">{s.p}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-strong-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

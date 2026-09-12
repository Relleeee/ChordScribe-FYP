/** Small equalizer-bar mark used next to the ChordScribe wordmark. */
export function LogoMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="2" y="9" width="4" height="10" rx="1.5" className="fill-accent" />
      <rect x="10" y="3" width="4" height="16" rx="1.5" className="fill-accent" />
      <rect x="18" y="12" width="4" height="7" rx="1.5" className="fill-accent" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-display font-semibold tracking-tight ${className}`}>
      <LogoMark />
      ChordScribe
    </span>
  );
}

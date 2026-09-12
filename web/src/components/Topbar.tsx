"use client";

import { Wordmark } from "./Logo";
import { TunerButton } from "./TunerButton";

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}

export function Topbar({ sidebarOpen, onToggleSidebar, onLogout, loggingOut }: Props) {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-surface/80 px-3 backdrop-blur sm:px-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-expanded={sidebarOpen}
          className="relative h-9 w-9 rounded-md text-foreground/80 hover:bg-accent-soft hover:text-accent"
        >
          {/* Hamburger that morphs into an ✕ */}
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 block h-[2px] w-4 rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{
                transform: sidebarOpen
                  ? i === 1
                    ? "translate(-50%,-50%) scaleX(0)"
                    : `translate(-50%,-50%) rotate(${i === 0 ? 45 : -45}deg)`
                  : `translate(-50%,-50%) translateY(${(i - 1) * 6}px)`,
                opacity: sidebarOpen && i === 1 ? 0 : 1,
              }}
            />
          ))}
        </button>
        <Wordmark />
      </div>

      <div className="flex items-center gap-2">
        <TunerButton />
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50"
        >
          {loggingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </header>
  );
}

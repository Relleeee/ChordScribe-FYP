"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisSummary, SavedAnalysis, SessionUser } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AnalyzeForm } from "./AnalyzeForm";
import { ResultView } from "./ResultView";

interface Props {
  user: SessionUser;
  initialAnalyses: AnalysisSummary[];
}

function summarise(a: SavedAnalysis): AnalysisSummary {
  return {
    id: a.id,
    title: a.source.title ?? a.source.reference,
    sourceKind: a.source.kind,
    key: a.key ?? null,
    bpm: a.bpm ?? null,
    createdAt: a.createdAt,
  };
}

const DESKTOP = "(min-width: 1024px)";

/** Tracks a media query without a hydration mismatch (server snapshot = false). */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function AppShell({ user, initialAnalyses }: Props) {
  const router = useRouter();
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [active, setActive] = useState<SavedAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const isDesktop = useMediaQuery(DESKTOP);
  // null = follow the viewport (open on desktop, closed on mobile); once the
  // user toggles, their choice sticks. This also gives a clean SSR paint
  // (closed) that slides open on desktop after hydration.
  const [override, setOverride] = useState<boolean | null>(null);
  const sidebarOpen = override ?? isDesktop;
  const setSidebarOpen = useCallback((v: boolean) => setOverride(v), []);
  const toggleSidebar = useCallback(
    () => setOverride((o) => !(o ?? isDesktop)),
    [isDesktop],
  );

  const closeOnMobile = useCallback(() => {
    if (!isDesktop) setOverride(false);
  }, [isDesktop]);

  const handleResult = useCallback((saved: SavedAnalysis) => {
    setActive(saved);
    setAnalyses((prev) => [summarise(saved), ...prev.filter((a) => a.id !== saved.id)]);
  }, []);

  const handleSelect = useCallback(
    async (id: string) => {
      closeOnMobile();
      setLoading(true);
      try {
        const res = await fetch(`/api/analyses/${id}`);
        if (res.ok) setActive((await res.json()) as SavedAnalysis);
      } finally {
        setLoading(false);
      }
    },
    [closeOnMobile],
  );

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/analyses/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      setActive((cur) => (cur?.id === id ? null : cur));
    }
  }, []);

  const handleRename = useCallback(async (id: string, title: string) => {
    // Optimistic — the sidebar input already shows the new value.
    setAnalyses((prev) => prev.map((a) => (a.id === id ? { ...a, title } : a)));
    setActive((cur) => (cur?.id === id ? { ...cur, source: { ...cur.source, title } } : cur));

    const res = await fetch(`/api/analyses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      // Roll back by re-fetching the authoritative list.
      const list = await fetch("/api/analyses");
      if (list.ok) setAnalyses(((await list.json()) as { analyses: AnalysisSummary[] }).analyses);
    }
  }, []);

  const handleNew = useCallback(() => {
    setActive(null);
    closeOnMobile();
  }, [closeOnMobile]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  const ease = "cubic-bezier(0.32,0.72,0,1)";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Topbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onLogout={handleLogout}
        loggingOut={loggingOut}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar: an in-flow collapsing column on desktop, a slide-over on
            mobile. `overflow-hidden` + a fixed-width inner panel means the
            content is clipped, not reflowed, while it animates. */}
        <aside
          style={{ transitionTimingFunction: ease }}
          className={`z-40 shrink-0 overflow-hidden bg-surface-2 transition-[width,transform] duration-300 max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:top-14 max-lg:w-[18rem] max-lg:shadow-2xl ${
            sidebarOpen
              ? "border-r border-border lg:w-[18rem] max-lg:translate-x-0"
              : "lg:w-0 max-lg:-translate-x-full"
          }`}
        >
          <div className="h-full w-[18rem]">
            <Sidebar
              user={user}
              analyses={analyses}
              activeId={active?.id ?? null}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onRename={handleRename}
              onNew={handleNew}
            />
          </div>
        </aside>

        {/* Mobile scrim */}
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={sidebarOpen ? 0 : -1}
          onClick={() => setSidebarOpen(false)}
          className={`fixed inset-0 top-14 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
            sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />

        <main className="themed-scrollbar min-w-0 flex-1 overflow-y-auto">
          <div
            className={`mx-auto w-full space-y-6 px-4 py-6 transition-[max-width] duration-300 sm:px-6 lg:px-10 lg:py-10 ${
              active && !loading ? "max-w-6xl" : "max-w-2xl"
            }`}
            style={{ transitionTimingFunction: ease }}
          >
            {loading && <p className="text-sm text-foreground/50">Loading…</p>}

            {!loading && !active && (
              <>
                <div>
                  <h1 className="font-display text-2xl font-semibold tracking-tight">
                    Analyse a track
                  </h1>
                  <p className="mt-1 text-sm text-foreground/60">
                    Paste a YouTube link or upload a file to get a timestamped chord sheet.
                  </p>
                </div>
                <AnalyzeForm onResult={handleResult} />
              </>
            )}

            {!loading && active && (
              <>
                <button
                  type="button"
                  onClick={handleNew}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-accent"
                >
                  <span className="text-base leading-none">+</span> New analysis
                </button>
                <ResultView key={active.id} result={active} />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

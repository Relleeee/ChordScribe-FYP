"use client";

import { useEffect, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import type { SourceInfo } from "@/lib/types";

type SeekFn = (seconds: number) => void;

interface Props {
  source: SourceInfo;
  onTime: (seconds: number) => void;
  /** The player fills this so the timeline can seek it. */
  seekRef: RefObject<SeekFn | null>;
}

const VIDEO_RE = /\.(mp4|mov|webm|mkv|m4v)$/i;

// --- YouTube IFrame API loader -------------------------------------------------

interface YTPlayer {
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
  PlayerState: { PLAYING: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytPromise;
}

// --- component ---------------------------------------------------------------

export function MediaPlayer({ source, onTime, seekRef }: Props) {
  if (source.kind === "youtube") {
    return <YouTubePlayer videoId={source.reference} onTime={onTime} seekRef={seekRef} />;
  }
  return <UploadPlayer filename={source.reference} onTime={onTime} seekRef={seekRef} />;
}

function YouTubePlayer({
  videoId,
  onTime,
  seekRef,
}: {
  videoId: string;
  onTime: (s: number) => void;
  seekRef: RefObject<SeekFn | null>;
}) {
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let player: YTPlayer | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !holderRef.current) return;
      player = new YT.Player(holderRef.current, {
        videoId,
        playerVars: { modestbranding: 1, rel: 0 },
        events: {
          onStateChange: (e: { data: number }) => {
            clearInterval(poll);
            if (e.data === YT.PlayerState.PLAYING) {
              poll = setInterval(() => onTime(player?.getCurrentTime() ?? 0), 250);
            }
          },
        },
      });
      seekRef.current = (s) => player?.seekTo(s, true);
    });

    return () => {
      cancelled = true;
      clearInterval(poll);
      seekRef.current = null;
      player?.destroy();
    };
  }, [videoId, onTime, seekRef]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <div className="aspect-video">
        <div ref={holderRef} className="h-full w-full" />
      </div>
    </div>
  );
}

function UploadPlayer({
  filename,
  onTime,
  seekRef,
}: {
  filename: string;
  onTime: (s: number) => void;
  seekRef: RefObject<SeekFn | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isVideo = VIDEO_RE.test(filename);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const setMedia = (el: HTMLMediaElement | null) => {
    mediaRef.current = el;
  };

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    seekRef.current = (s) => {
      if (mediaRef.current) mediaRef.current.currentTime = s;
    };
    return () => {
      seekRef.current = null;
    };
  }, [seekRef, url]);

  if (!url) {
    return (
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground/60 hover:border-accent">
        <input
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setUrl(URL.createObjectURL(f));
          }}
        />
        Load <span className="mx-1 font-medium text-foreground/80">{filename}</span> to play along
        <span className="mt-1 text-xs text-foreground/40">
          The file isn&apos;t uploaded — it plays locally in your browser.
        </span>
      </label>
    );
  }

  const onTimeUpdate = (e: SyntheticEvent<HTMLMediaElement>) =>
    onTime(e.currentTarget.currentTime);

  return isVideo ? (
    <video
      ref={setMedia}
      src={url}
      controls
      onTimeUpdate={onTimeUpdate}
      className="w-full rounded-xl border border-border bg-black"
    />
  ) : (
    <audio ref={setMedia} src={url} controls onTimeUpdate={onTimeUpdate} className="w-full" />
  );
}

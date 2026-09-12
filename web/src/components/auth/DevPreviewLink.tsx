/**
 * When email runs on the Ethereal dev fallback, the API returns a preview URL.
 * Surfacing it in the UI makes local testing painless; it's only ever set when
 * no real SMTP is configured.
 */
export function DevPreviewLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-foreground/70">
      Dev mode — no real email sent.{" "}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-accent underline"
      >
        Open the email preview
      </a>
    </p>
  );
}

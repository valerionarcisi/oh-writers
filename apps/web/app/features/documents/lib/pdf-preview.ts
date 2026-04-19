/**
 * Browser-only helper that opens a generated PDF in a new tab using the
 * native viewer. Isolated from the hook so a future Expo companion can
 * provide its own implementation backed by `expo-sharing` or a native PDF
 * view, without touching the export pipeline.
 *
 * The blob URL is revoked after a 60s grace period so the preview tab has
 * time to render before we drop the reference. If the popup is blocked
 * (rare since this is invoked inside a click handler) we fall back to a
 * programmatic anchor click.
 */
export const openPdfPreview = (blobUrl: string, _filename: string): void => {
  if (typeof window === "undefined") return;

  const popup = window.open(blobUrl, "_blank");
  if (!popup) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
};

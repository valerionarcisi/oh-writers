// Browser-isolated download helper. Keeping it here (and not inline in a
// component) means a future Expo companion can swap in expo-file-system
// without touching call sites.

export const base64ToBlob = (base64: string, mime: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/**
 * Triggers a plain-text file download in the browser.
 * Isolated from call sites so a future Expo companion can swap in
 * expo-file-system without touching the export pipeline.
 */
export const downloadTextFile = (text: string, filename: string, mime = "text/plain;charset=utf-8"): void => {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: mime });
  downloadBlob(blob, filename);
};

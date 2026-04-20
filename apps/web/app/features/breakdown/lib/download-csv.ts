/**
 * Browser-only helper that triggers a CSV file download. Isolated from the
 * export hook so a future Expo companion can provide its own implementation
 * backed by `expo-file-system` / `expo-sharing` without touching the pipeline.
 */
export const downloadCsv = (csv: string, filename: string): void => {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

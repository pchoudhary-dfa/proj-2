/**
 * Triggers a blob download and revokes the object URL after a short delay
 * to avoid leaks and allow the browser to start the download.
 */
export function downloadBlob(blob: Blob, filename: string, _mimeType?: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 100);
}

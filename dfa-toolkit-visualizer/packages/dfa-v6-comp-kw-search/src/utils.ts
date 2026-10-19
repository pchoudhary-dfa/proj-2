/**
 * Internal utilities for the chip search component.
 */

function isEl(value: unknown): value is HTMLElement {
  return Boolean(value && typeof value === "object" && (value as Node).nodeType === 1);
}

export function toEl(mountEl: HTMLElement | string): HTMLElement {
  if (isEl(mountEl)) return mountEl;
  if (typeof mountEl === "string") {
    const el = document.querySelector(mountEl);
    if (!el) throw new Error(`createChipSearch: mount element not found for selector "${mountEl}"`);
    return el as HTMLElement;
  }
  throw new Error("createChipSearch: mountEl must be a DOM element or selector string");
}

export function debounce<A extends unknown[], R>(
  fn: (...args: A) => R,
  ms: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return function (this: unknown, ...args: A) {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function uniqByKey<T>(items: T[], keyFn: (it: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = keyFn(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function safeTypeLabel(type: string, formatKeywordType?: (type: string) => string): string {
  if (typeof formatKeywordType === "function") return String(formatKeywordType(type));
  return String(type || "");
}

export function emit(el: HTMLElement, name: string, detail: unknown): void {
  el.dispatchEvent(
    new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
}

export function escapeHtml(str: string): string {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Truncate string with "..." in the middle; e.g. "Very Long Label" -> "Very Lo...bel". When maxLen is very small, returns start... only. */
export function truncateMiddle(str: string, maxLen: number): string {
  const s = String(str);
  if (maxLen < 4 || s.length <= maxLen) return s;
  if (maxLen < 11) return s.slice(0, Math.max(0, maxLen - 3)) + "...";
  const half = Math.floor((maxLen - 3) / 2);
  return s.slice(0, half) + "..." + s.slice(-half);
}

export function svgSearchIcon(): string {
  return (
    '<svg class="dtk-sch-leftIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>"
  );
}

export function svgChipIcon(): string {
  return (
    '<svg class="dtk-sch-chipIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M6 14v4M12 10v8M18 6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>"
  );
}

export function svgBadgeIcon(): string {
  return (
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:var(--sc-badge-icon-size,18px);height:var(--sc-badge-icon-size,18px);flex-shrink:0;color:#94a3b8">' +
    '<path d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>"
  );
}

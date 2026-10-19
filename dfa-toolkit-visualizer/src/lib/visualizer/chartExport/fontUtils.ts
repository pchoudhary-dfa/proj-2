import type { FontStyle } from "@/lib/visualizer/types";

/** Font stack so the chosen family is used when available, with sans-serif fallback (avoids Times New Roman). */
const SANS_FALLBACK = ", system-ui, -apple-system, sans-serif";

export function fontFamilyStack(family: string): string {
  return `${family}${SANS_FALLBACK}`;
}

export function getCanvasFontString(font: FontStyle): string {
  const style = font.italic ? "italic" : "normal";
  const weight = font.bold ? "bold" : "normal";
  return `${style} ${weight} ${font.size}px ${fontFamilyStack(font.family)}`;
}

export function getSvgFontAttributes(font: FontStyle): Record<string, string> {
  return {
    "font-size": `${font.size}px`,
    "font-family": fontFamilyStack(font.family),
    "font-weight": font.bold ? "bold" : "normal",
    "font-style": font.italic ? "italic" : "normal",
    "text-decoration": font.underline ? "underline" : "none",
  };
}

/**
 * Wrap a long string into lines that fit within maxWidth. Splits on spaces when possible.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    const words = para.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const metrics = ctx.measureText(candidate);
      if (metrics.width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

import { parseIusGid } from "@/lib/compute/iusGid";

export type IusDisplayLabelContext = {
  /** Indicator GID for the row being configured (home indicator). */
  homeIndicatorGid: string;
  /** Display name for the home indicator (form / row). */
  homeIndicatorName: string;
  /** Unit GID for the row being configured (home unit). */
  homeUnitGid: string;
  /** Resolve unit GID to label (meta + units list). */
  getUnitLabel: (unitGid: string) => string;
  /** Resolve subgroup value GID to label (meta + subgroups list). */
  getSubgroupLabel: (subgroupGid: string) => string;
};

/**
 * Builds the same style label as POST /compute/formula/resolve-ius: "I - U - S" using local lookups.
 * Unknown components fall back to their GID (matches server behavior when a row is missing).
 */
export function formatIusGidForDisplay(
  iusGid: string,
  ctx: IusDisplayLabelContext
): string {
  const parsed = parseIusGid(iusGid);
  if (!parsed) return iusGid;
  const [iGid, uGid, sGid] = parsed;
  const hi = ctx.homeIndicatorGid.trim();
  const iPart =
    iGid === hi
      ? (ctx.homeIndicatorName.trim() || iGid)
      : iGid;
  const uPart = (ctx.getUnitLabel(uGid) || "").trim() || uGid;
  const sPart = (ctx.getSubgroupLabel(sGid) || "").trim() || sGid;
  const parts = [iPart, uPart, sPart].filter(Boolean);
  return parts.length ? parts.join(" - ") : iusGid;
}

const IUS_LABEL_SEP = /\s+-\s+/;

/** User-facing separator for indicator / unit / subgroup in grid and picker labels. */
export const IUS_GRID_LABEL_SEPARATOR = ", ";

/** Split a display label into indicator / unit / subgroup segments. */
export function splitIusDisplayLabel(label: string): string[] {
  return label
    .trim()
    .split(IUS_LABEL_SEP)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Format a catalog or resolved label for target-IUS grid cells (comma-separated I, U, S). */
export function formatTargetIusGridLabel(labelOrGid: string): string {
  const raw = labelOrGid.trim();
  if (!raw) return raw;
  if (raw.includes("|")) return raw;
  const parts = splitIusDisplayLabel(raw);
  return parts.length >= 2 ? parts.join(IUS_GRID_LABEL_SEPARATOR) : raw;
}

/** Cross-indicator picks cannot use the config row's local indicator name. */
export function iusChipNeedsServerResolve(
  iusGid: string,
  ctx: IusDisplayLabelContext
): boolean {
  const parsed = parseIusGid(iusGid);
  if (!parsed) return true;
  const [iGid] = parsed;
  return iGid !== ctx.homeIndicatorGid.trim();
}

/** True when the label is still a raw GID (local meta did not resolve a name). */
export function iusLabelLooksUnresolved(
  iusGid: string,
  label: string
): boolean {
  const trimmed = label.trim();
  if (!trimmed || trimmed === iusGid.trim()) return true;
  if (trimmed.includes("|")) return true;
  const parsed = parseIusGid(iusGid);
  if (!parsed) return false;
  const [iGid, uGid, sGid] = parsed;
  if (trimmed === iGid || trimmed === uGid || trimmed === sGid) return true;

  const segments = splitIusDisplayLabel(trimmed);
  if (segments[0] === iGid) return true;
  if (segments.length >= 2 && segments[1] === uGid) return true;
  if (segments.length >= 3 && segments[segments.length - 1] === sGid) {
    return true;
  }
  return false;
}

function indicatorDisplayPart(
  iGid: string,
  ctx: IusDisplayLabelContext
): string {
  const hi = ctx.homeIndicatorGid.trim();
  return iGid === hi
    ? ctx.homeIndicatorName.trim() || iGid
    : iGid;
}

/**
 * Chip label for compute IUS pills: always includes indicator name.
 * Same row indicator + unit omits unit (fixed on the config row); otherwise "I - U - S".
 */
export function formatIusChipLabel(
  iusGid: string,
  ctx: IusDisplayLabelContext
): string {
  const parsed = parseIusGid(iusGid);
  if (!parsed) return iusGid;
  const [iGid, uGid, sGid] = parsed;
  const hi = ctx.homeIndicatorGid.trim();
  const hu = ctx.homeUnitGid.trim();
  const iPart = indicatorDisplayPart(iGid, ctx);
  const sPart = (ctx.getSubgroupLabel(sGid) || "").trim() || sGid;
  const sameIndicator = iGid === hi;
  const sameUnit = uGid === hu;
  if (sameIndicator && sameUnit) {
    return `${iPart} - ${sPart}`;
  }
  if (sameIndicator) {
    const uPart = (ctx.getUnitLabel(uGid) || "").trim() || uGid;
    return `${iPart} - ${uPart} - ${sPart}`;
  }
  return formatIusGidForDisplay(iusGid, ctx);
}

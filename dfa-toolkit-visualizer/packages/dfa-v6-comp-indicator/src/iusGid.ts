/** IUS GID separator — must match DFA Toolkit API / shared `get_ius_gid_separator` default. */
export const IUS_GID_SEP = "|";

/**
 * Build composite IUS GID from indicator, unit, and subgroup GIDs.
 * @param indicatorGid - Indicator global ID
 * @param unitGid - Unit global ID
 * @param subgroupValGid - Subgroup value global ID
 * @returns Composite IUS GID in format: indicatorGid|unitGid|subgroupValGid
 */
export function buildIusGid(
  indicatorGid: string,
  unitGid: string,
  subgroupValGid: string
): string {
  return `${indicatorGid.trim()}${IUS_GID_SEP}${unitGid.trim()}${IUS_GID_SEP}${subgroupValGid.trim()}`;
}

/**
 * Parse composite IUS GID into its components.
 * @param iusGid - Composite IUS GID string
 * @returns Tuple of [indicatorGid, unitGid, subgroupGid] or null if invalid
 */
export function parseIusGid(iusGid: string): [string, string, string] | null {
  const parts = iusGid.split(IUS_GID_SEP);
  if (parts.length !== 3) return null;
  const [i, u, s] = parts;
  if (!i.trim() || !u.trim() || !s.trim()) return null;
  return [i.trim(), u.trim(), s.trim()];
}

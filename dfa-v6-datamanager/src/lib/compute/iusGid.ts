/** IUS GID separator — must match DFA Toolkit API / shared `get_ius_gid_separator` default. */
export const IUS_GID_SEP = "|";

export function buildIusGid(
  indicatorGid: string,
  unitGid: string,
  subgroupValGid: string
): string {
  return `${indicatorGid.trim()}${IUS_GID_SEP}${unitGid.trim()}${IUS_GID_SEP}${subgroupValGid.trim()}`;
}

export function parseIusGid(iusGid: string): [string, string, string] | null {
  const parts = iusGid.split(IUS_GID_SEP);
  if (parts.length !== 3) return null;
  const [i, u, s] = parts;
  if (!i.trim() || !u.trim() || !s.trim()) return null;
  return [i.trim(), u.trim(), s.trim()];
}

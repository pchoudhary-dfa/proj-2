/** IUS GID separator — must match DFA Toolkit API / shared `get_ius_gid_separator` default. */
export declare const IUS_GID_SEP = "|";
/**
 * Build composite IUS GID from indicator, unit, and subgroup GIDs.
 * @param indicatorGid - Indicator global ID
 * @param unitGid - Unit global ID
 * @param subgroupValGid - Subgroup value global ID
 * @returns Composite IUS GID in format: indicatorGid|unitGid|subgroupValGid
 */
export declare function buildIusGid(indicatorGid: string, unitGid: string, subgroupValGid: string): string;
/**
 * Parse composite IUS GID into its components.
 * @param iusGid - Composite IUS GID string
 * @returns Tuple of [indicatorGid, unitGid, subgroupGid] or null if invalid
 */
export declare function parseIusGid(iusGid: string): [string, string, string] | null;

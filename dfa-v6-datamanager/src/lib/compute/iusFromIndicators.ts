import { getRequest } from "@/lib/api/http";
import type { IndicatorListItem, IndicatorsListResponse } from "@/lib/api/types";
import { IUS_GRID_LABEL_SEPARATOR } from "@/lib/compute/iusDisplayLabel";
import { buildIusGid } from "@/lib/compute/iusGid";
import { getDWAPIURL, REFERENCE_PATH_INDICATORS } from "@/lib/constants";

export const INDICATORS_IUS_PAGE_SIZE = 1000;

export type IusOptionRow = { id: string; label: string };

type UnitMetaLo = Record<string, { u_name?: string; unit_name?: string }>;
type SgMetaLo = Record<string, { sg_name?: string; subgroup_val_name?: string }>;

function getIndicatorName(row: IndicatorListItem): string {
  return String(row.indicator_name ?? row.i_name ?? "").trim();
}

function getIndicatorGid(row: IndicatorListItem): string {
  return String(row.indicator_gid ?? row.i_gid ?? "").trim();
}

/** Expand indicator rows (subgroup=true) into IUS gid + display label options. */
export function expandIndicatorsToIusOptions(
  indicators: IndicatorListItem[],
  unitMeta: UnitMetaLo,
  subgroupMeta: SgMetaLo,
  opts: { restrictUnitGid?: string; excludeGids?: ReadonlySet<string> } = {}
): IusOptionRow[] {
  const ru = opts.restrictUnitGid?.trim();
  const excludeSet = opts.excludeGids ?? new Set<string>();
  const out: IusOptionRow[] = [];
  for (const row of indicators) {
    const iName = getIndicatorName(row);
    const iGid = getIndicatorGid(row);
    if (!iGid) continue;
    const units = Array.isArray(row.unit_gid ?? row.u_gid)
      ? (row.unit_gid ?? row.u_gid ?? [])
      : [];
    const sgMap = row.s_gid ?? null;
    for (const u of units) {
      const uu = String(u ?? "").trim();
      if (!uu) continue;
      if (ru && uu !== ru) continue;
      const sgList = sgMap?.[uu]?.sg_gid ?? sgMap?.[uu]?.default_sg_gids ?? [];
      const unitName = String(
        unitMeta[uu]?.u_name ?? unitMeta[uu]?.unit_name ?? uu
      ).trim();
      if (sgList.length === 0) continue;
      for (const sg of sgList) {
        const sgGid = String(sg);
        if (!sgGid) continue;
        const subgroupName = String(
          subgroupMeta[sgGid]?.sg_name ??
            subgroupMeta[sgGid]?.subgroup_val_name ??
            sgGid
        ).trim();
        const iusGid = buildIusGid(iGid, uu, sgGid);
        if (excludeSet.has(iusGid)) continue;
        const label = [iName || iGid, unitName || uu, subgroupName || sgGid]
          .filter(Boolean)
          .join(IUS_GRID_LABEL_SEPARATOR);
        out.push({ id: iusGid, label });
      }
    }
  }
  return out;
}

/**
 * Paginated GET /indicators?subgroup=true — same source as ComputeIusPickerModal.
 */
export async function fetchIusOptionsFromIndicators(
  dwId: string
): Promise<IusOptionRow[]> {
  if (!dwId.trim()) return [];

  const indicators: IndicatorListItem[] = [];
  const unitMeta: UnitMetaLo = {};
  const subgroupMeta: SgMetaLo = {};
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const sp = new URLSearchParams();
    sp.set("page", String(page));
    sp.set("page_size", String(INDICATORS_IUS_PAGE_SIZE));
    sp.set("subgroup", "true");
    sp.set("default_subgroup_only", "false");
    sp.set("sort_field", "i_order");
    sp.set("sort_order", "asc");

    const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS)}?${sp}`;
    const json = (await getRequest(url, undefined, {
      suppressErrorMessage: true,
    })) as IndicatorsListResponse | { success?: false };

    if (!json || json.success !== true || !Array.isArray(json.data)) break;

    indicators.push(...json.data);
    Object.assign(unitMeta, (json.meta?.unit ?? {}) as UnitMetaLo);
    Object.assign(subgroupMeta, (json.meta?.subgroup ?? {}) as SgMetaLo);
    totalPages = json.meta?.total_pages ?? 1;
    page += 1;
  }

  const rows = expandIndicatorsToIusOptions(indicators, unitMeta, subgroupMeta);
  rows.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
  return rows;
}

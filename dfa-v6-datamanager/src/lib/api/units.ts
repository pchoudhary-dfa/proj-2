import { getRequest } from "@/lib/api/http";
import type {
  FetchUnitsParams,
  UnitRaw,
  UnitsListResponse,
  UnitsListResult,
} from "@/lib/api/types";
import { API_KEY_FORMAT, getDWAPIURL, REFERENCE_PATH_UNITS } from "@/lib/constants";

const SORT_NAME = API_KEY_FORMAT === "external" ? "u_name" : "unit_name";

export function getUnitGid(u: UnitRaw): string | null {
  return u.unit_gid ?? u.u_gid ?? null;
}

export function getUnitName(u: UnitRaw): string {
  return (u.unit_name ?? u.u_name ?? u.unit_gid ?? u.u_gid ?? "") || "";
}

export async function fetchUnits(
  dwId: string,
  params: FetchUnitsParams = {}
): Promise<UnitsListResult> {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.page_size != null) {
    searchParams.set("page_size", String(params.page_size));
  }
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.search != null && params.search !== "") {
    searchParams.set("search", params.search);
  }
  if (params.search_by) searchParams.set("search_by", params.search_by);

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_UNITS)}?${searchParams.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as UnitsListResponse | UnitsListResult;
  if ((json as UnitsListResponse).success === true) {
    return json as UnitsListResponse;
  }
  return json as UnitsListResult;
}

/**
 * Fetches all units for a warehouse across paginated GET /units responses.
 */
export async function fetchAllUnits(
  dwId: string,
  params: Omit<FetchUnitsParams, "page" | "page_size"> = {}
): Promise<UnitsListResult> {
  const pageSize = 500;
  const firstPage = await fetchUnits(dwId, {
    ...params,
    page: 1,
    page_size: pageSize,
    sort_order: params.sort_order ?? "asc",
    sort_field: params.sort_field ?? SORT_NAME,
  });
  if (!firstPage.success) return firstPage;

  const allData = [...firstPage.data];
  const { total_pages } = firstPage.meta;

  for (let page = 2; page <= total_pages; page++) {
    const next = await fetchUnits(dwId, {
      ...params,
      page,
      page_size: pageSize,
      sort_order: params.sort_order ?? "asc",
      sort_field: params.sort_field ?? SORT_NAME,
    });
    if (!next.success) return next;
    allData.push(...next.data);
  }

  return {
    ...firstPage,
    data: allData,
    meta: {
      ...firstPage.meta,
      count: allData.length,
    },
  };
}

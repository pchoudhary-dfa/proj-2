import { getRequest } from "@/lib/api/http";
import type { DataSettings } from "./types";

// ─── API Response Row ────────────────────────────────────────────────────────

export type ObservationRow = {
  dt_nid:number;
  dt_value: number | string | null;
  dt_text_value:string|null;
  dt_is_mrd:boolean;
  dt_is_planned_value:boolean;
  dt_is_textual:boolean;
  i_nid:number;
  i_gid?: string;
  i_name?: string;
  u_nid?:number;
  u_gid?: string;
  u_name?: string;
  sg_nid?:number;
  sg_name?: string;
  sg_gid?: string;
  ar_nid?:number;
  ar_name?: string;
  ar_gid?:string;
  ar_level?:number;
  ar_id?: string;
  tp_nid?:number;
  tp_timeperiod?: string;
  src_nid?: number;
  src_gid?:string;
  src_name?:string;
  fn_nid?:number;
  fn_gid?: string;
  fn_text?:string;
  u_format?:string|null;
  formatted_dt_value?:string
};


export type FetchChartDataResult = {
  rows: ObservationRow[];
  error?: string;
};

// ─── Query Builder ───────────────────────────────────────────────────────────

function buildDataQueryParams(data: DataSettings): URLSearchParams {
  const params = new URLSearchParams();
  let unitIds = [];
  const indicatorIds = data.indicators
    .map((ind) => String(ind.id).split("_")[0]);
    unitIds = data.indicators.map((ind)=>String(ind.id).split("_")[1]);
  if (indicatorIds.length > 0) {
    params.set("indicator", indicatorIds.join(","));
  }
  if(unitIds.length > 0){
    params.set("unit",unitIds.join(","));
  }

  const subgroupIds = data.subgroups
    .map((sg) => String(sg.id));
  if (subgroupIds.length > 0) {
    params.set("subgroup", subgroupIds.join(","));
  }else{
    params.set("isdefaultsubgroup","true")
  }

  const areaIds = data.areas.map((a) => String(a.id));
  if (areaIds.length > 0) {
    params.set("area", areaIds.join(","));
  }

  const timePeriodIds = data.timePeriods
    .map((tp) => String(tp.id));
  if (timePeriodIds.length > 0) {
    params.set("time_period", timePeriodIds.join(","));
  }

  return params;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function fetchChartData(
  baseUrl: string,
  data: DataSettings,
): Promise<FetchChartDataResult> {
  if (!baseUrl) {
    return { rows: [], error: "No datawarehouse configured" };
  }

  if (data.indicators.length === 0) {
    return { rows: [] };
  }

  const params = buildDataQueryParams(data);
  const url = `${baseUrl}/reports/data/published/full?${params.toString()}`;

  try {
    const response = await getRequest(url, { suppressErrorMessage: true });

    if (
      response &&
      typeof response === "object" &&
      "status_code" in response &&
      (response as { status_code: number }).status_code >= 400
    ) {
      const msg =
        (response as { message?: string }).message ??
        (response as { detail?: string }).detail ??
        "Failed to fetch data";
      return { rows: [], error: String(msg) };
    }

    const rows: ObservationRow[] = Array.isArray(response)
      ? response
      : Array.isArray((response as { data?: unknown }).data)
        ? (response as { data: ObservationRow[] }).data
        : [];

    return { rows };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

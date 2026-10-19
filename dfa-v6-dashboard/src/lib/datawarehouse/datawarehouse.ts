import { getRequest } from "@/lib/api/http";
import { getDatawarehouseListApiUrl } from "@/lib/constants";

/**
 * Raw datawarehouse item from the /dw API (snake_case).
 */
export interface DatawarehouseRaw {
  id: number;
  dw_connection_name: string;
  db_source_type?: string;
  db_database?: string;
  dw_default_language?: string;
  is_active?: boolean;
}

export interface DatawarehousesListSuccess {
  success: true;
  data: DatawarehouseRaw[];
}

/** Lean view-model for the dashboard datawarehouse grid. */
export type DatawarehouseListRow = {
  id: string;
  name: string;
  type: string;
  database: string;
  defaultLanguage: string;
  isActive: boolean;
};

export interface FetchDatawarehousesParams {
  limit?: number;
  active_only?: boolean;
}

function mapRawToRow(raw: DatawarehouseRaw): DatawarehouseListRow {
  return {
    id: String(raw.id),
    name: raw.dw_connection_name,
    type: raw.db_source_type ?? "—",
    database: raw.db_database ?? "—",
    defaultLanguage: raw.dw_default_language ?? "—",
    isActive: raw.is_active ?? false,
  };
}

export interface DatawarehouseListResult {
  rows: DatawarehouseListRow[];
  error?: string;
}

export async function fetchDatawarehouseList(
  params: FetchDatawarehousesParams = {}
): Promise<DatawarehouseListResult> {
  const { limit = 10, active_only = true } = params;

  const searchParams = new URLSearchParams({
    limit: String(limit),
    active_only: String(active_only),
  });

  const url = `${getDatawarehouseListApiUrl()}?${searchParams.toString()}`;

  try {
    const json = await getRequest(url, { suppressErrorMessage: true });

    if (json?.success === false) {
      return {
        rows: [],
        error: json.err_message ?? "Failed to fetch datawarehouses",
      };
    }

    const response = json as DatawarehousesListSuccess;
    return {
      rows: (response.data ?? []).map(mapRawToRow),
    };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

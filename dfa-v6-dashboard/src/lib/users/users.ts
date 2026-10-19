import { getRequest } from "@/lib/api/http";
import { getIamUserApiUrl } from "@/lib/constants";

/**
 * Raw user shape from the /iam/user API (snake_case).
 * Dashboard only displays a subset of these fields.
 */
export interface UserRaw {
  id: number;
  first_name: string;
  last_name?: string | null;
  username: string;
  email: string;
  status?: number | null;
  last_loggedin_on?: string | null;
}

export interface UsersListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UsersListResponse {
  success: true;
  data: UserRaw[];
  meta: UsersListMeta;
}

/** Lean view-model for the dashboard user grid. */
export type UserRow = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  lastLogin: string;
};

export interface FetchUsersParams {
  page?: number;
  page_size?: number;
  sort_field?: string;
  sort_order?: "asc" | "desc";
  search?: string;
  search_by?: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function mapUserRawToRow(raw: UserRaw): UserRow {
  return {
    id: String(raw.id),
    username: raw.username,
    firstName: raw.first_name,
    lastName: raw.last_name ?? "—",
    email: raw.email,
    lastLogin: formatDate(raw.last_loggedin_on),
  };
}

export interface UsersListResult {
  rows: UserRow[];
  meta: UsersListMeta | null;
  error?: string;
}

export async function fetchUsersList(
  params: FetchUsersParams = {}
): Promise<UsersListResult> {
  const {
    page = 1,
    page_size = 25,
    sort_field = "username",
    sort_order = "asc",
    search,
    search_by,
  } = params;

  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(page_size),
    sort_field,
    sort_order,
  });

  if (search && search_by) {
    searchParams.set("search", search);
    searchParams.set("search_by", search_by);
  }

  const url = `${getIamUserApiUrl()}?${searchParams.toString()}`;

  try {
    const json = await getRequest(url, { suppressErrorMessage: true });

    if (json?.success === false) {
      return {
        rows: [],
        meta: null,
        error: json.err_message ?? "Failed to fetch users",
      };
    }

    const response = json as UsersListResponse;
    return {
      rows: (response.data ?? []).map(mapUserRawToRow),
      meta: response.meta ?? null,
    };
  } catch (err) {
    return {
      rows: [],
      meta: null,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export const FALLBACK_USER_ROWS: UserRow[] = [
  {
    id: "user-sandeep-1",
    username: "sandeep",
    firstName: "Sandeep",
    lastName: "Kumar",
    email: "sprasad@dataforall.org",
    lastLogin: "22 May 2026, 07:14 AM",
  },
  {
    id: "user-sandeep-2",
    username: "Sandeep",
    firstName: "Sandeep",
    lastName: "Kumar",
    email: "sprasad@dataforall.org",
    lastLogin: "22 May 2026, 05:57 AM",
  },
  {
    id: "user-admin",
    username: "admin",
    firstName: "Admin",
    lastName: "-",
    email: "sysadmin@dataforall.org",
    lastLogin: "22 May 2026, 04:17 AM",
  },
];

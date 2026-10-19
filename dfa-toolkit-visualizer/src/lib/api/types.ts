/*
 * Shared response envelope and payload types for Core API (app-config, translations).
 * All responses use the same envelope; only `data` shape differs.
 */

export interface ApiSuccess<T> {
  success: true;
  code: string;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  code: string;
  message: string;
  errors?: Record<string, unknown>;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function isApiError<T>(res: ApiResponse<T>): res is ApiError {
  return res.success === false;
}

/** Single app-config row from GET /app-config. */
export interface AppConfigEntry {
  value: string;
  description?: string;
}

/** App config: each key is either a plain string (legacy) or API `{ value, description }`. */
export type AppConfigData = Record<string, string | AppConfigEntry>;

/** Translations: code -> display text (flat string map). */
export type TranslationsData = Record<string, string>;

/** A row from GET /system-language (active UI languages configured on the backend). */
export interface SystemLanguageEntry {
  id: number;
  locale: string;
  name: string | null;
  description: string | null;
  is_rtl: boolean;
  is_default: boolean;
}

/** Search sync job reference returned by POST /search/sync. */
export interface SearchSyncJobRef {
  dw_id: string;
  job_type: string;
  db_job_id: number | null;
  celery_task_id: string | null;
}

/** Search sync job status returned by GET /search/sync/status. */
export interface SearchSyncJobStatus {
  job_status: "pending" | "processing" | "completed" | "failed";
  job_type: string | null;
  db_job_id: number | null;
  celery_task_id: string | null;
  result: unknown;
  last_error: string | null;
  completed_at: string | null;
}

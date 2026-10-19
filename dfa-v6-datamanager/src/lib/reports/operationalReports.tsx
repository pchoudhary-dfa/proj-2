import type { SelectFieldOption } from "@/components/SelectField";

// ---------------------------------------------------------------------------
// Operational Reports — column configs, status mappers, and registry.
//
// Data is fetched from the backend at runtime. Each config carries an
// `apiSlug` used to build the endpoint URL:
//   GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/{apiSlug}
// ---------------------------------------------------------------------------

type TFn = (key: string, fallback: string) => string;

export type OperationalColumn = {
  /** Row field key (must match the API response field name). */
  key: string;
  /** Translation key for the column header. */
  tKey: string;
  /** English fallback for the column header. */
  fallback: string;
  /** Optional fixed width; falls back to a sensible default in the page. */
  width?: number;
  /** Renders a per-column search box in the filter row (client-side filter). */
  searchable?: boolean;
  /** Renders a 3-state sort header (client-side sort). */
  sortable?: boolean;
  /**
   * When set, the header label is driven by `column_labels` from the API
   * response instead of `tKey`/`fallback`:
   *   "area"   → column_labels.district_label
   *   "parent" → column_labels.state_label
   */
  areaRole?: "area" | "parent";
  /** With `areaRole`, append a translated "Assigned" suffix (people reports). */
  areaAssigned?: boolean;
  /**
   * When set, the cell renders `{val} ({row[parentKey]})` — used in people
   * reports (R3/R4) to show region inline instead of a separate column.
   */
  parentKey?: string;
};

export type OperationalReportConfig = {
  /** localStorage persistence value and dropdown key. */
  value: string;
  /** URL slug appended to the base operational-reports path. */
  apiSlug: string;
  /** Translation key for the report name (dropdown option). */
  tKey: string;
  /** English fallback for the report name. */
  fallback: string;
  columns: OperationalColumn[];
};

// ---------------------------------------------------------------------------
// Status integer → display label mappers
// ---------------------------------------------------------------------------

const SUBMISSION_STATUS_MAP: Record<number, { tKey: string; fallback: string }> = {
  0: { tKey: "NOT_SUBMITTED", fallback: "Not Submitted" },
  1: { tKey: "SUBMITTED",     fallback: "Submitted" },
};

const ACTION_NEEDED_MAP: Record<number, { tKey: string; fallback: string }> = {
  0: { tKey: "NO_ACTION",          fallback: "No action" },
  1: { tKey: "PENDING_REVISION",   fallback: "Pending Revision" },
  2: { tKey: "PENDING_SUBMISSION", fallback: "Pending Submission" },
};

const REVIEW_STATUS_MAP: Record<number, { tKey: string; fallback: string }> = {
  0: { tKey: "APPROVED",       fallback: "Approved" },
  1: { tKey: "PENDING_REVIEW", fallback: "Pending review" },
  2: { tKey: "REVISION",       fallback: "Revision" },
};

export function getSubmissionStatusLabel(value: unknown, t: TFn): string {
  const entry = SUBMISSION_STATUS_MAP[Number(value)];
  return entry ? t(entry.tKey, entry.fallback) : String(value ?? "");
}

export function getActionNeededLabel(value: unknown, t: TFn): string {
  const entry = ACTION_NEEDED_MAP[Number(value)];
  return entry ? t(entry.tKey, entry.fallback) : String(value ?? "");
}

export function getReviewStatusLabel(value: unknown, t: TFn): string {
  const entry = REVIEW_STATUS_MAP[Number(value)];
  return entry ? t(entry.tKey, entry.fallback) : String(value ?? "");
}

// ---------------------------------------------------------------------------
// 1. Data Submission Status Report
// ---------------------------------------------------------------------------

const DATA_SUBMISSION_STATUS: OperationalReportConfig = {
  value: "operational/area-submission-status",
  apiSlug: "area-submission-status",
  tKey: "DATA_SUBMISSION_STATUS_REPORT",
  fallback: "Area Submission Status Report",
  columns: [
    { key: "state_name",        tKey: "REGION",            fallback: "Region",            width: 150, searchable: true, sortable: true, areaRole: "parent" },
    { key: "district_name",     tKey: "AREA",              fallback: "Area",              width: 160, searchable: true, sortable: true, areaRole: "area" },
    { key: "dataset_name",      tKey: "DATASET",           fallback: "Dataset",           width: 200, searchable: true, sortable: true },
    { key: "submission_status", tKey: "SUBMISSION_STATUS", fallback: "Submission Status", width: 150 },
    { key: "submitted_by",      tKey: "SUBMITTED_BY",      fallback: "Submitted By",      width: 170, searchable: true, sortable: true },
    { key: "date_submitted",    tKey: "DATE_SUBMITTED",    fallback: "Date Submitted",    width: 140, sortable: true },
    { key: "last_updated",      tKey: "LAST_UPDATED",      fallback: "Last Updated",      width: 160, sortable: true },
    { key: "action_needed",     tKey: "ACTION_NEEDED",     fallback: "Action Needed",     width: 160 },
  ],
};

// ---------------------------------------------------------------------------
// 2. Review Status Report
// ---------------------------------------------------------------------------

const REVIEW_STATUS: OperationalReportConfig = {
  value: "operational/review-status",
  apiSlug: "review-status",
  tKey: "REVIEW_STATUS_REPORT",
  fallback: "Review Status Report",
  columns: [
    { key: "state_name",        tKey: "REGION",            fallback: "Region",            width: 150, searchable: true, sortable: true, areaRole: "parent" },
    { key: "district_name",     tKey: "AREA",              fallback: "Area",              width: 160, searchable: true, sortable: true, areaRole: "area" },
    { key: "dataset_name",      tKey: "DATASET",           fallback: "Dataset",           width: 200, searchable: true, sortable: true },
    { key: "review_status",     tKey: "REVIEW_STATUS",     fallback: "Review Status",     width: 150 },
    { key: "reviewer_assigned", tKey: "REVIEWER_ASSIGNED", fallback: "Reviewer Assigned", width: 180, searchable: true, sortable: true },
    { key: "date_submitted",    tKey: "DATE_SUBMITTED",    fallback: "Date Submitted",    width: 140, sortable: true },
    { key: "date_returned",     tKey: "DATE_RETURNED",     fallback: "Date Returned",     width: 140, sortable: true },
    { key: "date_approved",     tKey: "DATE_APPROVED",     fallback: "Date Approved",     width: 140, sortable: true },
  ],
};

// ---------------------------------------------------------------------------
// 3. Data Reporter Report
// ---------------------------------------------------------------------------

const DATA_REPORTER: OperationalReportConfig = {
  value: "operational/data-reporter",
  apiSlug: "data-reporter",
  tKey: "DATA_REPORTER_REPORT",
  fallback: "Data Reporter Report",
  columns: [
    { key: "reporter_name",     tKey: "REPORTER_NAME",  fallback: "Reporter Name",  width: 180, searchable: true, sortable: true },
    { key: "institution",       tKey: "INSTITUTION",    fallback: "Institution",    width: 200, searchable: true, sortable: true },
    { key: "role",              tKey: "ROLE",           fallback: "Role",           width: 140, searchable: true, sortable: true },
    { key: "email",             tKey: "EMAIL",          fallback: "Email",          width: 160, searchable: true, sortable: true },
    { key: "phone",             tKey: "PHONE_NUMBER",   fallback: "Phone Number",   width: 160, searchable: true },
    { key: "district_assigned", tKey: "AREA_ASSIGNED",  fallback: "Area Assigned",  width: 200, searchable: true, sortable: true, areaRole: "area", areaAssigned: true, parentKey: "state_assigned" },
    { key: "last_login",        tKey: "LAST_LOGIN",     fallback: "Last Login",     width: 160 },
  ],
};

// ---------------------------------------------------------------------------
// 4. Data Reviewer Report
// ---------------------------------------------------------------------------

const DATA_REVIEWER: OperationalReportConfig = {
  value: "operational/data-reviewer",
  apiSlug: "data-reviewer",
  tKey: "DATA_REVIEWER_REPORT",
  fallback: "Data Reviewer Report",
  columns: [
    { key: "reviewer_name",     tKey: "REVIEWER_NAME", fallback: "Reviewer Name", width: 180, searchable: true, sortable: true },
    { key: "institution",       tKey: "INSTITUTION",   fallback: "Institution",   width: 200, searchable: true, sortable: true },
    { key: "role",              tKey: "ROLE",          fallback: "Role",          width: 140, searchable: true, sortable: true },
    { key: "email",             tKey: "EMAIL",         fallback: "Email",         width: 160, searchable: true, sortable: true },
    { key: "phone",             tKey: "PHONE_NUMBER",  fallback: "Phone Number",  width: 160, searchable: true },
    { key: "district_assigned", tKey: "AREAS_ASSIGNED", fallback: "Areas Assigned", width: 200, searchable: true, sortable: true, areaRole: "area", areaAssigned: true, parentKey: "state_assigned" },
    { key: "last_login",        tKey: "LAST_LOGIN",    fallback: "Last Login",    width: 160 },
  ],
};

// ---------------------------------------------------------------------------
// 5. Data Completeness Report
// ---------------------------------------------------------------------------

const DATA_COMPLETENESS: OperationalReportConfig = {
  value: "operational/data-completeness",
  apiSlug: "data-completeness",
  tKey: "DATA_COMPLETENESS_REPORT",
  fallback: "Data Completeness Report",
  columns: [
    { key: "state_assigned",       tKey: "REGION",                fallback: "Region",                width: 150, searchable: true, sortable: true, areaRole: "parent" },
    { key: "district_assigned",    tKey: "AREA",                  fallback: "Area",                  width: 160, searchable: true, sortable: true, areaRole: "area" },
    { key: "dataset",              tKey: "DATASET",               fallback: "Dataset",               width: 200, searchable: true, sortable: true },
    { key: "submission_status",    tKey: "SUBMISSION_STATUS",     fallback: "Submission Status",     width: 150 },
    { key: "expected_data_points", tKey: "EXPECTED_DATA_POINTS",  fallback: "Expected Data Points",  width: 160, sortable: true },
    { key: "received_data_points", tKey: "RECEIVED_DATA_POINTS",  fallback: "Received Data Points",  width: 160, sortable: true },
    { key: "completeness_rate",    tKey: "COMPLETENESS_RATE",     fallback: "Completeness Rate",     width: 150, sortable: true },
    { key: "missing_footnotes",    tKey: "MISSING_FOOTNOTES",     fallback: "Missing Footnotes",     width: 150, sortable: true },
  ],
};

// ---------------------------------------------------------------------------
// Registry + helpers
// ---------------------------------------------------------------------------

export const OPERATIONAL_REPORTS: OperationalReportConfig[] = [
  DATA_SUBMISSION_STATUS,
  REVIEW_STATUS,
  DATA_REPORTER,
  DATA_REVIEWER,
  DATA_COMPLETENESS,
];

export function getOperationalReportOptions(t: TFn): SelectFieldOption[] {
  return OPERATIONAL_REPORTS.map(({ value, tKey, fallback }) => ({ value, label: t(tKey, fallback) }));
}

export const OPERATIONAL_REPORT_DEFAULT_VALUE = OPERATIONAL_REPORTS[0]?.value ?? "";

export function getOperationalReportConfig(value: string): OperationalReportConfig | undefined {
  return OPERATIONAL_REPORTS.find((r) => r.value === value);
}

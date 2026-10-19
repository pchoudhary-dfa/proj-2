/**
 * Shared API types for the DFA Data Manager.
 * Extracted from reference.ts — organized by domain.
 */

// =============================================================================
// Datawarehouses
// =============================================================================

export interface DatawarehouseListItem {
  id: number;
  dw_connection_name: string;
  db_source_type?: string;
  db_host_address?: string;
  db_user?: string;
  db_port?: string | number | null;
  db_database?: string;
  dw_default_language?: string;
  is_active?: boolean;
  created?: string | null;
  created_user_id?: number | null;
  modified?: string | null;
  modified_user_id?: number | null;
  modified_by_username?: string | null;
  has_sql_dump?: boolean;
}

export interface DatawarehousesListSuccess {
  success: true;
  message: string;
  data: DatawarehouseListItem[];
}

export interface DatawarehousesListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type DatawarehousesListResponse =
  | DatawarehousesListSuccess
  | DatawarehousesListError;

export interface FetchDatawarehousesParams {
  skip?: number;
  limit?: number;
  active_only?: boolean;
}

export interface CreateDatawarehouseNewPayload {
  db_connection_name: string;
  db_database: string;
  db_host: string;
  db_login: string;
  db_password: string;
  db_port: number;
  db_source: string;
}

export interface CreateDatawarehouseExistingPayload {
  dw_connection_name: string;
  db_source_type: string;
  db_host_address: string;
  db_user: string;
  db_password: string;
  db_port: string;
  db_database: string;
  dw_default_language: string;
  is_active: boolean;
  dw_metadata_desc: string;
  created_user_id: number;
  modified_user_id: number;
}

export interface CreateDatawarehouseExistingOptions {
  test_connection_only?: boolean;
}

export interface UpdateDatawarehousePayload {
  dw_connection_name: string;
  db_source_type: string;
  db_host_address: string;
  db_user: string;
  db_password: string;
  db_port: string;
  db_database: string;
  dw_default_language: string;
  is_active: boolean;
  dw_metadata_desc: string;
  modified_user_id: number;
  dw_data_count: number;
  dw_area_count: number;
  dw_ind_count: number;
  dw_ius_count: number;
  dw_time_count: number;
}

export interface DatawarehouseMutationSuccess {
  success: true;
  message?: string;
  data?: Record<string, unknown> | Record<string, unknown>[] | null;
}

export interface DatawarehouseMutationError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
  status?: number;
}

export type DatawarehouseMutationResult =
  | DatawarehouseMutationSuccess
  | DatawarehouseMutationError;

export interface DatawarehouseConnectionTestData {
  connected?: boolean;
  message?: string;
}

export interface DatawarehouseMetadataData {
  dbmtd_areacnt?: number | null;
  dbmtd_indcnt?: number | null;
  dbmtd_iuscnt?: number | null;
  dbmtd_timecnt?: number | null;
  dbmtd_srccnt?: number | null;
  dbmtd_datacnt?: number | null;
  description?: string | null;
  publication_date?: string | null;
  published_by?: string | null;
  db_version?: string | null;
  /** Present when GET dbmetadata is called with `?isLang=true` */
  languages?: DatawarehouseLanguageItem[];
}

export interface DatawarehouseMetadataSuccess {
  success: true;
  message?: string;
  data: DatawarehouseMetadataData;
}

export interface DatawarehouseMetadataError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type DatawarehouseMetadataResult =
  | DatawarehouseMetadataSuccess
  | DatawarehouseMetadataError;

export interface UpdateDatawarehouseMetadataPayload {
  description: string;
}

export type UpdateDatawarehouseMetadataResult =
  | {
      success: true;
      message?: string;
      data?: DatawarehouseMetadataData | null;
    }
  | {
      success: false;
      err_message?: string;
      errors?: Record<string, unknown>;
      status?: number;
    };

export interface DatawarehouseLanguageItem {
  lang_nid?: number;
  lang_name?: string;
  lang_code?: string;
  lang_is_default?: boolean;
  lang_is_global_lock?: boolean;
}

export interface DatawarehouseLanguagesSuccess {
  success: true;
  message?: string;
  data: DatawarehouseLanguageItem[];
}

export interface DatawarehouseLanguagesError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type DatawarehouseLanguagesResult =
  | DatawarehouseLanguagesSuccess
  | DatawarehouseLanguagesError;

export interface DatawarehouseUserRoleMeta {
  id: number;
  role_code: string;
  is_super_admin?: number | boolean;
  is_system_role?: number | boolean;
  name?: string;
  description?: string;
}

export interface DatawarehouseUserListItem {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  organisation?: string | null;
  location?: string | null;
  status?: number | null;
  email_verified?: boolean | null;
  created?: string | null;
  last_loggedin_on?: string | null;
  roles?: string[];
}

export interface DatawarehouseUsersMeta {
  total_count: number;
  total_count_unfiltered?: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  roles?: Record<string, DatawarehouseUserRoleMeta>;
}

export interface DatawarehouseUsersSuccess {
  success: true;
  message?: string;
  data: DatawarehouseUserListItem[];
  meta: DatawarehouseUsersMeta;
}

export interface DatawarehouseUsersError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type DatawarehouseUsersResult =
  | DatawarehouseUsersSuccess
  | DatawarehouseUsersError;

export interface IamRoleItem {
  id: number;
  app_key?: string;
  role_code: string;
  is_super_admin?: number | boolean;
  is_system_role?: number | boolean;
  display_order?: number;
  name?: string;
  description?: string;
}

export interface IamRolesMeta {
  total_count: number;
  total_count_unfiltered?: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface IamRolesSuccess {
  success: true;
  message?: string;
  data: IamRoleItem[];
  meta?: IamRolesMeta;
}

export interface IamRolesError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type IamRolesResult = IamRolesSuccess | IamRolesError;

// =============================================================================
// Datasets
// =============================================================================

export type DatasetStage = {
  stage_id: number;
  workflow_review_level_id: number;
  level_no: number;
  stage_status: "COMPLETED" | "ACTIVE" | "PENDING";
  approved_by_username?: string | null;
};

export type DatapointReadiness = "CREATED" | "UPDATED" | "COMPLETED" | "FAILED";

export type DataPointsImportResult = {
  total_rows?: number;
  updated?: number;
  skipped_locked?: number;
  skipped_no_id?: number;
  import_async?: boolean;
  estimated_rows?: number;
  request_id?: string;
  total_batches?: number;
  datapoint_readiness?: DatapointReadiness | string;
  errors?: Array<{ data_point_id?: number; error?: string; detail?: string }>;
};

export type DataPointsImportLogSummary = {
  request_id: string;
  started_at: string | null;
  finished_at: string | null;
  total_batches: number;
  completed_batches: number;
  failed_batches: number;
  pending_batches: number;
  total_updated: number;
  total_skipped_locked: number;
  overall_status: string;
};

export type ImportBatchJobLog = {
  job_id: number;
  batch_index: number;
  job_status: string;
  result: Record<string, unknown> | null;
  last_error: string | null;
  completed_at: string | null;
  created_at: string | null;
};

export type DataPointsImportLogDetail = DataPointsImportLogSummary & {
  batches: ImportBatchJobLog[];
};

export type DatasetListItem = {
  dataset_id: number;
  dataset_gid: string;
  dataset_name: string;
  dw_id: number;
  workflow_id: number;
  workflow_name?: string;
  dataset_status: string;
  area_nids?: number[];
  indicator_nids?: number[];
  unit_nids?: number[];
  subgroup_val_nids?: number[];
  ius_nids?: number[];
  timeperiod_nids?: number[];
  source_nids?: number[];
  revision_count?: number;
  data_point_count?: number;
  missing_data_count?: number;
  datapoint_readiness?: string;
  last_returned_at?: string | null;
  returned_by_username?: string | null;
  submitted_at?: string | null;
  submitted_by_username?: string | null;
  approved_on?: string | null;
  approved_by_username?: string | null;
  cmnt_cnt?: number;
  created?: string | null;
  created_user_id?: number;
  created_username?: string | null;
  stages?: DatasetStage[];
};

export type DatasetsListResult = {
  success: boolean;
  message?: string;
  err_message?: string;
  data?: { datasets?: DatasetListItem[] };
};

// ── Operational Dashboard report (GET /dw/{dw_id}/reports/operational-dashboard) ──
export type OperationalDashboardSummary = {
  expected_districts: number;
  total_datasets: number;
  submitted_datasets: number;
  not_submitted: number;
  under_review: number;
  returned_for_revision: number;
  approved: number;
};

export type OperationalDashboardDatasetItem = {
  dataset_id: number;
  dataset_name: string;
  dataset_gid: string;
  dataset_status: string;
  area_dp_total: number;
  area_dp_missing: number;
  completeness_pct: number | null;
  created?: string | null;
  submitted_at?: string | null;
  submitted_by_name?: string | null;
  timeperiod_nid?: number | null;
};

export type OperationalDashboardAreaRow = {
  area_nid: number;
  area_name: string;
  area_gid: string;
  parent_area_nid?: number | null;
  parent_area_name?: string | null;
  submitted_dataset_count: number;
  approved_count: number;
  under_review_count: number;
  returned_count: number;
  draft_count: number;
  completeness_pct: number | null;
  last_updated?: string | null;
  datasets: OperationalDashboardDatasetItem[];
};

export type CompletenessBarItem = {
  area_nid: number;
  area_name: string;
  completeness_pct: number | null;
};

export type OperationalDashboardResponse = {
  summary: OperationalDashboardSummary;
  area_level?: number | null;
  area_level_name?: string | null;
  parent_level?: number | null;
  parent_level_name?: string | null;
  selected_timeperiod_nid?: number | null;
  areas: OperationalDashboardAreaRow[];
  completeness_by_district?: CompletenessBarItem[];
  completeness_by_state?: CompletenessBarItem[];
};

export type OperationalDashboardResult = {
  success: boolean;
  message?: string;
  err_message?: string;
  status_code?: number;
  errors?: { code?: string } | null;
  data?: OperationalDashboardResponse;
};

// ── Operational Reports (GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/{slug}) ──

export type OperationalReportColumnLabels = {
  state_label: string | null;
  district_label: string | null;
};

export type OperationalReportMeta = {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type AreaSubmissionStatusRow = {
  sno: number;
  current_timeperiod: string | null;
  state_name: string | null;
  district_name: string | null;
  dataset_name: string;
  submission_status: number;
  date_submitted: string | null;
  submitted_by: string | null;
  last_updated: string | null;
  action_needed: number;
};

export type ReviewStatusRow = {
  sno: number;
  current_timeperiod: string | null;
  state_name: string | null;
  district_name: string | null;
  dataset_name: string;
  date_submitted: string | null;
  reviewer_assigned: string | null;
  review_status: number;
  date_returned: string | null;
  date_approved: string | null;
};

export type DataReporterRow = {
  sno: number;
  reporter_name: string | null;
  email: string | null;
  phone: string | null;
  institution: string | null;
  role: string | null;
  state_assigned: string | null;
  district_assigned: string | null;
  current_timeperiod: string | null;
  last_login: string | null;
  last_submission: string | null;
};

export type DataReviewerRow = {
  sno: number;
  reviewer_name: string | null;
  email: string | null;
  phone: string | null;
  institution: string | null;
  role: string | null;
  state_assigned: string | null;
  district_assigned: string | null;
  current_timeperiod: string | null;
  datasets_assigned_count: number;
  last_login: string | null;
};

export type DataCompletenessRow = {
  sno: number;
  current_timeperiod: string | null;
  state_assigned: string | null;
  district_assigned: string | null;
  dataset: string | null;
  submission_status: number;
  expected_data_points: number;
  received_data_points: number;
  completeness_rate: number;
  missing_footnotes: number | null;
};

export type OperationalReportRow =
  | AreaSubmissionStatusRow
  | ReviewStatusRow
  | DataReporterRow
  | DataReviewerRow
  | DataCompletenessRow;

export type OperationalReportData<T = OperationalReportRow> = {
  column_labels: OperationalReportColumnLabels;
  current_timeperiod_label: string | null;
  rows: T[];
};

export type OperationalReportResult<T = OperationalReportRow> = {
  success: boolean;
  message?: string;
  err_message?: string;
  status_code?: number;
  errors?: { code?: string } | null;
  data?: OperationalReportData<T>;
  meta?: OperationalReportMeta;
};

export type DatasetCreateResult = {
  success: boolean;
  message?: string;
  err_message?: string;
  data?: {
    dataset_id?: number;
    dataset_name?: string;
    datapoint_readiness?: string;
  };
};

export type DatasetPatchPayload = {
  dataset_name?: string;
  status?: string;
  area_nids?: number[];
  ius_nids?: number[];
  timeperiod_nids?: number[];
  source_nids?: number[];
};

export type DatasetPatchResult = {
  success: boolean;
  message?: string;
  err_message?: string;
  data?: Record<string, unknown>;
};

export type DatasetReviewDecisionItem = {
  data_point_id: number;
  comment?: string;
};

export type DatasetReviewPayload = {
  approved?: DatasetReviewDecisionItem[];
  rejected?: DatasetReviewDecisionItem[];
  status?: string;
};

export type DatasetReviewResult = {
  success: boolean;
  message?: string;
  err_message?: string;
  data?: Record<string, unknown>;
};

export type DatasetComment = {
  comment_id: number;
  dataset_id: number;
  data_point_id: number | null;
  commenter_role: string;
  comment_text: string;
  created_user_id?: number | null;
  created_username?: string | null;
  username?: string | null;
  status?: string;
  created: string;
};

export type DatasetCommentsListResult = {
  success: boolean;
  message?: string;
  data?: DatasetComment[];
};

export type DatasetCommentPostPayload = {
  comment_text: string;
  data_point_id?: number;
};

export type DatasetCommentPostResult = {
  success: boolean;
  message?: string;
};

export interface DataPointsMeta {
  dataset_id?: number;
  dataset_status?: string;
  total_count?: number;
  total_pages?: number;
  pending_count?: number;
  approved_count?: number;
  rejected_count?: number;
  new_count?: number;
  ut_baseline_queried?: boolean;
  prev_timeperiod_nid?: number | null;
  [key: string]: unknown;
}

export interface DataPointsRow {
  dt_nid?: number;
  ius_nid?: number;
  tp_nid?: number;
  ar_nid?: number;
  dt_start_date?: string;
  dt_end_date?: string;
  dt_denominator?: number;
  fn_nid?: number;
  ic_nid?: number;
  i_nid?: number;
  u_nid?: number;
  sg_nid?: number;
  ic_ius_order?: number;
  dt_text_value?: string;
  dt_is_textual?: boolean;
  dt_value?: number;
  i_name?: string;
  i_gid?: string;
  u_name?: string;
  u_gid?: string;
  sg_name?: string;
  sg_gid?: string;
  ar_id?: string;
  ar_name?: string;
  tp_timeperiod?: string;
  ius_gid?: string;
  src_name?: string;
  /** Source numeric id from API (preferred for PATCH). */
  src_nid?: number | null;
  footnote?: string;
  data_point_id?: number;
  dataset_id?: number;
  data_entry_note?: string;
  approved_value?: number;
  approved_textual_value?: string;
  source?: string;
  source_nid?: number | null;
  review_status?: string;
  is_locked?: boolean;
  prev_timeperiod_nid?: number | null;
  prev_tmprd_data_value?: number | null;
  prev_tmprd_textual_data_value?: string | null;
  cmnt_cnt?: number;
  is_deleted?: boolean;
  [key: string]: unknown;
}

export type DataPointsGetResult = {
  success: boolean;
  message?: string;
  err_message?: string;
  data?: DataPointsRow[];
  meta?: DataPointsMeta;
};

export interface DataPointsPatchItem {
  data_point_id?: number;
  i_nid?: number;
  i_gid?: string;
  u_nid?: number;
  u_gid?: string;
  sg_nid?: number;
  sg_gid?: string;
  tp_nid?: number;
  ar_nid?: number;
  ar_id?: string;
  /** User / row footnote text (API key `footnote`, not `fn`). */
  footnote?: string;
  ic_nid?: number;
  ic_gid?: string;
  /** Data cell (string form; do not send data_value/textual_data_value with this). */
  dt_value?: string;
  ius_nid?: number;
  data_entry_note?: string;
}

export type DataPointsPatchPayload = {
  dataset_id: number;
  data_points: DataPointsPatchItem[];
};

export type DataPointsPatchResult = {
  success: boolean;
  message?: string;
  err_message?: string;
  data?: unknown;
  meta?: Record<string, unknown>;
};

// =============================================================================
// Workflows
// =============================================================================

export interface WorkflowListItem {
  workflow_id: number;
  dw_id: number;
  workflow_code: string;
  workflow_name: string;
  review_scope_type?: string;
  description?: string | null;
  start_workflow_review_level_id?: number | null;
  review_level_count: number;
  priority: number;
  is_active: boolean;
  is_system: boolean;
  allow_review: boolean;
  in_progress_dataset_cnt?: number;
  constraint_data_entry?: boolean;
  created?: string;
  created_user_id?: number;
  modified?: string;
  modified_user_id?: number;
  dataset_count?: number;
}

export interface WorkflowsListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface WorkflowsListResponse {
  success: true;
  message?: string;
  data: WorkflowListItem[];
  meta: WorkflowsListMeta;
}

export interface WorkflowsListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type WorkflowsListResult = WorkflowsListResponse | WorkflowsListError;

export interface FetchWorkflowsParams {
  page?: number;
  page_size?: number;
  is_active?: boolean | string;
  allow_review?: boolean | string;
  search?: string;
  search_by?: string;
  sort_by?: "name" | "allow_review" | "review_stage" | "created_on";
  sort_order?: "asc" | "desc";
}

export type CreateWorkflowPayload = {
  workflow_code?: string;
  workflow_name: string;
  review_scope_type?: string;
  priority?: number;
  description?: string;
  is_active?: boolean;
  is_system?: boolean;
  allow_review?: boolean;
  constraint_data_entry?: boolean;
  review_level_count?: number;
};

export type UpdateWorkflowPayload = {
  workflow_name?: string;
  review_scope_type?: string;
  priority?: number;
  description?: string;
  is_active?: boolean;
  start_workflow_review_level_id?: number;
  allow_review?: boolean;
  constraint_data_entry?: boolean;
  review_level_count?: number;
};

export type WorkflowMutationSuccess = {
  success: true;
  message?: string;
  data?: string;
  meta?: Record<string, unknown>;
};

export type WorkflowMutationError = {
  success: false;
  err_message?: string;
  data?: string;
  errors?: Record<string, unknown>;
};

export type WorkflowMutationResult =
  | WorkflowMutationSuccess
  | WorkflowMutationError;

export interface WorkflowGetByIdSuccess {
  success: true;
  message?: string;
  data: WorkflowListItem;
}

export interface WorkflowGetByIdError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type WorkflowGetByIdResult =
  | WorkflowGetByIdSuccess
  | WorkflowGetByIdError;

export type WorkflowAreaLevelRaw = {
  al_nid: number;
  al_level: number;
  al_name: string;
};

export type WorkflowAreaLevelsResult = {
  success: boolean;
  data?: WorkflowAreaLevelRaw[];
  err_message?: string;
};

export type WorkflowLevelRaw = {
  workflow_review_level_id: number;
  workflow_id: number;
  level_no: number;
  level_name: string;
  review_scope_type: string;
  area_level: number;
  role_id?: number;
  classification_parent_nid?: number | null;
  include_children?: boolean;
  is_final_level?: boolean;
  is_active?: boolean;
  created?: string;
};

export type WorkflowLevelsListResult = {
  success: boolean;
  message?: string;
  data?: WorkflowLevelRaw[];
  err_message?: string;
};

export type WorkflowLevelUpsertPayload = {
  level_no: number;
  level_name: string;
  review_scope_type: string;
  area_level?: number;
  role_id: number;
  classification_parent_nid: number;
  include_children: boolean;
  is_final_level: boolean;
  is_active: boolean;
};

export type WorkflowLevelMutationResult = {
  success: boolean;
  message?: string;
  data?: WorkflowLevelRaw[];
  err_message?: string;
};

export type IamRolesFetchResult = {
  success: boolean;
  data?: IamRoleItem[];
  err_message?: string;
};

export type DataEntryConfig = {
  workflow_id: number;
  dataentry_rule_id: number | null;
  scope_timeperiod: string | null;
  scope_indicator: string | null;
  scope_area: string | null;
  timeperiod_frequency: string | null;
  curr_timeperiod_nid?: number | null;
  area_level: number | null;
  allow_child_areas: boolean;
  show_previous_time: boolean;
  role_id: number | null;
};

export type UpsertDataEntryPayload = {
  scope_timeperiod: string;
  scope_indicator: string;
  scope_area: string;
  timeperiod_frequency: string;
  area_level: number;
  allow_child_areas: boolean;
  show_previous_time: boolean;
  role_id: number | null;
  curr_timeperiod_nid?: number | null;
};

export type DataEntryGetResult = {
  success: boolean;
  message?: string;
  data?: DataEntryConfig;
  meta?: {
    workflow?: {
      allow_review?: boolean;
    };
  };
  err_message?: string;
};

export type WorkflowConfigTab = "workflow" | "data_entry" | "users";

export type WorkflowUsersSubTab = "data_entry" | "reviewers";

export type WorkflowUsersViewFilter = "all" | "assigned" | "unassigned";

export type WorkflowUserAreaRow = {
  id: string;
  areaLabel: string;
  /** Area code (`ar_id`) shown in assignment table/filter labels. */
  areaCode?: string;
  /** IAM user id as string; empty when unassigned. */
  userId: string;
  email: string;
  assigned: boolean;
  /** Parent area `ar_nid` when row comes from API; used to filter by parent-level area. */
  parentAreaNid?: number | null;
  /** Server `iam_user_role_content.id` when this area has a workflow assignment. */
  assignmentId?: number | null;
  /** User id last merged from GET; used with `userId` to detect unsaved edits. */
  baselineUserId?: string;
  /** Per-stage reviewer assignments keyed by stage key (reviewers sub-tab only). */
  reviewerAssignments?: Record<string, WorkflowReviewerStageAssignment>;
};

export type WorkflowReviewerStageAssignment = {
  userId: string;
  email: string;
  assigned: boolean;
  assignmentId?: number | null;
  baselineUserId?: string;
};

/** Workflow user-content assignment scope (API). */
export type WorkflowUserAssignmentScopeType =
  | "AREA"
  | "INDICATOR"
  | "INDICATOR_CLASSIFICATION"
  | "TIMEPERIOD";

export type WorkflowUserAssignmentItem = {
  id: number;
  workflow_id: number;
  user_role_id: number;
  user_id: number;
  role_id: number;
  resource_code: string;
  scope_type: string;
  content_id: number;
  created: string;
  created_user_id: number;
};

export type WorkflowUserAssignmentUpsertItem = {
  user_id: number;
  role_id: number;
  content_nid: number;
  scope_type: WorkflowUserAssignmentScopeType;
  allow_child_areas: boolean,
};

export type WorkflowUserAssignmentsListSuccess = {
  success: true;
  message?: string;
  data?: WorkflowUserAssignmentItem[];
  meta?: Record<string, unknown>;
};

export type WorkflowUserAssignmentsListError = {
  success: false;
  err_message?: string;
  data?: unknown;
  errors?: unknown;
};

export type WorkflowUserAssignmentsListResult =
  | WorkflowUserAssignmentsListSuccess
  | WorkflowUserAssignmentsListError;

export type WorkflowUserAssignmentsUpsertSuccess = {
  success: true;
  message?: string;
  data?: WorkflowUserAssignmentItem[];
  meta?: Record<string, unknown>;
};

export type WorkflowUserAssignmentsUpsertError = {
  success: false;
  err_message?: string;
  data?: unknown;
  errors?: unknown;
};

export type WorkflowUserAssignmentsUpsertResult =
  | WorkflowUserAssignmentsUpsertSuccess
  | WorkflowUserAssignmentsUpsertError;

export type ReviewLevelDetailRow = {
  levelId?: number;
  levelNo?: number;
  name: string;
  scope: string;
  areaLevel: string;
  reviewerRole: string;
};

export type WorkflowSortColumnId =
  | "name"
  | "allow_review"
  | "review_levels"
  | "created";

export type WorkflowListSortState = {
  columnId: WorkflowSortColumnId | null;
  direction: "asc" | "desc" | null;
};

export type WorkflowSelectOption = {
  value: string;
  label: string;
};

export interface FetchDatawarehouseUsersParams {
  page?: number;
  page_size?: number;
  sort_field?: string;
  sort_order?: "asc" | "desc";
  search?: string;
  /**
   * GET /dw/{dw_id}/users — restrict `search` to a single column: username, email,
   * first_name, last_name, phone, organisation, location, status (0 or 1), or role_code.
   * Requires `search`; omit to search the default fields.
   */
  search_by?: string;
  view?: "flat" | "group_by";
  /** GET /dw/{dw_id}/users — filter by role code(s), comma-separated if multiple. */
  role_code?: string;
}

// =============================================================================
// Indicators
// =============================================================================

export type SgidMap = Record<
  string,
  {
    sg_gid?: string[];
    /** All defaults, API order (iusnid). Primary default is `default_sg_gids[0]`. */
    default_sg_gids?: string[];
    /** Present when GET indicator uses subgroup_compute_formula=true: subgroup GIDs with a compute target IUS. */
    sg_gid_with_compute_formula?: string[];
  }
>;

export interface IndicatorListItem {
  indicator_nid?: number;
  indicator_name?: string | null;
  indicator_gid?: string | null;
  highisgood?: boolean;
  data_exist?: boolean;
  unit_gid?: string[] | null;
  s_gid?: SgidMap | null;
  indicator_order?: number | null;
  i_nid?: number;
  i_name?: string | null;
  i_gid?: string | null;
  i_high_is_good?: boolean;
  i_has_data?: boolean;
  u_gid?: string[] | null;
  locale?: string | null;
  [key: string]: unknown;
}

/** Normalized indicator row for the indicators table (always internal keys). */
export interface Indicator {
  indicator_nid: number;
  indicator_name: string | null;
  indicator_gid: string | null;
  highisgood: boolean;
  data_exist: boolean;
  unit_gid?: string[] | null;
  s_gid?: SgidMap | null;
  indicator_order?: number | null;
}

export type MetaSubgroup = Record<
  string,
  { sg_nid: number; sg_gid: string; sg_name: string; sg_order?: number }
>;

export type MetaUnit = Record<
  string,
  { u_nid: number; u_name: string; u_gid: string }
>;

export interface IndicatorsListMeta {
  total_count: number;
  total_count_unfiltered?: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  subgroup?: MetaSubgroup;
  unit?: MetaUnit;
}

export interface IndicatorsListResponse {
  success: true;
  message?: string;
  data: IndicatorListItem[];
  meta: IndicatorsListMeta;
}

export interface IndicatorsListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type IndicatorsListResult = IndicatorsListResponse | IndicatorsListError;

export interface FetchIndicatorsParams {
  page?: number;
  page_size?: number;
  sort_order?: "asc" | "desc";
  sort_field?: string;
  search?: string;
  search_by?: string;
  u_identifier?: string;
  sg_identifier?: string;
  ic_identifier?: string;
  ic_type?: string;
  subgroup?: boolean;
  default_subgroup_only?: boolean;
}

export type ExportIndicatorsParams = Omit<
  FetchIndicatorsParams,
  "page" | "page_size"
>;

export interface CreateIndicatorPayload {
  indicator_name: string;
  unit_gid?: string[];
  subgroup_val_gid?: string[];
  highisgood?: boolean;
}

export interface CreateIndicatorMetaError {
  index?: number;
  error?: string;
}

export interface CreateIndicatorsResponse {
  success: true;
  message?: string;
  data: { indicator_nid?: number; indicator_gid?: string; i_nid?: number; i_gid?: string }[];
  meta?: { count?: number; errors?: CreateIndicatorMetaError[] };
}

export interface CreateIndicatorsError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type CreateIndicatorsResult = CreateIndicatorsResponse | CreateIndicatorsError;

export interface GetIndicatorResponse {
  success: true;
  message?: string;
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface GetIndicatorError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type GetIndicatorResult = GetIndicatorResponse | GetIndicatorError;

export type GetIndicatorByIdOptions =
  | string
  | {
      languageCode?: string;
      metadata?: boolean;
      /** Include full subgroup map (same as GET with subgroup=true). */
      subgroup?: boolean;
      /** With subgroup=true: include sg_gid_with_compute_formula per unit (GET subgroup_compute_formula=true). */
      subgroupComputeFormula?: boolean;
    };

export interface MetadataCategoryRow {
  nid: number;
  gid: string;
  name: string;
  order: number;
}

export type FetchMetadataCategoriesResult =
  | { success: true; data: MetadataCategoryRow[] }
  | { success: false; err_message?: string };

export interface IndicatorMetadataUpdateItem {
  mt_catg_gid: string;
  metadata_text: string;
}

export type UpdateIndicatorMetadataResult =
  | {
      success: true;
      data?: Record<string, unknown>;
      meta?: { errors?: unknown[] };
    }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

export type ValidationRuleType = "NUM" | "TEXT" | "ENUM";

export type ValidationRuleEnumOptionWire = {
  option_code: string;
  /** Per-locale labels from GET; omitted or null from API means empty in UI. */
  labels?: Record<string, string>;
  /** Legacy single-locale label from older API responses. */
  label?: string | null;
  score?: number | null;
  display_order?: number | null;
  is_active?: boolean;
};

export interface IndicatorValidationRuleRow {
  unit_gid: string | null;
  validation_type: ValidationRuleType;
  min_value: number | null;
  max_value: number | null;
  min_length: number | null;
  max_length: number | null;
  options: ValidationRuleEnumOptionWire[];
}

/** Enum row in the validation form: labels keyed by short locale (e.g. en, fr). */
export interface ValidationRuleEnumOptionFormInput {
  option_code: string;
  labels: Record<string, string>;
  score?: number | null;
  display_order?: number;
  is_active?: boolean;
}

/** One enum option in PATCH body: either ``labels`` (full map) or legacy ``label``. */
export interface ValidationRuleUpsertOptionInput {
  option_code: string;
  /** Use with ``labels`` omitted (single-locale / legacy PATCH). */
  label?: string;
  /** Per locale; null removes translation. Preferred for enum table UI. */
  labels?: Record<string, string | null>;
  score?: number | null;
  display_order?: number;
  is_active?: boolean;
}

export interface ValidationRuleUpsertPayload {
  unit_gids: string[];
  validation_type: ValidationRuleType;
  min_value?: number | null;
  max_value?: number | null;
  min_length?: number | null;
  max_length?: number | null;
  options: ValidationRuleUpsertOptionInput[];
}

export type FetchIndicatorValidationRulesResult =
  | { success: true; data: IndicatorValidationRuleRow[] }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

export type FetchDatasetValidationRulesResult =
  | { success: true; data: Record<string, IndicatorValidationRuleRow[]> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

export type UpsertIndicatorValidationRulesResult =
  | { success: true; message?: string }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

export type CreateMetadataCategoriesResult =
  | { success: true; data?: unknown; meta?: { errors?: unknown[] } }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

export type UpdateMetadataCategoryResult =
  | { success: true; data?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

export type DeleteMetadataCategoryResult =
  | { success: true }
  | { success: false; err_message?: string; status?: number; errors?: Record<string, unknown> };

export interface IndicatorAssociationCountsData {
  data_count: number;
  ius_count: number;
}

export type IndicatorAssociationCountsResult =
  | { success: true; message?: string; data: IndicatorAssociationCountsData }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

export type DeleteIndicatorResult =
  | { success: true }
  | { success: false; err_message?: string; status?: number; errors?: Record<string, unknown> };

// =============================================================================
// Indicator Classifications
// =============================================================================

export interface IndicatorClassificationItem {
  ic_nid?: number;
  ic_name?: string | null;
  ic_gid?: string | null;
  ic_parent_nid?: number | null;
  ic_type?: string | null;
  ic_short_name?: string | null;
  ic_ius_subtree_union_count?: number | null;
  children?: IndicatorClassificationItem[];
  [key: string]: unknown;
}

export interface FetchIndicatorClassificationsParams {
  page?: number;
  page_size?: number;
  sort_order?: "asc" | "desc";
  sort_field?: string;
  search?: string;
  ic_type?: string;
  ic_parent_nid?: number;
  hierarchical?: boolean;
  include_ic_ius_counts?: boolean;
  export?: boolean;
}

export type FetchIndicatorClassificationsResult =
  | {
      success: true;
      message?: string;
      data: IndicatorClassificationItem[];
      meta?: Record<string, unknown>;
    }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

export interface IcIusMappingItem {
  ic_gid: string;
  parent_ic_gid?: string;
  i_u_gid?: string[];
  i_u_sg_gid?: string[];
}

// =============================================================================
// IUS (Indicator-Unit-Subgroup)
// =============================================================================

export interface FetchIusParams {
  page?: number;
  page_size?: number;
  i_identifier?: string;
  u_identifier?: string;
  sg_identifier?: string;
  ic_identifier?: string;
  ic_type?: string;
  sort_field?: string;
  sort_order?: string;
  indicator?: boolean;
  unit?: boolean;
  subgroup?: boolean;
}

export interface IusListResponse {
  success: true;
  message?: string;
  data: IusItem[];
  meta?: {
    total_count?: number;
    count?: number;
    page?: number;
    page_size?: number;
    total_pages?: number;
    indicator?: Record<string, Record<string, unknown>>;
    unit?: Record<string, Record<string, unknown>>;
    subgroup?: Record<string, Record<string, unknown>>;
  };
}

export interface IusItem {
  indicator_nid?: number;
  indicator_gid?: string;
  unit_nid?: number;
  unit_gid?: string;
  subgroup_val_nid?: number;
  subgroup_val_gid?: string;
  ius_nid?: number;
  i_nid?: number;
  i_gid?: string;
  u_nid?: number;
  u_gid?: string;
  sv_nid?: number;
  sg_gid?: string;
  [key: string]: unknown;
}

export interface IusListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type IusListResult = IusListResponse | IusListError;

export interface IusUpsertItem {
  i_gid: string;
  u_gid: string[];
  u_sg_gid: Record<string, SgidMap[string] & { sg_gid: string[] }>;
}

export interface IusUpsertBody {
  data: IusUpsertItem[];
}

export interface IusUpsertResponse {
  success: true;
  message?: string;
  data?: { items?: IusItem[] };
}

export interface IusUpsertError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type IusUpsertResult = IusUpsertResponse | IusUpsertError;

// =============================================================================
// Units
// =============================================================================

export interface UnitRaw {
  unit_nid?: number;
  unit_name?: string | null;
  unit_gid?: string | null;
  unit_format?: string | null;
  u_nid?: number;
  u_name?: string | null;
  u_gid?: string | null;
  u_format?: string | null;
  [key: string]: unknown;
}

export interface UnitsListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UnitsListResponse {
  success: true;
  message?: string;
  data: UnitRaw[];
  meta: UnitsListMeta;
}

export interface UnitsListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type UnitsListResult = UnitsListResponse | UnitsListError;

export interface FetchUnitsParams {
  page?: number;
  page_size?: number;
  sort_order?: "asc" | "desc";
  sort_field?: string;
  search?: string;
  /** Required by GET /units when `search` is set (API: u_name | u_gid). */
  search_by?: "u_name" | "u_gid";
}

export interface CreateUnitPayload {
  unit_name: string;
  unit_gid?: string;
  unit_format?: string;
  unit_global?: boolean;
}

export interface CreateUnitsRowError {
  index?: number;
  error?: string;
}

export interface CreateUnitsResponse {
  success: true;
  message?: string;
  data: { unit_nid?: number; unit_gid?: string; u_nid?: number; u_gid?: string }[];
  meta?: { count?: number; errors?: CreateUnitsRowError[] };
}

export interface CreateUnitsError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type CreateUnitsResult = CreateUnitsResponse | CreateUnitsError;

export interface UpdateUnitPayload {
  unit_name?: string;
  unit_gid?: string;
  unit_format?: string;
}

export interface UnitAssociationCountsData {
  data_rows: number;
  ius_rows: number;
}

export type UnitAssociationCountsResult =
  | {
      success: true;
      message?: string;
      data: UnitAssociationCountsData;
    }
  | {
      success: false;
      err_message?: string;
      errors?: Record<string, unknown>;
    };

export type DeleteUnitResult =
  | { success: true }
  | {
      success: false;
      err_message?: string;
      status?: number;
      errors?: Record<string, unknown>;
    };

export type MultipleDeleteUnitsResult =
  | {
      success: true;
      message?: string;
      data?: { deleted?: number[] };
      meta?: { errors?: unknown[] };
    }
  | {
      success: false;
      err_message?: string;
      status?: number;
      errors?: Record<string, unknown>;
    };

// =============================================================================
// Time periods
// =============================================================================

/** List item: API may return `id` (timeperiod_nid) and/or flat names. */
export interface TimePeriodRaw {
  id?: number;
  timeperiod?: string | null;
  startdate?: string | null;
  enddate?: string | null;
  periodicity?: string | null;
  [key: string]: unknown;
}

export interface TimePeriodsListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface TimePeriodsListResponse {
  success: true;
  message?: string;
  data: TimePeriodRaw[];
  meta: TimePeriodsListMeta;
}

export interface TimePeriodsListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type TimePeriodsListResult = TimePeriodsListResponse | TimePeriodsListError;

export interface FetchTimePeriodsParams {
  page?: number;
  page_size?: number;
  sort_order?: "asc" | "desc";
  sort_field?: string;
  search?: string;
  search_by?: string;
}

/** POST /time-periods batch body: label + periodicity only (all-or-nothing). */
export interface CreateTimePeriodPayload {
  tp_timeperiod: string;
  tp_periodicity: string;
}

export interface CreateTimePeriodsRowError {
  index?: number;
  error?: string;
}

export interface CreateTimePeriodsResponse {
  success: true;
  message?: string;
  data: TimePeriodRaw[];
  meta?: { count?: number; errors?: CreateTimePeriodsRowError[] };
}

export interface CreateTimePeriodsError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type CreateTimePeriodsResult = CreateTimePeriodsResponse | CreateTimePeriodsError;

export interface UpdateTimePeriodPayload {
  tp_timeperiod?: string;
  tp_startdate?: string;
  tp_enddate?: string;
  tp_periodicity?: string;
}

/** Association-count preview before delete (shape may include only `data_count`). */
export interface TimePeriodAssociationCountsData {
  data_count: number;
}

export type TimePeriodAssociationCountsResult =
  | {
      success: true;
      message?: string;
      data: TimePeriodAssociationCountsData;
    }
  | {
      success: false;
      err_message?: string;
      errors?: Record<string, unknown>;
    };

export type DeleteTimePeriodResult =
  | { success: true }
  | {
      success: false;
      err_message?: string;
      status?: number;
      errors?: Record<string, unknown>;
    };

export type MultipleDeleteTimePeriodsResult =
  | {
      success: true;
      message?: string;
      data?: unknown;
      meta?: { errors?: unknown[] };
    }
  | {
      success: false;
      err_message?: string;
      status?: number;
      errors?: Record<string, unknown>;
    };

// =============================================================================
// Subgroups
// =============================================================================

export interface SubgroupRaw {
  subgroup_val_nid?: number;
  subgroup_val_gid?: string | null;
  subgroup_val?: string | null;
  sg_nid?: number;
  sg_gid?: string | null;
  sg_name?: string | null;
  sg_order?: number;
  sg_is_global?: boolean;
  is_system?: boolean;
  sv_nid?: number;
  sv_gid?: string | null;
  sv_name?: string | null;
  /** Display / sort order from list API (`sv_order` ↔ `subgroup_val_order`). */
  sv_order?: number;
  subgroup_val_order?: number;
  sg_cat_val_gids?: string[];
  [key: string]: unknown;
}

export interface SubgroupsMetaCategory {
  sg_cat_nid: number;
  sg_cat_name: string;
  sg_cat_gid: string;
}

export interface SubgroupsMetaCategoryValue {
  sg_cat_nid: number;
  sg_cat_gid: string;
  sg_catg_val_nid?: number;
  sg_catg_val_name?: string;
  sg_catg_val_gid?: string;
  sg_val_nid?: number;
  sg_val_name?: string;
  sg_val_gid?: string;
}

export interface SubgroupsListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  sg_categories?: Record<string, SubgroupsMetaCategory>;
  sg_category_values?: Record<string, SubgroupsMetaCategoryValue>;
}

export interface SubgroupsListResponse {
  success: true;
  message?: string;
  data: SubgroupRaw[];
  meta: SubgroupsListMeta;
}

export interface SubgroupsListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type SubgroupsListResult = SubgroupsListResponse | SubgroupsListError;

export interface FetchSubgroupsParams {
  page?: number;
  page_size?: number;
  sort_order?: "asc" | "desc";
  sort_field?: string;
  /** Search term; requires `search_by` and `search_field` when used. */
  search?: string;
  search_by?: "subgroup" | "subgroup_category_val";
  search_field?: "subgroup_val" | "subgroup_name";
  /** When `search_by` is `subgroup_category_val`, narrows to this category (e.g. dimension name). */
  category_val?: string;
  subgroup_info?: boolean;
  scope?: string;
}

export interface BulkCreateSgCategoryValueItem {
  sg_cat_gid: string;
  sg_catg_val_name?: string;
  sg_catg_val_gid?: string;
  sg_catg_val_order?: number;
  sg_catg_val_global?: boolean;
  subgroup_name?: string;
  subgroup_gid?: string;
  subgroup_order?: number;
  subgroup_global?: boolean;
}

export interface BulkCreateSgCategoryValuesSuccess {
  success: true;
  message?: string;
  data?: unknown;
  meta?: { errors?: unknown[] };
}

export interface BulkCreateSgCategoryValuesError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type BulkCreateSgCategoryValuesResult =
  | BulkCreateSgCategoryValuesSuccess
  | BulkCreateSgCategoryValuesError;

export type ExportSubgroupsParams = Omit<
  FetchSubgroupsParams,
  "page" | "page_size"
> & {
  scope?: "NO_DATA" | "NO_IUS";
  subgroup_info?: boolean;
};

export interface CreateSubgroupCombinationItem {
  sg_cat_val_gids: string[];
  sg_gid?: string;
  sg_order?: number;
  sg_is_global?: boolean;
}

export interface CreateSubgroupCombinationsSuccess {
  success: true;
  message?: string;
  data?: unknown;
  meta?: { errors?: unknown[] };
}

export interface CreateSubgroupCombinationsError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type CreateSubgroupCombinationsResult =
  | CreateSubgroupCombinationsSuccess
  | CreateSubgroupCombinationsError;

// =============================================================================
// Subgroup Categories
// =============================================================================

export interface SgCategoryValue {
  sv_nid?: number;
  sv_gid?: string | null;
  sv_name?: string | null;
  used_in?: { subgroup_count?: number };
  [key: string]: unknown;
}

export interface SgCategory {
  sg_cat_nid?: number;
  sg_cat_gid?: string | null;
  sg_cat_name?: string | null;
  sg_cat_order?: number;
  sg_cat_global?: boolean;
  is_system?: boolean;
  used_in?: { subgroup_count?: number };
  sg_nid?: number;
  sg_gid?: string | null;
  sg_name?: string | null;
  sg_order?: number;
  sg_is_global?: boolean;
  values?: SgCategoryValue[];
  [key: string]: unknown;
}

export interface CreateSgCategoryPayload {
  sg_cat_name: string;
  sg_cat_gid?: string;
  sg_cat_order?: number;
  sg_cat_global?: boolean;
}

export interface UpdateSgCategoryPayload {
  sg_cat_name?: string;
  sg_cat_order?: number;
  sg_cat_global?: boolean;
}

export interface SgCategoriesListResponse {
  success: true;
  message?: string;
  data: SgCategory[];
}

export interface SgCategoriesListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type SgCategoriesListResult =
  | SgCategoriesListResponse
  | SgCategoriesListError;

export interface SgCategoriesMutationSuccess {
  success: true;
  message?: string;
  data?: unknown;
  meta?: { errors?: unknown[] };
}

export interface SgCategoriesMutationError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type SgCategoriesMutationResult =
  | SgCategoriesMutationSuccess
  | SgCategoriesMutationError;

// =============================================================================
// Subgroup Category Values
// =============================================================================

export interface SgCategoryValueFlat {
  sg_catg_val_nid: number;
  sg_catg_val_name: string;
  sg_catg_val_gid: string;
  sg_catg_val_global: boolean;
  sg_cat_nid: number;
  sg_cat_gid: string;
  sg_catg_val_order: number;
  is_system?: boolean;
  used_in?: { subgroup_count?: number };
}

export interface SgCategoriesValuesListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  sg_cat_info: Record<string, string>;
}

export interface SgCategoriesValuesListResponse {
  success: true;
  message?: string;
  data: SgCategoryValueFlat[];
  meta: SgCategoriesValuesListMeta;
}

export interface SgCategoriesValuesListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type SgCategoriesValuesListResult =
  | SgCategoriesValuesListResponse
  | SgCategoriesValuesListError;

export interface FetchSgCategoriesValuesParams {
  page?: number;
  page_size?: number;
  sg_cat_identifier?: string;
  view?: "flat" | "group_by";
  sg_cat_info?: boolean;
  used_in?: boolean;
}

export interface SgCategoryValueMutationSuccess {
  success: true;
  message?: string;
  data?: unknown;
  meta?: { errors?: unknown[] };
}

export interface SgCategoryValueMutationError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type SgCategoryValueMutationResult =
  | SgCategoryValueMutationSuccess
  | SgCategoryValueMutationError;

export interface UpdateSgCategoryValuePayload {
  sg_catg_val_name?: string;
  sg_catg_val_gid?: string;
  sg_catg_val_order?: number;
  sg_catg_val_global?: boolean;
  subgroup_name?: string;
  subgroup_gid?: string;
  subgroup_order?: number;
  subgroup_global?: boolean;
}

export type UpdateSubgroupValPayload = {
  sv_name?: string;
  sv_gid?: string;
  sv_order?: number;
  sv_global?: boolean;
  sg_cat_val_gids?: string[];
};

// =============================================================================
// Delete Subgroups
// =============================================================================

export interface DeleteSubgroupSuccess {
  success: true;
  message?: string;
}

export interface DeleteSubgroupError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type DeleteSubgroupResult = DeleteSubgroupSuccess | DeleteSubgroupError;

// =============================================================================
// Areas
// =============================================================================

export type AreasMutationSuccess = {
  success: true;
  message?: string;
  data?: unknown;
  meta?: Record<string, unknown>;
};

export type AreasMutationError = {
  success: false;
  err_message?: string;
  data?: unknown;
  errors?: Record<string, unknown>;
};

export type AreasMutationResult = AreasMutationSuccess | AreasMutationError;

export type CreateAreaPayload = {
  ar_name?: string;
  ar_id?: string;
  ar_parent_nid?: number;
  ar_short_name?: string;
  ar_block_nids?: string;
  ar_gid?: string;
  ar_is_global?: boolean;
  ar_latitude?: number;
  ar_longitude?: number;
  ar_lat_long_nid?: string;
  area_name?: string;
  area_id?: string;
  area_parent_nid?: number;
  block_nids?: string;
};

export type UpdateAreaPayload = {
  ar_name?: string;
  ar_id?: string;
  ar_parent_nid?: number;
  ar_short_name?: string;
  ar_block_nids?: string;
  ar_is_global?: boolean;
  ar_latitude?: number;
  ar_longitude?: number;
  ar_lat_long_nid?: string;
};

export type ExportAreasParams = {
  sort_order?: "asc" | "desc";
  sort_field?: string;
  level?: number;
  hierarchical?: boolean;
};

// =============================================================================
// Area Levels
// =============================================================================

export type AreaLevelsMutationSuccess = {
  success: true;
  message?: string;
  data?: unknown;
  meta?: Record<string, unknown>;
};

export type AreaLevelsMutationError = {
  success: false;
  err_message?: string;
  data?: unknown;
  errors?: Record<string, unknown>;
};

export type AreaLevelsMutationResult =
  | AreaLevelsMutationSuccess
  | AreaLevelsMutationError;

export type CreateAreaLevelPayload = {
  al_level: number;
  al_name: string;
};

export type UpdateAreaLevelPayload = {
  al_level?: number;
  al_name?: string;
};

// =============================================================================
// Sources
// =============================================================================

export interface SourceRaw {
  src_nid?: number;
  src_gid?: string | null;
  src_name?: string | null;
  src_short_name?: string | null;
  src_publisher?: string | null;
  src_title?: string | null;
  src_year?: string | null;
  ic_nid?: number;
  ic_gid?: string | null;
  ic_name?: string | null;
  ic_short_name?: string | null;
  publisher?: string | null;
  title?: string | null;
  diyear?: string | null;
  [key: string]: unknown;
}

export interface SourcesListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SourcesListResponse {
  success: true;
  message?: string;
  data: SourceRaw[];
  meta: SourcesListMeta;
}

export interface SourcesListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type SourcesListResult = SourcesListResponse | SourcesListError;

export interface FetchSourcesParams {
  page?: number;
  page_size?: number;
  sort_order?: "asc" | "desc";
  sort_field?: string;
  search?: string;
  scope?: string;
}

export interface CreateSourcePayload {
  src_publisher?: string;
  src_title: string;
  year?: string;
  short_name?: string;
  src_gid?: string;
}

export interface UpdateSourcePayload {
  src_publisher?: string;
  src_title?: string;
  year?: string;
  short_name?: string;
  src_gid?: string;
}

export interface SourceAssociationCountsData {
  data_count: number;
  ius_count: number;
}

export type SourceAssociationCountsResult =
  | {
      success: true;
      message?: string;
      data: SourceAssociationCountsData;
    }
  | {
      success: false;
      err_message?: string;
      errors?: Record<string, unknown>;
    };

export type DeleteSourceResult =
  | { success: true }
  | {
      success: false;
      err_message?: string;
      status?: number;
      errors?: Record<string, unknown>;
    };

// =============================================================================
// IAM Roles
// =============================================================================

export interface RoleRaw {
  id: number;
  app_key: string;
  role_code: string;
  is_super_admin: number | boolean;
  is_system_role: number | boolean;
  display_order: number;
  name: string | null;
  description: string | null;
}

export interface RolesListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface RolesListResponse {
  success: true;
  message?: string;
  data: RoleRaw[];
  meta: RolesListMeta;
}

export interface RolesListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type RolesListResult = RolesListResponse | RolesListError;

export interface CreateRolePayload {
  role_code: string;
  name?: string;
  description?: string;
  display_order?: number;
  is_super_admin?: number;
  is_system_role?: number;
}

export interface UpdateRolePayload {
  role_code?: string;
  name?: string;
  description?: string;
  display_order?: number;
  is_super_admin?: number;
}

export type DeleteRoleResult =
  | { success: true }
  | {
      success: false;
      err_message?: string;
      status?: number;
      errors?: Record<string, unknown>;
    };

// =============================================================================
// IAM Users (User Management CRUD page)
// =============================================================================

export interface UserRaw {
  id: number;
  first_name: string;
  last_name?: string | null;
  username: string;
  email: string;
  phone?: string | null;
  organisation?: string | null;
  location?: string | null;
  status?: number | null;
  created?: string | null;
  last_loggedin_on?: string | null;
  email_verified?: boolean | null;
  roles: string[];
}

export interface UserRoleMasterItem {
  id: number;
  role_code: string;
  is_super_admin: number;
  is_system_role: number;
  name?: string | null;
  description?: string | null;
}

export interface UsersListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  roles?: Record<string, UserRoleMasterItem>;
}

export interface UsersListResponse {
  success: true;
  message?: string;
  data: UserRaw[];
  meta: UsersListMeta;
}

export interface UsersListError {
  success: false;
  err_message?: string;
  errors?: Record<string, unknown>;
}

export type UsersListResult = UsersListResponse | UsersListError;

export interface CreateUserPayload {
  first_name: string;
  last_name?: string;
  username: string;
  email: string;
  status?: number;
}

export type CreateUserResult =
  | {
      success: true;
      data?: Array<{
        user_id: number;
        username: string;
        email: string;
        full_name: string;
        password_auto_generated: boolean;
        email_sent: boolean;
        created_at: string;
      }>;
      message?: string;
      meta?: { count: number; errors?: Array<{ index: number; error: string }> };
    }
  | {
      success: false;
      err_message?: string;
      errors?: Record<string, unknown>;
    };

export interface SaveUserRolesPayload {
  data: {
    dw_id?: number | null;
    user_id: number;
    roles: { role_id: number; content_restrictions?: { resource_code: string; content_ids: number[] }[] }[];
  };
}

export interface UpdateUserPayload {
  first_name?: string;
  last_name?: string | null;
  username?: string;
  email?: string;
  phone?: string | null;
  organisation?: string | null;
  location?: string | null;
  status?: number;
}

export type UpdateUserResult =
  | {
      success: true;
      data?: {
        id: number;
        first_name: string;
        last_name?: string | null;
        username: string;
        email: string;
        phone?: string | null;
        organisation?: string | null;
        location?: string | null;
        status: number;
        modified?: string | null;
      };
      message?: string;
    }
  | {
      success: false;
      err_message?: string;
      errors?: Record<string, unknown>;
    };

export type DeleteUserResult =
  | { success: true; data?: { user_id: number }; message?: string }
  | { success: false; err_message?: string; errors?: Record<string, unknown> };

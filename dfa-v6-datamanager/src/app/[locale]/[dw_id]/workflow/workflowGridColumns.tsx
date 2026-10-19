"use client";

import { useMemo } from "react";
import type { WorkflowListItem, WorkflowSortColumnId } from "@/lib/api/types";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { GridConfigureButton } from "@/components/GridConfigureButton";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  type EditableGridColumnDef,
} from "@/components/TableView";

export function workflowRowId(row: WorkflowListItem): string {
  return String(row.workflow_id);
}

/** List cell display for API `created` ISO timestamps. */
function formatWorkflowCreated(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Workflow list: name column viewport-based min-width. */
const WF_NAME_TH_TD_WIDTH = "!min-w-[clamp(12vw,16vw,22vw)]";
/** Toggle column for Active status — not resizable (sits before sticky actions). */
const WF_ACTIVE_HALF = "!w-[90px] !min-w-[86px] !max-w-[100px]";

export type { WorkflowSortColumnId };

export type UseWorkflowGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  rowsLength: number;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  colFilterName: string;
  setColFilterName: (v: string) => void;
  allowReviewFilter: "" | "yes" | "no";
  setAllowReviewFilter: (v: "" | "yes" | "no") => void;
  activeFilter: "" | "yes" | "no";
  setActiveFilter: (v: "" | "yes" | "no") => void;
  sortColumnId: WorkflowSortColumnId | null;
  sortDirection: "asc" | "desc" | null;
  onSort: (columnId: WorkflowSortColumnId) => void;
  onConfigure: (row: WorkflowListItem) => void;
};

export function useWorkflowGridColumns(
  p: UseWorkflowGridColumnsParams
): EditableGridColumnDef<WorkflowListItem>[] {
  const { t } = p;
  return useMemo((): EditableGridColumnDef<WorkflowListItem>[] => {
    return [
      {
        id: "select",
        layout: { width: 1 },
        header: {
          kind: "selectAll",
          checked: p.rowsLength > 0 && p.selectedRowIds.size === p.rowsLength,
          onChange: p.selectAll,
          ariaLabel: t("SELECT_ALL"),
        },
        filter: null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={p.selectedRowIds.has(workflowRowId(row))}
            onChange={() => p.toggleSelect(workflowRowId(row))}
            aria-label={`Select ${row.workflow_name ?? row.workflow_code}`}
          />
        ),
      },
      {
        id: "name",
        layout: { width: 300, minWidth: 260, sticky: true, main: true },
        defaultWidth: 300,
        headerThClassName: WF_NAME_TH_TD_WIDTH,
        className: WF_NAME_TH_TD_WIDTH,
        header: {
          kind: "sort",
          text: t("NAME"),
          onSort: () => p.onSort("name"),
          sortActive: p.sortColumnId === "name",
          sortDirection: p.sortColumnId === "name" ? p.sortDirection : null,
          sortAriaLabel: t("SORT"),
        },
        filter: {
          kind: "search",
          value: p.colFilterName,
          onChange: p.setColFilterName,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("NAME"),
        },
        cell: ({ row }) => (
          <span className="cell-name">
            {row.workflow_name?.trim() || row.workflow_code || "—"}
          </span>
        ),
      },
      {
        id: "allow_review",
        layout: { width: 190, minWidth: 165, maxWidth: 220 },
        defaultWidth: 190,
        headerTextClamp: true,
        headerThClassName: "bg-surface-muted",
        filterThClassName: "bg-surface-muted",
        className: "bg-surface",
        header: {
          kind: "sort",
          text: t("ALLOW_REVIEW"),
          onSort: () => p.onSort("allow_review"),
          sortActive: p.sortColumnId === "allow_review",
          sortDirection:
            p.sortColumnId === "allow_review" ? p.sortDirection : null,
          sortAriaLabel: t("SORT"),
        },
        filter: {
          kind: "select",
          menuPortal: true,
          value: p.allowReviewFilter,
          onChange: (v) => p.setAllowReviewFilter(v as "" | "yes" | "no"),
          ariaLabel: t("ALLOW_REVIEW"),
          options: [
            { value: "", label: t("ALL") },
            { value: "yes", label: t("YES") },
            { value: "no", label: t("NO") },
          ],
        },
        cell: ({ row }) => (
          <span>{row.allow_review ? t("YES") : t("NO")}</span>
        ),
      },
      {
        id: "review_levels",
        layout: { width: 180, minWidth: 155, maxWidth: 210 },
        defaultWidth: 180,
        headerTextClamp: true,
        headerThClassName: "bg-surface-muted",
        filterThClassName: "bg-surface-muted",
        className: "bg-surface",
        header: {
          kind: "sort",
          text: t("REVIEW_STAGES"),
          onSort: () => p.onSort("review_levels"),
          sortActive: p.sortColumnId === "review_levels",
          sortDirection:
            p.sortColumnId === "review_levels" ? p.sortDirection : null,
          sortAriaLabel: t("SORT"),
        },
        filter: null,
        cell: ({ row }) => (
          <span>{row.review_level_count ?? 0}</span>
        ),
      },
      {
        id: "dataset_count",
        layout: { width: 250, minWidth: 240, maxWidth: 290 },
        defaultWidth: 240,
        headerTextClamp: true,
        headerThClassName: "bg-surface-muted",
        filterThClassName: "bg-surface-muted",
        className: "bg-surface",
        header: { kind: "sortWrapLabel", text: t("DATASET_COUNT") },
        filter: null,
        cell: ({ row }) => (
          <span>{row.dataset_count ?? 0}</span>
        ),
      },
      {
        id: "created",
        layout: { width: 175, minWidth: 155, maxWidth: 210 },
        defaultWidth: 175,
        headerTextClamp: true,
        headerThClassName: "bg-surface-muted",
        filterThClassName: "bg-surface-muted",
        className: "bg-surface",
        header: {
          kind: "sort",
          text: t("CREATED_ON", "Created On"),
          onSort: () => p.onSort("created"),
          sortActive: p.sortColumnId === "created",
          sortDirection: p.sortColumnId === "created" ? p.sortDirection : null,
          sortAriaLabel: t("SORT"),
        },
        filter: null,
        cell: ({ row }) => {
          const label = formatWorkflowCreated(row.created);
          return (
            <span className="cell-name" title={row.created ?? undefined}>
              {label}
            </span>
          );
        },
      },
      {
        id: "active",
        layout: { width: 4 },
        header: { kind: "sortWrapLabel", text: t("ACTIVE") },
        filter: {
          kind: "select",
          menuPortal: true,
          value: p.activeFilter,
          onChange: (v) => p.setActiveFilter(v as "" | "yes" | "no"),
          ariaLabel: t("ACTIVE"),
          options: [
            { value: "", label: t("ALL") },
            { value: "yes", label: t("YES") },
            { value: "no", label: t("NO") },
          ],
        },
        cell: ({ row }) => (
          <ToggleSwitch
            readOnly
            checked={row.is_active}
            title={row.is_active ? t("YES") : t("NO")}
            aria-label={row.is_active ? t("YES") : t("NO")}
          />
        ),
      },
      {
        id: "actions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row }) => (
          <GridConfigureButton
            wrapInActionBtns
            ariaLabel={t("CONFIGURE")}
            onClick={(e) => {
              e.stopPropagation();
              p.onConfigure(row);
            }}
          />
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- granular `p.*` deps; full `p` would match compiler but churns column defs
  }, [
    t,
    p.rowsLength,
    p.selectedRowIds,
    p.selectAll,
    p.toggleSelect,
    p.colFilterName,
    p.setColFilterName,
    p.allowReviewFilter,
    p.setAllowReviewFilter,
    p.activeFilter,
    p.setActiveFilter,
    p.sortColumnId,
    p.sortDirection,
    p.onSort,
    p.onConfigure,
  ]);
}

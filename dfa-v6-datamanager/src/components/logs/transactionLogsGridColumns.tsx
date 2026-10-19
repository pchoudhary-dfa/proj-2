"use client";

import { useMemo } from "react";
import {
  ICON_ACTION_COLUMN_LAYOUT,
  TV_GRID_CONFIGURE_BTN,
} from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  type EditableGridColumnDef,
} from "@/components/TableView";
import { formatDateString } from "@/services/utils";
import {
  LOG_GRID_TEXT_OVERFLOW,
  logGridIdColumnLayout,
  logGridPathColumnLayout,
} from "@/components/logs/logsGridColumnLayout";

export type TransactionLogRow = {
  id: number;
  user_id: number | null;
  dw_id: number | null;
  path: string | null;
  action: string | null;
  module: string | null;
  identifier: string | null;
  previous_value?: unknown;
  new_value?: unknown;
  status: string | null;
  description: string | null;
  created: string | null;
};

export type TransactionActionFilter = "" | "CREATE" | "UPDATE" | "DELETE";
export type TransactionStatusFilter = "" | "SUCCESS" | "ERROR";

export type UseTransactionLogsGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  colFilterPath: string;
  setColFilterPath: (v: string) => void;
  colFilterModule: string;
  setColFilterModule: (v: string) => void;
  colFilterIdentifier: string;
  setColFilterIdentifier: (v: string) => void;
  colFilterDescription: string;
  setColFilterDescription: (v: string) => void;
  actionFilter: TransactionActionFilter;
  setActionFilter: (v: TransactionActionFilter) => void;
  statusFilter: TransactionStatusFilter;
  setStatusFilter: (v: TransactionStatusFilter) => void;
  onSortId: () => void;
  onSortCreated: () => void;
  onSortAction: () => void;
  onSortModule: () => void;
  onSortStatus: () => void;
  idSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  createdSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  actionSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  moduleSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  statusSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  onViewRow: (row: TransactionLogRow) => void;
};

function readCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function useTransactionLogsGridColumns(
  p: UseTransactionLogsGridColumnsParams
): EditableGridColumnDef<TransactionLogRow>[] {
  const { t } = p;
  return useMemo((): EditableGridColumnDef<TransactionLogRow>[] => {
    return [
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "id",
        layout: logGridIdColumnLayout(),
        header: {
          kind: "sort",
          text: "ID",
          onSort: p.onSortId,
          sortIcon: p.idSortIcon,
          sortAriaLabel: "ID",
        },
        filter: null,
        cell: ({ row }) => readCell(row.id),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "path",
        layout: logGridPathColumnLayout(),
        header: t("PATH", "Path"),
        filter: {
          kind: "search",
          value: p.colFilterPath,
          onChange: p.setColFilterPath,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("PATH", "Path"),
        },
        cell: ({ row }) => (
          <span className="cell-name block min-w-0 truncate" title={row.path ?? undefined}>
            {readCell(row.path)}
          </span>
        ),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "module",
        layout: { width: 6, minWidth: 144 },
        header: {
          kind: "sort",
          text: t("MODULE", "Module"),
          onSort: p.onSortModule,
          sortIcon: p.moduleSortIcon,
          sortAriaLabel: t("MODULE", "Module"),
        },
        filter: {
          kind: "search",
          value: p.colFilterModule,
          onChange: p.setColFilterModule,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("MODULE", "Module"),
        },
        cell: ({ row }) => (
          <span className="block min-w-0 truncate" title={row.module ?? undefined}>
            {readCell(row.module)}
          </span>
        ),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "identifier",
        layout: { width: 7, minWidth: 160 },
        header: t("IDENTIFIER", "Identifier"),
        filter: {
          kind: "search",
          value: p.colFilterIdentifier,
          onChange: p.setColFilterIdentifier,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("IDENTIFIER", "Identifier"),
        },
        cell: ({ row }) => (
          <span className="block min-w-0 truncate" title={row.identifier ?? undefined}>
            {readCell(row.identifier)}
          </span>
        ),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "action",
        layout: { width: 5, minWidth: 96 },
        header: {
          kind: "sort",
          text: t("ACTION", "Action"),
          onSort: p.onSortAction,
          sortIcon: p.actionSortIcon,
          sortAriaLabel: t("ACTION", "Action"),
        },
        filter: {
          kind: "select",
          menuPortal: true,
          value: p.actionFilter,
          onChange: (v) => p.setActionFilter(v as TransactionActionFilter),
          ariaLabel: t("ACTION", "Action"),
          options: [
            { value: "", label: t("ALL") },
            { value: "CREATE", label: "CREATE" },
            { value: "UPDATE", label: "UPDATE" },
            { value: "DELETE", label: "DELETE" },
          ],
        },
        cell: ({ row }) => (
          <span className="block min-w-0 truncate">{readCell(row.action)}</span>
        ),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "status",
        layout: { width: 4, minWidth: 88 },
        header: {
          kind: "sort",
          text: t("STATUS", "Status"),
          onSort: p.onSortStatus,
          sortIcon: p.statusSortIcon,
          sortAriaLabel: t("STATUS", "Status"),
        },
        filter: {
          kind: "select",
          menuPortal: true,
          value: p.statusFilter,
          onChange: (v) => p.setStatusFilter(v as TransactionStatusFilter),
          ariaLabel: t("STATUS", "Status"),
          options: [
            { value: "", label: t("ALL") },
            { value: "SUCCESS", label: "SUCCESS" },
            { value: "ERROR", label: "ERROR" },
          ],
        },
        cell: ({ row }) => (
          <span className="block min-w-0 truncate">{readCell(row.status)}</span>
        ),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "description",
        layout: { width: 10, minWidth: 220, main: true },
        header: t("DESCRIPTION", "Description"),
        filter: {
          kind: "search",
          value: p.colFilterDescription,
          onChange: p.setColFilterDescription,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("DESCRIPTION", "Description"),
        },
        cell: ({ row }) => (
          <span className="block min-w-0 truncate" title={row.description ?? undefined}>
            {readCell(row.description)}
          </span>
        ),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "created",
        layout: { width: 6, minWidth: 140 },
        header: {
          kind: "sort",
          text: t("CREATED", "Created"),
          onSort: p.onSortCreated,
          sortIcon: p.createdSortIcon,
          sortAriaLabel: t("CREATED", "Created"),
        },
        filter: null,
        cell: ({ row }) => formatDateString(row.created),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "actions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row }) => (
          <div className="add-row-action-btns">
            <button
              type="button"
              className={TV_GRID_CONFIGURE_BTN}
              aria-label={t("VIEW_DETAILS", "View details")}
              title={t("VIEW_DETAILS", "View details")}
              onClick={(e) => {
                e.stopPropagation();
                p.onViewRow(row);
              }}
            >
              <span className="material-icons !text-sm" aria-hidden="true">
                visibility
              </span>
            </button>
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- granular p.* deps
  }, [
    t,
    p.colFilterPath,
    p.setColFilterPath,
    p.colFilterModule,
    p.setColFilterModule,
    p.colFilterIdentifier,
    p.setColFilterIdentifier,
    p.colFilterDescription,
    p.setColFilterDescription,
    p.actionFilter,
    p.setActionFilter,
    p.statusFilter,
    p.setStatusFilter,
    p.onSortId,
    p.onSortCreated,
    p.onSortAction,
    p.onSortModule,
    p.onSortStatus,
    p.idSortIcon,
    p.createdSortIcon,
    p.actionSortIcon,
    p.moduleSortIcon,
    p.statusSortIcon,
    p.onViewRow,
  ]);
}

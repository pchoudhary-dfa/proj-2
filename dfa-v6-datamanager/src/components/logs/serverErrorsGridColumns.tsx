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

export type ServerErrorLogRow = {
  id: number;
  user_id: number | null;
  dw_id: number | null;
  method: string | null;
  path: string | null;
  status_code: number | null;
  level: string | null;
  error_message: string | null;
  stack_trace?: string | null;
  request_body?: string | null;
  request_headers?: string | null;
  created: string | null;
};

export type ServerErrorLevelFilter = "" | "ERROR" | "CRITICAL" | "WARNING";
export type ServerErrorMethodFilter = "" | "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type UseServerErrorsGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  colFilterPath: string;
  setColFilterPath: (v: string) => void;
  colFilterError: string;
  setColFilterError: (v: string) => void;
  levelFilter: ServerErrorLevelFilter;
  setLevelFilter: (v: ServerErrorLevelFilter) => void;
  methodFilter: ServerErrorMethodFilter;
  setMethodFilter: (v: ServerErrorMethodFilter) => void;
  colFilterStatus: string;
  setColFilterStatus: (v: string) => void;
  onSortId: () => void;
  onSortCreated: () => void;
  onSortLevel: () => void;
  onSortStatus: () => void;
  idSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  createdSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  levelSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  statusSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  onViewRow: (row: ServerErrorLogRow) => void;
};

function readCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function useServerErrorsGridColumns(
  p: UseServerErrorsGridColumnsParams
): EditableGridColumnDef<ServerErrorLogRow>[] {
  const { t } = p;
  return useMemo((): EditableGridColumnDef<ServerErrorLogRow>[] => {
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
        id: "error_message",
        layout: { width: 10, minWidth: 220, main: true },
        header: t("MESSAGE", "Message"),
        filter: {
          kind: "search",
          value: p.colFilterError,
          onChange: p.setColFilterError,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("MESSAGE", "Message"),
        },
        cell: ({ row }) => (
          <span
            className="block min-w-0 truncate text-text"
            title={row.error_message ?? undefined}
          >
            {readCell(row.error_message)}
          </span>
        ),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "level",
        layout: { width: 4, minWidth: 88 },
        header: {
          kind: "sort",
          text: t("LEVEL", "Level"),
          onSort: p.onSortLevel,
          sortIcon: p.levelSortIcon,
          sortAriaLabel: t("LEVEL", "Level"),
        },
        filter: {
          kind: "select",
          menuPortal: true,
          value: p.levelFilter,
          onChange: (v) => p.setLevelFilter(v as ServerErrorLevelFilter),
          ariaLabel: t("LEVEL", "Level"),
          options: [
            { value: "", label: t("ALL") },
            { value: "ERROR", label: "ERROR" },
            { value: "CRITICAL", label: "CRITICAL" },
            { value: "WARNING", label: "WARNING" },
          ],
        },
        cell: ({ row }) => readCell(row.level),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "method",
        layout: { width: 4, minWidth: 80 },
        header: t("METHOD", "Method"),
        filter: {
          kind: "select",
          menuPortal: true,
          value: p.methodFilter,
          onChange: (v) => p.setMethodFilter(v as ServerErrorMethodFilter),
          ariaLabel: t("METHOD", "Method"),
          options: [
            { value: "", label: t("ALL") },
            { value: "GET", label: "GET" },
            { value: "POST", label: "POST" },
            { value: "PUT", label: "PUT" },
            { value: "PATCH", label: "PATCH" },
            { value: "DELETE", label: "DELETE" },
          ],
        },
        cell: ({ row }) => readCell(row.method),
      },
      {
        ...LOG_GRID_TEXT_OVERFLOW,
        id: "status_code",
        layout: { width: 4, minWidth: 72 },
        header: {
          kind: "sort",
          text: t("STATUS", "Status"),
          onSort: p.onSortStatus,
          sortIcon: p.statusSortIcon,
          sortAriaLabel: t("STATUS", "Status"),
        },
        filter: {
          kind: "search",
          value: p.colFilterStatus,
          onChange: (v) => p.setColFilterStatus(v.replace(/\D/g, "")),
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("STATUS", "Status"),
          size: "sm",
        },
        cell: ({ row }) => readCell(row.status_code),
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
    p.colFilterError,
    p.setColFilterError,
    p.levelFilter,
    p.setLevelFilter,
    p.methodFilter,
    p.setMethodFilter,
    p.colFilterStatus,
    p.setColFilterStatus,
    p.onSortId,
    p.onSortCreated,
    p.onSortLevel,
    p.onSortStatus,
    p.idSortIcon,
    p.createdSortIcon,
    p.levelSortIcon,
    p.statusSortIcon,
    p.onViewRow,
  ]);
}

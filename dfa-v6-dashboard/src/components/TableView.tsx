"use client";

import { type ReactNode, type RefObject } from "react";
import { Loader } from "@/components/Loader";
import { SecondaryButton } from "@/components/SecondaryButton";

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

export type InlineEditableTableProps = {
  scrollRef?: RefObject<HTMLDivElement | null>;
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  wrapClassName?: string;
  scrollClassName?: string;
  tableClassName?: string;
  tableAriaLabel?: string;
  thead: ReactNode;
  tbody: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  disableGlobalArrowNavigation?: boolean;
};

/** Shared table shell (datamanager `InlineEditableTable`). */
export function InlineEditableTable({
  scrollRef,
  error,
  onRetry,
  retryLabel = "Retry",
  wrapClassName = "tbl-wrap",
  scrollClassName = "tbl-scroll",
  tableClassName,
  tableAriaLabel,
  thead,
  tbody,
  footer,
  loading = false,
  loadingLabel,
  disableGlobalArrowNavigation = false,
}: InlineEditableTableProps) {
  const mergedWrapClassName = `${wrapClassName} tv-grid-wrap relative`;
  const mergedTableClassName = [tableClassName, "tv-grid-table"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={mergedWrapClassName}>
      {error ? (
        <div
          style={{
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--red-bg)",
            color: "var(--red)",
            margin: "1rem",
            borderRadius: "8px",
          }}
        >
          <span>{error}</span>
          {onRetry ? (
            <SecondaryButton type="button" onClick={onRetry}>
              {retryLabel}
            </SecondaryButton>
          ) : null}
        </div>
      ) : null}
      {!error ? (
        <div className={scrollClassName} ref={scrollRef}>
          <table className={mergedTableClassName} aria-label={tableAriaLabel}>
            {thead}
            {tbody}
          </table>
        </div>
      ) : null}
      {footer}
      {!error && loading ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[color:color-mix(in_srgb,var(--color-surface)_76%,transparent)] backdrop-blur-[1px]">
          <Loader loadingLabel={loadingLabel} />
        </div>
      ) : null}
    </div>
  );
}

const EDITABLE_GRID_DEFAULT_HEADER_LABEL_CLASS =
  "flex min-w-0 items-center gap-1.5 font-semibold text-xs text-text";

const EDITABLE_GRID_HEADER_LABEL_TEXT_CLASS =
  "min-w-0 shrink font-semibold text-xs text-text";

const DEFAULT_SORT_BUTTON_CLASS = "btn-comp-ghost--sort";

export type GridSortIcon = "arrow_upward" | "arrow_downward" | "unfold_more";

export type EditableGridHeaderLabelDef = { kind: "label"; text: string };

export type EditableGridHeaderSortDef = {
  kind: "sort";
  text: string;
  sortIcon: GridSortIcon;
  sortAriaLabel: string;
  sortButtonClassName?: string;
  onSort: () => void;
};

export type EditableGridHeaderEmptyDef = { kind: "empty" };

export type EditableGridHeaderSrOnlyDef = { kind: "sr-only"; text: string };

export type EditableGridHeaderObjectDef =
  | EditableGridHeaderLabelDef
  | EditableGridHeaderSortDef
  | EditableGridHeaderEmptyDef
  | EditableGridHeaderSrOnlyDef;

export type EditableGridHeaderDef = string | null | EditableGridHeaderObjectDef;

function normalizeEditableGridHeader(
  header: EditableGridHeaderDef,
): EditableGridHeaderObjectDef {
  if (header == null) return { kind: "empty" };
  if (typeof header === "string") return { kind: "label", text: header };
  return header;
}

export function renderEditableGridHeader(header: EditableGridHeaderDef): ReactNode {
  const def = normalizeEditableGridHeader(header);

  switch (def.kind) {
    case "empty":
      return null;
    case "label":
      return (
        <span className={EDITABLE_GRID_DEFAULT_HEADER_LABEL_CLASS}>{def.text}</span>
      );
    case "sort":
      return (
        <div className="th-sort-wrap">
          <span className={EDITABLE_GRID_HEADER_LABEL_TEXT_CLASS}>{def.text}</span>
          <button
            type="button"
            className={def.sortButtonClassName ?? DEFAULT_SORT_BUTTON_CLASS}
            onClick={def.onSort}
            aria-label={def.sortAriaLabel}
          >
            <Mi name={def.sortIcon} className="!text-sm" />
          </button>
        </div>
      );
    case "sr-only":
      return def.text;
    default:
      return null;
  }
}

export type EditableGridColumnDef = {
  id: string;
  className: string;
  cellClassName?: string;
  header: EditableGridHeaderDef;
  /** Custom ReactNode replacing the standard header rendering. */
  headerContent?: ReactNode;
  filterCell?: ReactNode;
  onCellDoubleClick?: (row: any) => void;
  cell: (row: any) => ReactNode;
}

type EditableTHeadProps = {
  columns: EditableGridColumnDef[];
}

export function InlineEditableTHead(props: EditableTHeadProps) {
  const { columns } = props;
  return (
    <thead>
      <tr>
        {columns.map((col) => {
          const headerDef = normalizeEditableGridHeader(col.header);
          const isSrOnly = headerDef.kind === "sr-only";
          return (
            <th key={col.id} className={col.className}>
              <div className={isSrOnly ? "th-merged-label sr-only" : "th-merged-label"}>
                {col.headerContent ?? renderEditableGridHeader(col.header)}
              </div>
              {col.filterCell != null ? (
                <div className="th-merged-filter">{col.filterCell}</div>
              ) : (
                <div className="th-merged-filter" aria-hidden />
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

type EditableTBodyProps = {
  columns: EditableGridColumnDef[];
  rows: any[];
  rowId: (row: any) => string;
  editingRowId?: string | null;
  activeRowId?: string | null;
  rowClassName?: (row: any) => string | undefined;
  loading?: boolean;
  emptyMessage?: string;
}

export function InlineEditableTBody(props: EditableTBodyProps) {
  const { columns, rows, rowId, editingRowId, activeRowId, rowClassName, loading, emptyMessage } = props;

  if (!loading && rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={columns.length} className="cell-empty text-center text-sm text-text-muted">
            {emptyMessage ?? "No data found."}
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {rows.map((row) => {
        const id = rowId(row);
        const isEditing = editingRowId === id;
        const isActive = activeRowId === id;
        const extraClassName = rowClassName?.(row);
        return (
          <tr
            key={id}
            data-tv-body-row="true"
            className={
              [
                isActive ? "tv-row-active" : undefined,
                isEditing ? "tv-row-editing" : undefined,
                extraClassName,
              ].filter(Boolean).join(" ") || undefined
            }
          >
            {columns.map((col) => (
              <td
                key={col.id}
                className={col.cellClassName ?? col.className}
                onDoubleClick={col.onCellDoubleClick ? () => col.onCellDoubleClick!(row) : undefined}
              >
                {col.cell(row)}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}
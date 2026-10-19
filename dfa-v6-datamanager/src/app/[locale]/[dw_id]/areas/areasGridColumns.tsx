"use client";

import {
  useMemo,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { ExpandChevronButton } from "@/components/ExpandChevronButton";
import { GridInlineSaveCancelActions } from "@/components/GridInlineSaveCancelActions";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import {
  renderEditableGridEditField,
  type EditableGridEditTextFieldDef,
} from "@/components/editableGridEditField";
import { gridTextFieldClassName } from "@/components/TextField";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  InlineEditRowActions,
  type EditableGridCellContext,
  type EditableGridColumnDef,
} from "@/components/TableView";
import { useCore } from "@/contexts/CoreContext";
import type { AreaInlineDraft, AreaTableRow } from "./areasTableShared";

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

type UseAreaGridColumnsParams = {
  rowsLength: number;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  nameFilter: string;
  setNameFilter: (value: string) => void;
  keywordFilter: string;
  setKeywordFilter: (value: string) => void;
  draft: AreaInlineDraft | null;
  setDraft: Dispatch<SetStateAction<AreaInlineDraft | null>>;
  saveLoading: boolean;
  onStartAdd: (rowId: string) => void;
  onStartEdit: (
    rowId: string,
    focusField?: "name" | "keyword" | "latitude" | "longitude"
  ) => void;
  onToggleExpand: (nodeId: string) => void;
  onSaveDraft: () => void;
  onCancelDraft: () => void;
  draftNameInputRef: RefObject<HTMLInputElement | null>;
  draftKeywordInputRef: RefObject<HTMLInputElement | null>;
  draftLatitudeInputRef: RefObject<HTMLInputElement | null>;
  draftLongitudeInputRef: RefObject<HTMLInputElement | null>;
  showTreeHierarchyControls: boolean;
};

function sanitizeSignedFloatInput(value: string): string {
  let out = "";
  let hasDot = false;
  let hasMinus = false;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (ch === "." && !hasDot) {
      out += ch;
      hasDot = true;
      continue;
    }
    if (ch === "-" && !hasMinus && out.length === 0) {
      out += ch;
      hasMinus = true;
    }
  }
  return out;
}

function isNodeDraftEdit(
  ctx: EditableGridCellContext<AreaTableRow>,
  draft: AreaInlineDraft | null
): boolean {
  return (
    ctx.mode === "edit" &&
    draft != null &&
    draft.rowId === ctx.row.rowId &&
    ctx.row.kind === "node"
  );
}

function renderReadonlyDataExists(
  row: AreaTableRow,
  t: (key: string, fallback?: string) => string
) {
  if (row.kind !== "node") {
    return <span className="text-xs text-slate-400">-</span>;
  }
  const label = row.node.hasData ? t("DATA_EXISTS") : t("NO_DATA");
  return (
    <ToggleSwitch
      readOnly
      disabled
      checked={row.node.hasData}
      aria-label={label}
      title={label}
    />
  );
}

export function useAreaTableColumns(
  p: UseAreaGridColumnsParams
): EditableGridColumnDef<AreaTableRow>[] {
  const { t } = useCore();

  return useMemo(() => {
    const nameEditField: EditableGridEditTextFieldDef<AreaTableRow> = {
      kind: "text",
      value: () => p.draft?.name ?? "",
      onChange: (v) =>
        p.setDraft((prev) => (prev ? { ...prev, name: v } : prev)),
      inputRef: p.draftNameInputRef,
      className: gridTextFieldClassName("min-w-[220px] flex-1"),
      placeholder: t("NAME"),
    };

    return [
      {
        id: "select",
        header: {
          kind: "selectAll",
          checked: p.rowsLength > 0 && p.selectedRowIds.size === p.rowsLength,
          onChange: p.selectAll,
          ariaLabel: t("SELECT_ALL_VISIBLE_ROWS"),
        },
        filter: null,
        layout: { width: 1 },
        cell: ({ row }) =>
          row.kind === "node" ? (
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={p.selectedRowIds.has(row.rowId)}
              onChange={() => p.toggleSelect(row.rowId)}
              aria-label={t("SELECT_ROW_AREA").replace("{name}", row.node.name)}
            />
          ) : (
            <span className="inline-block h-4 w-4" />
          ),
      },
      {
        id: "areaName",
        layout: { width: 8, unit: "%", sticky: true, main: true },
        header: t("AREA_NAME"),
        filter: {
          kind: "search",
          value: p.nameFilter,
          onChange: p.setNameFilter,
          placeholder: t("SEARCH_NAME_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_AREA_NAME"),
          size: "md",
        },
        onCellDoubleClick: ({ row }) => {
          if (row.kind === "node") p.onStartEdit(row.rowId, "name");
          if (row.kind === "add") p.onStartAdd(row.rowId);
        },
        cell: (ctx) => {
          const { row, mode } = ctx;
          const indent = row.depth * 24;
          const isEditingThisRow = mode === "edit" && p.draft?.rowId === row.rowId;
          if (row.kind === "add") {
            if (!isEditingThisRow || !p.draft) {
              return (
                <button
                  type="button"
                  className="add-row-prompt-btn h-8 min-h-8 py-0"
                  style={{ marginLeft: indent, width: `calc(100% - ${indent}px)` }}
                  onClick={() => p.onStartAdd(row.rowId)}
                >
                  <Mi name="add_circle_outline" className="!text-sm" />
                  <span>{row.label}</span>
                </button>
              );
            }
            return (
              <div
                className="flex min-h-8 items-center gap-2"
                style={{ marginLeft: indent, width: `calc(100% - ${indent}px)` }}
              >
                <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                  {row.levelName}
                </span>
                {renderEditableGridEditField(nameEditField, ctx)}
              </div>
            );
          }

          if (isEditingThisRow && p.draft) {
            return (
              <div className="flex items-center gap-2" style={{ marginLeft: indent }}>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                  {row.level.name}
                </span>
                {renderEditableGridEditField(nameEditField, ctx)}
              </div>
            );
          }

          return (
            <div className="flex items-center gap-1.5" style={{ marginLeft: indent }}>
              {p.showTreeHierarchyControls &&
                ((row.hasChildren || row.canAddChild) ? (
                  <ExpandChevronButton
                    expanded={row.expanded}
                    onClick={() => p.onToggleExpand(row.node.id)}
                    title={
                      row.expanded ? t("COLLAPSE_ROW") : t("EXPAND_ROW")
                    }
                    expandAriaLabel={t("EXPAND_ROW")}
                    collapseAriaLabel={t("COLLAPSE_ROW")}
                  />
                ) : (
                  <span className="w-5" />
                ))}
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                {row.level.name}
              </span>
              <span className="truncate text-left text-xs text-text" title={row.node.name}>
                {row.node.name}
              </span>
            </div>
          );
        },
      },
      {
        id: "keyword",
        layout: { width: 15, unit: "%" },
        header: t("AREA_ID"),
        filter: {
          kind: "search",
          value: p.keywordFilter,
          onChange: p.setKeywordFilter,
          placeholder: t("SEARCH_AREA_ID_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_AREA_ID"),
          size: "md",
        },
        onCellDoubleClick: ({ row }) => {
          if (row.kind === "node") p.onStartEdit(row.rowId, "keyword");
        },
        viewCell: ({ row }) => (
          <span className="text-xs text-text">
            {row.kind === "node" ? row.node.keyword || "-" : "-"}
          </span>
        ),
        editField: {
          kind: "text",
          value: () => p.draft?.keyword ?? "",
          onChange: (v) =>
            p.setDraft((prev) => (prev ? { ...prev, keyword: v } : prev)),
          inputRef: p.draftKeywordInputRef,
          when: (ctx) => isNodeDraftEdit(ctx, p.draft),
        },
      },
      {
        id: "latitude",
        layout: { width: 15, unit: "%" },
        header: t("LATITUDE"),
        filter: null,
        onCellDoubleClick: ({ row }) => {
          if (row.kind === "node") p.onStartEdit(row.rowId, "latitude");
        },
        viewCell: ({ row }) => (
          <span className="text-xs">
            {row.kind === "node" ? row.node.latitude || "-" : "-"}
          </span>
        ),
        editField: {
          kind: "text",
          value: () => p.draft?.latitude ?? "",
          onChange: (v) =>
            p.setDraft((prev) =>
              prev
                ? { ...prev, latitude: sanitizeSignedFloatInput(v) }
                : prev
            ),
          inputRef: p.draftLatitudeInputRef,
          type: "text",
          inputMode: "decimal",
          when: (ctx) => isNodeDraftEdit(ctx, p.draft),
        },
      },
      {
        id: "longitude",
        layout: { width: 15, unit: "%" },
        header: t("LONGITUDE"),
        filter: null,
        onCellDoubleClick: ({ row }) => {
          if (row.kind === "node") p.onStartEdit(row.rowId, "longitude");
        },
        viewCell: ({ row }) => (
          <span className="text-xs">
            {row.kind === "node" ? row.node.longitude || "-" : "-"}
          </span>
        ),
        editField: {
          kind: "text",
          value: () => p.draft?.longitude ?? "",
          onChange: (v) =>
            p.setDraft((prev) =>
              prev
                ? { ...prev, longitude: sanitizeSignedFloatInput(v) }
                : prev
            ),
          inputRef: p.draftLongitudeInputRef,
          type: "text",
          inputMode: "decimal",
          when: (ctx) => isNodeDraftEdit(ctx, p.draft),
        },
      },
      {
        id: "dataExists",
        layout: { width: 15, unit: "%" },
        header: t("DATA_EXISTS"),
        filter: null,
        onCellDoubleClick: ({ row }) => {
          if (row.kind === "node") p.onStartEdit(row.rowId, "name");
        },
        cell: ({ row }) => renderReadonlyDataExists(row, t),
      },
      {
        id: "actions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        onCellDoubleClick: ({ row }) => {
          if (row.kind === "node") p.onStartEdit(row.rowId, "name");
        },
        cell: ({ row, mode }) => {
          const isEditingThisRow = mode === "edit" && p.draft?.rowId === row.rowId;
          if (row.kind === "add") {
            const isActiveAddDraft =
              isEditingThisRow && p.draft?.mode === "add" && p.draft.rowId === row.rowId;
            const canSaveAddDraft = Boolean(
              isActiveAddDraft &&
                p.draft?.name.trim() &&
                p.draft?.keyword.trim()
            );
            return (
              <GridInlineSaveCancelActions
                onSave={() => {
                  if (!canSaveAddDraft) return;
                  p.onSaveDraft();
                }}
                onCancel={() => {
                  if (!isActiveAddDraft) return;
                  p.onCancelDraft();
                }}
                saveLoading={p.saveLoading}
                saveDisabled={!canSaveAddDraft}
                cancelDisabled={!isActiveAddDraft}
                saveTitle={
                  canSaveAddDraft
                    ? t("ADD_AREA")
                    : t("ENTER_AREA_NAME_AND_AREA_ID")
                }
                saveAriaLabel={
                  canSaveAddDraft
                    ? t("ADD_AREA")
                    : t("ADD_AREA_ENTER_NAME_AND_ID")
                }
                cancelTitle={t("CANCEL_ADDING")}
                cancelAriaLabel={t("CANCEL_ADDING")}
              />
            );
          }
          return (
            <InlineEditRowActions
              isEditing={isEditingThisRow}
              saveLoading={p.saveLoading}
              onSave={p.onSaveDraft}
              onCancel={p.onCancelDraft}
              saveTitle={p.draft?.mode === "add" ? t("ADD_AREA") : t("SAVE_AREA")}
              saveAriaLabel={p.draft?.mode === "add" ? t("ADD_AREA") : t("SAVE_AREA")}
              viewContent={null}
            />
          );
        },
      },
    ];
  }, [p, t]);
}

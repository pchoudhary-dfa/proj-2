"use client";

import { useMemo, type DragEvent } from "react";
import { GridInlineSaveCancelActions } from "@/components/GridInlineSaveCancelActions";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import type { EditableGridColumnDef } from "@/components/TableView";
import type { SubgroupTableRow, DimensionCategory } from "./subgroupsTableShared";

function dimComboboxOptions(dim: DimensionCategory, search: string) {
  const q = search.trim().toLowerCase();
  return dim.values
    .filter((v) => !q || v.name.toLowerCase().includes(q))
    .map((v) => ({ id: v.gid, label: v.name }));
}

function dimSelectedLabel(dim: DimensionCategory, selectedGid: string | null): string {
  if (!selectedGid) return "";
  return dim.values.find((v) => v.gid === selectedGid)?.name ?? selectedGid;
}

export type UseSubgroupGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  hasSelectableRows: boolean;
  allSelectableRowsSelected: boolean;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  isRowSelectable: (row: SubgroupTableRow) => boolean;
  dimensions: DimensionCategory[];
  colFilterName: string;
  setColFilterName: (v: string) => void;
  dimensionFilters: Record<string, string>;
  setDimensionFilter: (dimGid: string, value: string) => void;
  onDimensionHeaderClick: (dim: DimensionCategory) => void;
  onAddDimensionClick: () => void;
  addDimensionLoading: boolean;
  addDimensionDisabled: boolean;
  highlightedDimensionGid: string | null;
  onClearHighlightedDimension: () => void;
  draggingDimensionGid: string | null;
  dragOverDimensionGid: string | null;
  onDimensionDragStart: (dimGid: string) => void;
  onDimensionDragOver: (dimGid: string) => void;
  onDimensionDragLeave: (dimGid: string) => void;
  onDimensionDrop: (targetDimGid: string) => void;
  onDimensionDragEnd: () => void;
  // Inline edit
  editingRowId: string | null;
  canUpdate: boolean;
  inlineDimValueGids: Record<string, string | null>;
  setInlineDimValueGid: (dimGid: string, valueGid: string | null) => void;
  inlineDimComboSearch: Record<string, string>;
  inlineDimComboOpen: Record<string, boolean>;
  inlineDimComboHi: Record<string, number>;
  setInlineDimComboSearchFor: (dimGid: string, search: string) => void;
  setInlineDimComboOpenFor: (dimGid: string, open: boolean) => void;
  setInlineDimComboHiFor: (dimGid: string, hi: number) => void;
  inlineSaveLoading: boolean;
  onStartInlineEdit: (row: SubgroupTableRow) => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
};

export function useSubgroupTableColumns(
  p: UseSubgroupGridColumnsParams
): EditableGridColumnDef<SubgroupTableRow>[] {
  const { t } = p;
  return useMemo((): EditableGridColumnDef<SubgroupTableRow>[] => {
    const selectCol: EditableGridColumnDef<SubgroupTableRow> = {
      id: "select",
      layout: { width: 1 },
      header: {
        kind: "selectAll",
        checked: p.hasSelectableRows && p.allSelectableRowsSelected,
        onChange: p.selectAll,
        disabled: !p.hasSelectableRows,
        ariaLabel: t("SELECT_ALL"),
      },
      filter: null,
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="checkbox-comp"
          checked={p.isRowSelectable(row) && p.selectedRowIds.has(row.rowId)}
          onChange={() => p.toggleSelect(row.rowId)}
          disabled={!p.isRowSelectable(row)}
          aria-label={t("SELECT_ROW_AREA", "Select {name}").replace(
            "{name}",
            row.subgroupName || ""
          )}
        />
      ),
    };

    const nameCol: EditableGridColumnDef<SubgroupTableRow> = {
      id: "subgroup_name",
      layout: { width: 220, sticky: true, main: true },
      header: t("SUBGROUP_NAME"),
      filter: {
        kind: "search",
        value: p.colFilterName,
        onChange: p.setColFilterName,
        placeholder: t("SEARCH_NAME_PLACEHOLDER"),
        ariaLabel: t("FILTER_BY_SUBGROUP_NAME"),
      },
      onCellDoubleClick: ({ row }) => {
        if (!row.subgroupRaw.is_system && p.canUpdate) p.onStartInlineEdit(row);
      },
      cell: ({ row, mode }) => {
        let displayName = row.subgroupName || "—";
        if (mode === "edit" && p.editingRowId === row.rowId) {
          const parts: string[] = [];
          for (const dim of p.dimensions) {
            const valGid = p.inlineDimValueGids[dim.gid];
            if (valGid) {
              const found = dim.values.find((v) => v.gid === valGid);
              if (found) parts.push(found.name);
            }
          }
          displayName = parts.length > 0 ? parts.join(" ") : "—";
        }
        return (
          <span className="cell-name" title={displayName}>
            {displayName}
            {Boolean(row.subgroupRaw.is_system) && (
              <span className="label-tag tone-pill--muted-subtle ml-1.5">
                {t("SYSTEM_ROLE_BADGE", "System")}
              </span>
            )}
          </span>
        );
      },
    };

    const dimensionCols: EditableGridColumnDef<SubgroupTableRow>[] =
      p.dimensions.map((dim) => {
        const isHighlighted = p.highlightedDimensionGid === dim.gid;
        const isDragging = p.draggingDimensionGid === dim.gid;
        const isDragOver = p.dragOverDimensionGid === dim.gid;

        const dimColStateClass = [
          isDragging ? "col-drag-source" : "",
          isDragOver ? "col-drop-target" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const onColDragOver = (event: DragEvent) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          p.onDimensionDragOver(dim.gid);
        };
        const onColDrop = (event: DragEvent) => {
          event.preventDefault();
          p.onDimensionDrop(dim.gid);
        };

        const headerThExtraProps = {
          draggable: true,
          title: t(
            "SUBGROUPS_DIM_COL_DRAG_HINT",
            "Drag this column to reorder subgroup categories"
          ),
          className: [dimColStateClass, "col-grab"].filter(Boolean).join(" "),
          onDragStart: (event: DragEvent) => {
            event.dataTransfer.effectAllowed = "move";
            try {
              event.dataTransfer.setData("text/plain", dim.gid);
            } catch {
              /* ignore */
            }
            p.onDimensionDragStart(dim.gid);
          },
          onDragOver: onColDragOver,
          onDragLeave: () => p.onDimensionDragLeave(dim.gid),
          onDrop: onColDrop,
          onDragEnd: p.onDimensionDragEnd,
        };

        const filterThExtraProps = {
          className: dimColStateClass,
          onDragOver: onColDragOver,
          onDragLeave: () => p.onDimensionDragLeave(dim.gid),
          onDrop: onColDrop,
        };

        const isEditing = p.editingRowId != null;
        const tdExtraProps = {
          draggable: !isEditing,
          title: isEditing
            ? undefined
            : t(
                "SUBGROUPS_DIM_COL_DRAG_HINT",
                "Drag this column to reorder subgroup categories"
              ),
          className: [dimColStateClass, isEditing ? "" : "col-grab"].filter(Boolean).join(" "),
          onDragStart: isEditing
            ? undefined
            : (event: DragEvent) => {
                event.dataTransfer.effectAllowed = "move";
                try {
                  event.dataTransfer.setData("text/plain", dim.gid);
                } catch {
                  /* ignore */
                }
                p.onDimensionDragStart(dim.gid);
              },
          onDragOver: isEditing ? undefined : onColDragOver,
          onDragLeave: isEditing ? undefined : () => p.onDimensionDragLeave(dim.gid),
          onDrop: isEditing ? undefined : onColDrop,
          onDragEnd: isEditing ? undefined : p.onDimensionDragEnd,
        };

        return {
          id: `dim-${dim.gid}`,
          layout: { width: 220 },
          header: {
            kind: "columnToolbar",
            leadingIcon: "drag_indicator",
            label: dim.name,
            onLabelClick: () => p.onDimensionHeaderClick(dim),
            labelTitle: dim.name,
            highlight: isHighlighted
              ? {
                  onClear: p.onClearHighlightedDimension,
                  clearAriaLabel: t("CLEAR_DIMENSION_HIGHLIGHT").replace(
                    "{name}",
                    dim.name
                  ),
                  closeTitle: t("CLOSE_HIGHLIGHT"),
                }
              : undefined,
          },
          filter: {
            kind: "search",
            value: p.dimensionFilters[dim.gid] ?? "",
            onChange: (v) => p.setDimensionFilter(dim.gid, v),
            placeholder: t("FILTER_PLACEHOLDER"),
            ariaLabel: t("FILTER_BY_DIMENSION").replace("{name}", dim.name),
          },
          className: isHighlighted ? "col-highlight" : undefined,
          headerThExtraProps,
          filterThClassName: `th-search-cell ${isHighlighted ? "col-highlight" : ""}`,
          filterThExtraProps,
          tdExtraProps,
          onCellDoubleClick: ({ row }) => {
            if (!row.subgroupRaw.is_system && p.canUpdate) p.onStartInlineEdit(row);
          },
          viewCell: ({ row }) => {
            const val = row.dimensionValues[dim.gid];
            return (
              <span
                className={`block max-w-full truncate text-xs ${val ? "text-text" : "text-text-muted"}`}
                title={val ?? "—"}
              >
                {val || "—"}
              </span>
            );
          },
          editField: {
            kind: "combobox",
            when: ({ row, mode }) => mode === "edit" && p.editingRowId === row.rowId,
            disabled: p.inlineSaveLoading,
            ariaLabel: dim.name,
            placeholder: `${t("SELECT", "Select")}...`,
            selectedId: () => p.inlineDimValueGids[dim.gid] ?? null,
            inputValue: () => {
              const selectedGid = p.inlineDimValueGids[dim.gid] ?? null;
              if (selectedGid) return dimSelectedLabel(dim, selectedGid);
              return p.inlineDimComboSearch[dim.gid] ?? "";
            },
            onInputChange: (v) => {
              p.setInlineDimComboSearchFor(dim.gid, v);
              p.setInlineDimComboOpenFor(dim.gid, true);
              p.setInlineDimComboHiFor(dim.gid, -1);
              if (!v) {
                p.setInlineDimValueGid(dim.gid, null);
              } else {
                const selectedGid = p.inlineDimValueGids[dim.gid] ?? null;
                if (selectedGid) {
                  const curName = dimSelectedLabel(dim, selectedGid);
                  if (curName && v.trim().toLowerCase() !== curName.trim().toLowerCase()) {
                    p.setInlineDimValueGid(dim.gid, null);
                  }
                }
              }
            },
            open: () => p.inlineDimComboOpen[dim.gid] ?? false,
            onOpenChange: (next) => {
              p.setInlineDimComboOpenFor(dim.gid, next);
              if (!next) p.setInlineDimComboHiFor(dim.gid, -1);
            },
            highlightIndex: () => p.inlineDimComboHi[dim.gid] ?? -1,
            onHighlightChange: (hi) => p.setInlineDimComboHiFor(dim.gid, hi),
            navigableCount: () =>
              dimComboboxOptions(dim, p.inlineDimComboSearch[dim.gid] ?? "").length,
            options: () =>
              dimComboboxOptions(dim, p.inlineDimComboSearch[dim.gid] ?? ""),
            onSelect: (id) => {
              p.setInlineDimValueGid(dim.gid, id);
              p.setInlineDimComboSearchFor(dim.gid, "");
              p.setInlineDimComboOpenFor(dim.gid, false);
              p.setInlineDimComboHiFor(dim.gid, -1);
            },
            onEnterWhenClosed: p.onInlineSave,
            emptyMessage: t("NO_VALUES_MATCH", "No matching values"),
            openOnArrowDown: false,
            menuPortal: true,
          },
        };
      });

    const addDimensionCol: EditableGridColumnDef<SubgroupTableRow> = {
      id: "add-dimension",
      layout: ICON_ACTION_COLUMN_LAYOUT,
      header: null,
      headerAfter: (
        <button
          type="button"
          className="add-row-prompt-btn-icon mx-auto"
          title={t("ADD_DIMENSION")}
          aria-label={t("ADD_DIMENSION")}
          onClick={p.onAddDimensionClick}
          disabled={p.addDimensionLoading || p.addDimensionDisabled}
        >
          <span className="material-icons !text-sm" aria-hidden>
            {p.addDimensionLoading ? "hourglass_top" : "add"}
          </span>
        </button>
      ),
      filter: null,
      cell: ({ row, mode }) => {
        if (mode === "edit" && p.editingRowId === row.rowId) {
          return (
            <GridInlineSaveCancelActions
              onSave={p.onInlineSave}
              onCancel={p.onInlineCancel}
              saveLoading={p.inlineSaveLoading}
              saveTitle={t("SAVE", "Save")}
              saveAriaLabel={t("SAVE", "Save")}
              cancelTitle={t("CANCEL_EDIT", "Cancel editing")}
              cancelAriaLabel={t("CANCEL_EDIT", "Cancel editing")}
            />
          );
        }
        return null;
      },
    };

    return [selectCol, nameCol, ...dimensionCols, addDimensionCol];
  }, [t, p]);
}

"use client";

import type { Dispatch, ReactNode, RefObject, SetStateAction, UIEvent } from "react";
import { useMemo } from "react";
import type { MouseEvent } from "react";
import type { IndicatorsListMeta } from "@/lib/api/types";
import type { SearchableListComboboxOption } from "@/components/SearchableListCombobox";
import { gridTextFieldClassName } from "@/components/TextField";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { GridConfigureButton } from "@/components/GridConfigureButton";
import {
  ICON_ACTION_COLUMN_LAYOUT,
  TV_COL_KEY_HIGH,
} from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  InlineEditRowActions,
  type EditableGridColumnDef,
} from "@/components/TableView";
import type {
  IndicatorTableRow,
  InlineEditFocusField,
  InlineEditModel,
} from "./indicatorTableShared";

export type HighIsGoodFilter = "" | "yes" | "no";

export type UseIndicatorGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  rowsLength: number;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  onSortIndicator: () => void;
  indicatorSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  colFilterIndicator: string;
  setColFilterIndicator: (v: string) => void;
  colFilterUnits: string;
  setColFilterUnits: (v: string) => void;
  colFilterSubgroups: string;
  setColFilterSubgroups: (v: string) => void;
  highIsGoodFilter: HighIsGoodFilter;
  setHighIsGoodFilter: (v: HighIsGoodFilter) => void;
  inlineEdit: InlineEditModel | null;
  setInlineEdit: Dispatch<SetStateAction<InlineEditModel | null>>;
  inlineEditNameInputRef: RefObject<HTMLInputElement | null>;
  inlineEditUnitInputRef: RefObject<HTMLInputElement | null>;
  inlineEditHighToggleRef: RefObject<HTMLButtonElement | null>;
  inlineSaveLoading: boolean;
  inlineRowUnitCreateLoading: boolean;
  inlineRowUnitShowCreate: boolean;
  inlineUnitComboOptions: SearchableListComboboxOption[];
  inlineUnitPickerLoading: boolean;
  onInlineUnitListScroll: (event: UIEvent<HTMLDivElement>) => void;
  onInlineUnitNeedMore: () => void;
  inlineUnitListFooter: ReactNode;
  resolveUnitInputLabel: (unitGid: string | null | undefined) => string;
  meta: IndicatorsListMeta | null;
  onInlineCellDoubleClick: (
    row: IndicatorTableRow,
    focus: InlineEditFocusField,
    e: MouseEvent
  ) => void;
  handleInlineCreateUnit: () => Promise<void>;
  handleInlineEditSave: () => Promise<void>;
  handleInlineEditCancel: () => void;
  openConfigPanel: (row: IndicatorTableRow) => void;
  getUnitDisplay: (unitGid: string | null) => string;
  getSubgroupListDisplay: (sgGids: string[]) => string[] | "—";
  getSubgroupFallbackLabel: (gid: string) => string;
  rows: IndicatorTableRow[];
};

export function useIndicatorTableColumns(
  p: UseIndicatorGridColumnsParams
): EditableGridColumnDef<IndicatorTableRow>[] {
  const { t } = p;
  const inlineUnitNavCount =
    p.inlineUnitComboOptions.length + (p.inlineRowUnitShowCreate ? 1 : 0);
  return useMemo((): EditableGridColumnDef<IndicatorTableRow>[] => {
    return [
      {
        id: "select",
        layout: { width: 1 },
        header: {
          kind: "selectAll",
          checked: p.rowsLength > 0 && p.selectedRowIds.size === p.rowsLength,
          onChange: p.selectAll,
          ariaLabel: "Select all",
        },
        filter: null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={p.selectedRowIds.has(row.rowId)}
            onChange={() => p.toggleSelect(row.rowId)}
            aria-label={`Select ${row.indicator.indicator_name ?? row.indicator.indicator_nid}`}
          />
        ),
      },
      {
        id: "indicator",
        layout: { width: 320, minWidth: 200, sticky: true, main: true },
        header: {
          kind: "sort",
          text: t("INDICATORS"),
          onSort: p.onSortIndicator,
          sortIcon: p.indicatorSortIcon,
          sortAriaLabel: t("SORT_INDICATORS"),
        },
        filter: {
          kind: "search",
          value: p.colFilterIndicator,
          onChange: p.setColFilterIndicator,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_INDICATOR"),
        },
        onCellDoubleClick: (ctx, e) => p.onInlineCellDoubleClick(ctx.row, "name", e),
        viewCell: ({ row }) => (
          <span className="cell-name">
            {row.indicator.indicator_name ?? row.indicator.indicator_gid ?? "—"}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineEdit?.name ?? "",
          onChange: (v) =>
            p.setInlineEdit((ie) => (ie ? { ...ie, name: v } : null)),
          inputRef: p.inlineEditNameInputRef,
          disabled: p.inlineSaveLoading,
          ariaLabel: t("EDIT_INDICATOR_NAME"),
          when: ({ mode }) => mode === "edit" && p.inlineEdit != null,
        },
      },
      {
        id: "units",
        layout: { width: 5, minWidth: 80 },
        header: t("UNITS"),
        filter: {
          kind: "search",
          value: p.colFilterUnits,
          onChange: p.setColFilterUnits,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_UNIT"),
        },
        onCellDoubleClick: (ctx, e) => p.onInlineCellDoubleClick(ctx.row, "unit", e),
        viewCell: ({ row }) =>
          row.unitGid == null ? (
            <span className="cell-empty">—</span>
          ) : (
            <span className="cell-name">{p.getUnitDisplay(row.unitGid)}</span>
          ),
        editField: {
          kind: "combobox",
          inputRef: p.inlineEditUnitInputRef,
          inputClassName: gridTextFieldClassName(),
          placeholder: t("UNIT_COMBO_PLACEHOLDER"),
          disabled: p.inlineSaveLoading || p.inlineRowUnitCreateLoading,
          ariaLabel: t("EDIT_UNIT"),
          when: ({ mode }) => mode === "edit" && p.inlineEdit != null,
          inputValue: () =>
            p.inlineEdit!.unitGid
              ? p.resolveUnitInputLabel(p.inlineEdit!.unitGid)
              : p.inlineEdit!.unitSearch,
          onInputChange: (v) => {
            p.setInlineEdit((ie) => {
              if (!ie) return null;
              const next: InlineEditModel = {
                ...ie,
                unitSearch: v,
                unitDdOpen: true,
                unitHi: -1,
              };
              if (!v) next.unitGid = null;
              else if (ie.unitGid) {
                const curName = p.resolveUnitInputLabel(ie.unitGid);
                if (
                  curName &&
                  v.trim().toLowerCase() !== curName.trim().toLowerCase()
                ) {
                  next.unitGid = null;
                }
              }
              return next;
            });
          },
          open: () => p.inlineEdit!.unitDdOpen,
          onOpenChange: (open) =>
            p.setInlineEdit((ie) =>
              ie ? { ...ie, unitDdOpen: open, ...(!open ? { unitHi: -1 } : {}) } : null
            ),
          highlightIndex: () => p.inlineEdit!.unitHi,
          onHighlightChange: (unitHi) =>
            p.setInlineEdit((ie) => (ie ? { ...ie, unitHi } : null)),
          navigableCount: inlineUnitNavCount,
          options: p.inlineUnitComboOptions,
          selectedId: () => p.inlineEdit!.unitGid,
          onSelect: (id) =>
            p.setInlineEdit((ie) =>
              ie
                ? {
                    ...ie,
                    unitGid: id,
                    unitSearch: "",
                    unitDdOpen: false,
                    unitHi: -1,
                  }
                : null
            ),
          emptyMessage: p.inlineUnitPickerLoading ? t("LOADING") : t("NO_UNITS_MATCH"),
          createSlot: p.inlineRowUnitShowCreate
            ? {
                show: true,
                loading: p.inlineRowUnitCreateLoading,
                label: t("CREATE_UNIT").replace(
                  "{name}",
                  p.inlineEdit?.unitSearch.trim() ?? ""
                ),
                onCreate: () => void p.handleInlineCreateUnit(),
                highlightIndex: p.inlineUnitComboOptions.length,
              }
            : undefined,
          onListScroll: p.onInlineUnitListScroll,
          onNeedMoreIfNotScrollable: p.onInlineUnitNeedMore,
          listFooter: p.inlineUnitListFooter,
          afterSelectFocusRef: p.inlineEditHighToggleRef,
          openOnArrowDown: false,
          menuPortal: true,
        },
      },
      {
        id: "subgroups",
        layout: { width: 24, unit: "%", minWidth: 180, maxWidth: 480 },
        header: t("SUBGROUPS"),
        filter: {
          kind: "search",
          value: p.colFilterSubgroups,
          onChange: p.setColFilterSubgroups,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_SUBGROUP_NAME"),
        },
        cell: ({ row }) => {
          const names = p.getSubgroupListDisplay(row.sgGids);
          if (names === "—" || (Array.isArray(names) && names.length === 0)) {
            const onlyDefault =
              row.defaultSgGid != null
                ? p.meta?.subgroup?.[row.defaultSgGid]?.sg_name ??
                  p.getSubgroupFallbackLabel(row.defaultSgGid)
                : null;
            if (onlyDefault) {
              return (
                <div className="dim-list" title={onlyDefault}>
                  <span className="cell-name">{onlyDefault}</span>
                </div>
              );
            }
            return <span className="cell-empty">—</span>;
          }
          if (Array.isArray(names)) {
            const title = names.join(", ");
            const defGid = row.defaultSgGid;
            const primary =
              defGid != null
                ? p.meta?.subgroup?.[defGid]?.sg_name ?? p.getSubgroupFallbackLabel(defGid)
                : names[0];
            return (
              <div className="dim-list" title={title}>
                <span className="cell-name">{primary}</span>
              </div>
            );
          }
          return <span className="cell-empty">—</span>;
        },
      },
      {
        id: "high",
        layout: { width: 4 },
        header: t("HIGH_IS_GOOD"),
        filter: {
          kind: "select",
          menuPortal: true,
          value: p.highIsGoodFilter,
          onChange: (v) => p.setHighIsGoodFilter(v as HighIsGoodFilter),
          ariaLabel: t("HIGH_IS_GOOD"),
          options: [
            { value: "", label: t("ALL") },
            { value: "yes", label: t("YES") },
            { value: "no", label: t("NO") },
          ],
        },
        onCellDoubleClick: (ctx, e) => p.onInlineCellDoubleClick(ctx.row, "high", e),
        cell: ({ row, mode }) =>
          mode === "edit" && p.inlineEdit ? (
            <ToggleSwitch
              ref={p.inlineEditHighToggleRef}
              data-tv-enter-field="true"
              checked={p.inlineEdit.highIsGood}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() =>
                p.setInlineEdit({
                  ...p.inlineEdit!,
                  highIsGood: !p.inlineEdit!.highIsGood,
                })
              }
              disabled={p.inlineSaveLoading}
              aria-label={t("HIGH_IS_GOOD")}
            />
          ) : (
            <ToggleSwitch
              readOnly
              checked={row.indicator.highisgood}
              title={row.indicator.highisgood ? t("YES") : t("NO")}
              aria-label={row.indicator.highisgood ? t("YES") : t("NO")}
            />
          ),
      },
      {
        id: "actions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        onCellDoubleClick: (ctx, e) => p.onInlineCellDoubleClick(ctx.row, "name", e),
        cell: ({ row, mode }) => (
          <InlineEditRowActions
            isEditing={Boolean(mode === "edit" && p.inlineEdit)}
            saveLoading={p.inlineSaveLoading}
            onSave={() => void p.handleInlineEditSave()}
            onCancel={p.handleInlineEditCancel}
            viewContent={
              <GridConfigureButton
                wrapInActionBtns
                ariaLabel={t("CONFIGURE")}
                onClick={(e) => {
                  e.stopPropagation();
                  p.openConfigPanel(row);
                }}
              />
            }
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
    p.onSortIndicator,
    p.indicatorSortIcon,
    p.colFilterIndicator,
    p.setColFilterIndicator,
    p.colFilterUnits,
    p.setColFilterUnits,
    p.colFilterSubgroups,
    p.setColFilterSubgroups,
    p.highIsGoodFilter,
    p.setHighIsGoodFilter,
    p.inlineEdit,
    p.setInlineEdit,
    p.inlineEditNameInputRef,
    p.inlineEditUnitInputRef,
    p.inlineEditHighToggleRef,
    p.inlineSaveLoading,
    p.inlineRowUnitCreateLoading,
    p.inlineRowUnitShowCreate,
    p.inlineUnitComboOptions,
    inlineUnitNavCount,
    p.inlineUnitPickerLoading,
    p.onInlineUnitListScroll,
    p.onInlineUnitNeedMore,
    p.inlineUnitListFooter,
    p.resolveUnitInputLabel,
    p.meta,
    p.onInlineCellDoubleClick,
    p.handleInlineCreateUnit,
    p.handleInlineEditSave,
    p.handleInlineEditCancel,
    p.openConfigPanel,
    p.getUnitDisplay,
    p.getSubgroupListDisplay,
    p.getSubgroupFallbackLabel,
    p.rows,
  ]);
}

"use client";

import { useMemo, useState } from "react";
import type { ComputeProcessListItem } from "@/lib/api/computeProcess";
import type { AreaLevelCatalogRow } from "@/lib/datamanager/computeProcessFilterCatalog";
import {
  dualActionColumnHeader,
  type EditableGridColumnDef,
} from "@/components/TableView";
import { ExpandChevronButton } from "@/components/ExpandChevronButton";
import type { SearchableListComboboxOption } from "@/components/SearchableListCombobox";
import { Modal } from "@/components/Modal";
import { SecondaryButton } from "@/components/SecondaryButton";
import { formatTargetIusGridLabel } from "@/lib/compute/iusDisplayLabel";
import {
  DUAL_ACTION_COLUMN_LAYOUT,
  dualActionColumnThExtras,
  TV_GRID_CONFIGURE_BTN,
  TV_GRID_CONFIGURE_LABELED_BTN,
} from "@/components/editableGridColumnClasses";

export const COMPUTE_PROCESS_GRID_COL_COUNT = 6;

export function computeProcessRowId(row: ComputeProcessListItem): string {
  return String(row.id);
}

function formatCreatedAt(raw: string | null, locale: string): string {
  if (!raw?.trim()) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getAreasFromFilter(
  filter: Record<string, unknown>
): string[] {
  const a = filter.areas;
  if (!Array.isArray(a)) return [];
  return a.map((x) => String(x));
}

export function getTargetIusFromFilter(
  filter: Record<string, unknown>
): string[] {
  const sel = filter.ius_selection;
  if (!sel || typeof sel !== "object" || Array.isArray(sel)) return [];
  const ti = (sel as Record<string, unknown>).target_ius;
  if (!Array.isArray(ti)) return [];
  return ti.map((x) => String(x));
}

export function getSrcPublisher(filter: Record<string, unknown>): string {
  const v = filter.src_publisher;
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

export function getSrcTitle(filter: Record<string, unknown>): string {
  const v = filter.src_title;
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function resolveAreaHierarchyLevel(
  areaKey: string,
  areaKeyToLevel: Map<string, number>,
  areasCatalog: ReadonlyArray<{ ar_id: string; ar_gid: string; ar_level: number }>
): number | undefined {
  const fromMap = areaKeyToLevel.get(areaKey);
  if (Number.isFinite(fromMap)) return fromMap as number;
  const row = areasCatalog.find(
    (a) => a.ar_id === areaKey || a.ar_gid === areaKey
  );
  return row && Number.isFinite(row.ar_level) ? row.ar_level : undefined;
}

function areaLevelNameFromNid(
  areaLevels: AreaLevelCatalogRow[],
  nid: number
): string | undefined {
  const row = areaLevels.find((l) => l.al_nid === nid);
  return row?.al_name;
}

/** Labels area level column from stored area keys + catalog (matches lvlnum pick options). */
export function formatAreaLevelCellDisplay(
  areas: string[],
  areaLevels: AreaLevelCatalogRow[],
  areaKeyToLevel: Map<string, number>,
  areasCatalog: ReadonlyArray<{
    ar_id: string;
    ar_gid: string;
    ar_level: number;
  }>,
  t: (code: string, fallback?: string) => string,
  areaLevelNid?: number | null
): string {
  if (areas.length === 0) return "—";
  if (areas.length === 1 && areas[0] === "all") {
    return t("ALL", "All");
  }
  if (areaLevelNid != null && Number.isFinite(areaLevelNid)) {
    const fromNid = areaLevelNameFromNid(areaLevels, areaLevelNid);
    if (fromNid) return fromNid;
  }
  const levelNums = new Set<number>();
  for (const key of areas) {
    if (key === "all") continue;
    const lvl = resolveAreaHierarchyLevel(key, areaKeyToLevel, areasCatalog);
    if (lvl != null) levelNums.add(lvl);
  }
  if (levelNums.size === 0) {
    const count = areas.filter((a) => a !== "all").length;
    return count > 0
      ? t("N_AREAS", "{count} areas").replace("{count}", String(count))
      : "—";
  }
  const sorted = [...levelNums].sort((a, b) => a - b);
  const parts = sorted.map((n) => {
    const row = areaLevels.find((l) => l.al_level === n);
    return row ? row.al_name : String(n);
  });
  return parts.join(", ");
}

export function rowMatchesComputeFilters(
  row: ComputeProcessListItem,
  areaLevelKey: string,
  areaUnderQuery: string,
  targetIusQuery: string,
  areaKeyToLevel: Map<string, number>,
  areasCatalog: ReadonlyArray<{ ar_id: string; ar_name?: string | null }>,
  iusLabelByGid: ReadonlyMap<string, string>
): boolean {
  const au = areaUnderQuery.trim();
  const iu = targetIusQuery.trim();
  const areas = getAreasFromFilter(row.filter_object);
  const ius = getTargetIusFromFilter(row.filter_object);

  const isAllAreas = areas.length === 1 && areas[0] === "all";

  /* AREA jobs ignore filter_object.areas at execution; do not filter AREA rows by area UI. */
  if (row.process_type !== "AREA") {
    if (areaLevelKey.startsWith("lvlnum:")) {
      const n = Number(areaLevelKey.slice("lvlnum:".length));
      if (!Number.isFinite(n)) return false;
      if (isAllAreas) return false;
      const hit = areas.some((gid) => {
        if (gid === "all") return false;
        const lvl = areaKeyToLevel.get(gid);
        return lvl === n;
      });
      if (!hit) return false;
    }

    if (au) {
      const q = au.toLowerCase();
      const hit = areas.some((a) => {
        if (a === "all") return false;
        if (a === au) return true;
        if (a.toLowerCase().includes(q)) return true;
        const rowCat = areasCatalog.find((x) => x.ar_id === a);
        const nm = (rowCat?.ar_name ?? "").toLowerCase();
        return nm.includes(q);
      });
      if (!hit) return false;
    }
  }

  if (iu) {
    const ql = iu.toLowerCase();
    const hay = ius.some((g) => {
      if (g === iu || g.toLowerCase().includes(ql)) return true;
      const lab = (iusLabelByGid.get(g) ?? "").toLowerCase();
      return lab.includes(ql);
    });
    if (!hay) return false;
  }

  return true;
}

function targetIusDisplayLabel(
  gid: string,
  iusLabelByGid: ReadonlyMap<string, string>
): string {
  const lab = (iusLabelByGid.get(gid) ?? "").trim();
  return formatTargetIusGridLabel(lab || gid);
}

const TARGET_IUS_INLINE_MAX = 3;

/** Target IUS summary (one IUS per line); first three inline, See more below when more. */
function TargetIusCell({
  lines,
  iusLabelByGid,
  t,
}: {
  lines: string[];
  iusLabelByGid: ReadonlyMap<string, string>;
  t: (code: string, fallback?: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const labels = lines.map((gid) => targetIusDisplayLabel(gid, iusLabelByGid));
  const full = labels.join("\n");
  const showSeeMore = lines.length > TARGET_IUS_INLINE_MAX;
  const inlineLabels = showSeeMore
    ? labels.slice(0, TARGET_IUS_INLINE_MAX)
    : labels;
  const inlineLines = showSeeMore
    ? lines.slice(0, TARGET_IUS_INLINE_MAX)
    : lines;

  return (
    <>
      <div className="flex min-w-0 max-w-full flex-col items-stretch gap-0.5 py-0">
        <div className="min-w-0" title={full}>
          <ul className="m-0 list-none p-0">
            {inlineLabels.map((label, idx) => (
              <li
                key={`${inlineLines[idx]}:${idx}`}
                className="flex min-w-0 items-center gap-1.5"
              >
                <span
                  className="h-1 w-1 shrink-0 rounded-full bg-text-muted"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-xs leading-tight text-text">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {showSeeMore ? (
          <button
            type="button"
            className="self-start text-xs font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline"
            aria-label={t(
              "COMPUTE_PROCESS_TARGET_IUS_SEE_MORE_ARIA",
              "View full list of target indicator unit subgroups"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            {t("SEE_MORE")}
          </button>
        ) : null}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t(
          "COMPUTE_PROCESS_TARGET_IUS_MODAL_TITLE",
          "Indicator unit subgroup"
        )}
        titleId="dm-compute-target-ius-list-title"
        dismissDisabled={false}
        closeAriaLabel={t("CLOSE")}
        className="max-w-lg"
        bodyClassName="flex min-h-0 flex-col gap-2"
        footer={
          <SecondaryButton type="button" variant="modal" onClick={() => setOpen(false)}>
            {t("CLOSE")}
          </SecondaryButton>
        }
      >
        <p className="text-xs text-text-muted">
          {t(
            "COMPUTE_PROCESS_TARGET_IUS_MODAL_COUNT",
            "{count} selection(s)"
          ).replace("{count}", String(lines.length))}
        </p>
        <div className="min-h-0 max-h-[min(55vh,420px)] overflow-y-auto rounded border border-border bg-surface-muted/60">
          <ul className="divide-y divide-border px-0 py-0 text-xs">
            {lines.map((gid, idx) => {
              const label = targetIusDisplayLabel(gid, iusLabelByGid);
              const showGid = label !== gid;
              return (
                <li
                  key={`${gid}:${idx}`}
                  className="flex min-w-0 flex-col gap-0.5 px-3 py-2"
                >
                  <span className="min-w-0 whitespace-normal break-words font-medium text-text">
                    {label}
                  </span>
                  {showGid ? (
                    <span className="min-w-0 break-all text-xs text-text-muted">
                      {gid}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </>
  );
}

export type UseComputeProcessGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  locale: string;
  rowsLength: number;
  allVisibleSelected: boolean;
  selectedRowIds: ReadonlySet<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  areaLevels: AreaLevelCatalogRow[];
  areasCatalog: ReadonlyArray<{
    ar_id: string;
    ar_gid: string;
    ar_level: number;
  }>;
  areaKeyToLevel: Map<string, number>;
  areaLevelFilterKey: string;
  setAreaLevelFilterKey: (v: string) => void;
  areaLevelPickOptions: SearchableListComboboxOption[];
  areasUnderFilterKey: string;
  setAreasUnderFilterKey: (v: string) => void;
  targetIusFilterKey: string;
  setTargetIusFilterKey: (v: string) => void;
  onExecute: (row: ComputeProcessListItem) => void;
  canDelete: boolean;
  onDelete: (row: ComputeProcessListItem) => void;
  expandedExecutionRowIds: ReadonlySet<string>;
  onToggleExecutionExpand: (row: ComputeProcessListItem) => void;
  /** Open read-only list of areas for this row ("all" or explicit area ids). */
  onOpenAreasUnderDetail: (
    detail: { kind: "all" } | { kind: "list"; areaIds: string[] }
  ) => void;
  /** Resolved labels for IUS GIDs (from filter catalog). */
  iusLabelByGid: ReadonlyMap<string, string>;
};

export function useComputeProcessGridColumns({
  t,
  locale,
  rowsLength,
  allVisibleSelected,
  selectedRowIds,
  selectAll,
  toggleSelect,
  areaLevels,
  areasCatalog,
  areaKeyToLevel,
  areaLevelFilterKey,
  setAreaLevelFilterKey,
  areaLevelPickOptions,
  areasUnderFilterKey,
  setAreasUnderFilterKey,
  targetIusFilterKey,
  setTargetIusFilterKey,
  onExecute,
  canDelete,
  onDelete,
  expandedExecutionRowIds,
  onToggleExecutionExpand,
  onOpenAreasUnderDetail,
  iusLabelByGid,
}: UseComputeProcessGridColumnsParams): EditableGridColumnDef<ComputeProcessListItem>[] {
  return useMemo(
    (): EditableGridColumnDef<ComputeProcessListItem>[] => [
      {
        id: "select_expand",
        layout: { width: 52, maxWidth: 52, sticky: "left" },
        header: {
          kind: "selectAll",
          checked: rowsLength > 0 && allVisibleSelected,
          onChange: selectAll,
          ariaLabel: t("SELECT_ALL_VISIBLE_ROWS", "Select all"),
        },
        headerAfter: (
          <span className="sr-only">
            {t("COMPUTE_EXEC_EXPAND_LOGS", "Show execution logs")}
          </span>
        ),
        filter: null,
        cell: ({ row }) => {
          const rid = computeProcessRowId(row);
          const open = expandedExecutionRowIds.has(rid);
          return (
            <div className="tv-cp-select-expand-cell">
              <input
                type="checkbox"
                className="checkbox-comp"
                checked={selectedRowIds.has(rid)}
                onChange={() => toggleSelect(rid)}
                aria-label={t(
                  "COMPUTE_SELECT_PROCESS_ROW",
                  "Select compute process {id}"
                ).replace("{id}", String(row.id))}
              />
              <ExpandChevronButton
                expanded={open}
                className="!pl-[10px]"
                title={t("COMPUTE_EXEC_EXPAND_LOGS", "Show execution logs")}
                expandAriaLabel={t(
                  "COMPUTE_EXEC_EXPAND_LOGS",
                  "Show execution logs"
                )}
                collapseAriaLabel={t("COLLAPSE", "Collapse")}
                iconClassName="text-text-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExecutionExpand(row);
                }}
              />
            </div>
          );
        },
      },
      {
        id: "area_level",
        layout: { width: 10, unit: "%" },
        header: t("AREA_LEVEL"),
        filter: {
          kind: "select",
          menuPortal: true,
          value: areaLevelFilterKey,
          onChange: setAreaLevelFilterKey,
          ariaLabel: t("AREA_LEVEL"),
          options: areaLevelPickOptions.map((o) => ({
            value: o.id,
            label: o.label,
          })),
        },
        cell: ({ row }) => {
          if (row.process_type === "AREA") {
            return (
              <span className="text-xs">
                {t(
                  "COMPUTE_PROCESS_AREA_FILTER_IGNORED_SHORT",
                  "From formula"
                )}
              </span>
            );
          }
          const areas = getAreasFromFilter(row.filter_object);
          const storedLevelNid = row.filter_object.area_level_nid;
          const areaLevelNid =
            typeof storedLevelNid === "number"
              ? storedLevelNid
              : typeof storedLevelNid === "string"
                ? Number(storedLevelNid)
                : null;
          const text = formatAreaLevelCellDisplay(
            areas,
            areaLevels,
            areaKeyToLevel,
            areasCatalog,
            t,
            areaLevelNid
          );
          return <span className="text-text">{text}</span>;
        },
      },
      {
        id: "areas_under",
        layout: { width: 15, unit: "%" },
        header: t("AREAS_UNDER"),
        filter: {
          kind: "search",
          value: areasUnderFilterKey,
          onChange: setAreasUnderFilterKey,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t(
            "COMPUTE_FILTER_AREAS_UNDER",
            "Filter by area id or name"
          ),
        },
        cell: ({ row }) => {
          if (row.process_type === "AREA") {
            return (
              <span className="text-xs">
                {t(
                  "COMPUTE_PROCESS_AREA_FILTER_IGNORED_SHORT",
                  "From formula"
                )}
              </span>
            );
          }
          const areas = getAreasFromFilter(row.filter_object);
          const isAll = areas.length === 1 && areas[0] === "all";
          if (areas.length === 0) {
            return <span className="text-text">—</span>;
          }
          const text = isAll
            ? t("ALL", "All")
            : t("N_AREAS").replace(
                "{count}",
                String(areas.length)
              );
          if (isAll) {
            return (
              <span className="max-w-full truncate text-left text-xs text-text">
                {text}
              </span>
            );
          }
          const detail = {
            kind: "list" as const,
            areaIds: areas.filter((a) => a !== "all"),
          };
          const ariaLabel = t(
            "COMPUTE_PROCESS_AREAS_DETAIL_ARIA_LIST",
            "View list of {count} selected areas"
          ).replace("{count}", String(areas.length));
          return (
            <button
              type="button"
              className="max-w-full cursor-pointer truncate text-left text-xs text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              aria-label={ariaLabel}
              title={ariaLabel}
              onClick={(e) => {
                e.stopPropagation();
                onOpenAreasUnderDetail(detail);
              }}
            >
              {text}
            </button>
          );
        },
      },
      {
        id: "target_ius",
        layout: { width: 30, unit: "%", main: true },
        header: t("TARGET_IUS"),
        filter: {
          kind: "search",
          value: targetIusFilterKey,
          onChange: setTargetIusFilterKey,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t(
            "COMPUTE_FILTER_TARGET_IUS",
            "Filter by target IUS id or label"
          ),
        },
        cell: ({ row }) => {
          const gids = getTargetIusFromFilter(row.filter_object);
          if (gids.length === 0) {
            return <span className="text-text-muted">—</span>;
          }
          return (
            <TargetIusCell
              lines={gids}
              iusLabelByGid={iusLabelByGid}
              t={t}
            />
          );
        },
      },
      {
        id: "created_at",
        layout: { width: 12, unit: "%" },
        header: t("CREATED_AT"),
        filter: null,
        cell: ({ row }) => (
          <span>{formatCreatedAt(row.created_at, locale)}</span>
        ),
      },
      {
        id: "actions",
        layout: DUAL_ACTION_COLUMN_LAYOUT,
        header: dualActionColumnHeader(t("ACTION", "Action")),
        ...dualActionColumnThExtras(),
        filter: null,
        cell: ({ row }) => (
          <div className="add-row-action-btns">
            <button
              type="button"
              className={TV_GRID_CONFIGURE_LABELED_BTN}
              aria-label={t("EXECUTE_COMPUTE")}
              title={t("EXECUTE_COMPUTE")}
              onClick={(e) => {
                e.stopPropagation();
                onExecute(row);
              }}
            >
              <span className="material-icons !text-sm" aria-hidden="true">
                play_arrow
              </span>
              {t("RUN", "Run")}
            </button>
            {canDelete ? (
              <button
                type="button"
                className={TV_GRID_CONFIGURE_BTN}
                aria-label={t("DELETE_PROCESS_TITLE", "Delete process definition")}
                title={t("DELETE_PROCESS_TITLE", "Delete process definition")}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(row);
                }}
              >
                <span className="material-icons !text-sm" aria-hidden="true">
                  delete
                </span>
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [
      t,
      locale,
      rowsLength,
      allVisibleSelected,
      selectedRowIds,
      selectAll,
      toggleSelect,
      areaLevels,
      areasCatalog,
      areaKeyToLevel,
      areaLevelFilterKey,
      setAreaLevelFilterKey,
      areaLevelPickOptions,
      areasUnderFilterKey,
      setAreasUnderFilterKey,
      targetIusFilterKey,
      setTargetIusFilterKey,
      onExecute,
      canDelete,
      onDelete,
      expandedExecutionRowIds,
      onToggleExecutionExpand,
      onOpenAreasUnderDetail,
      iusLabelByGid,
    ]
  );
}

/** Same order as the indicator Compute sub-tabs (Total, Minus, Percentage, Time Period, Area). */
export const COMPUTE_PROCESS_TYPE_ORDER = [
  "TOTAL",
  "MINUS",
  "PERCENT",
  "TIME",
  "AREA",
] as const;

export function processTypeGroupIcon(processType: string): string {
  switch (processType) {
    case "TOTAL":
      return "functions";
    case "MINUS":
      return "remove";
    case "PERCENT":
      return "percent";
    case "TIME":
      return "schedule";
    case "AREA":
      return "map";
    default:
      return "calculate";
  }
}

export function processTypeGroupLabel(
  processType: string,
  t: (code: string, fallback?: string) => string
): string {
  switch (processType) {
    case "TOTAL":
      return t("TOTAL");
    case "MINUS":
      return t("MINUS");
    case "PERCENT":
      return t("PERCENTAGE");
    case "TIME":
      return t("TIME_PERIOD", "Time Period");
    case "AREA":
      return t("AREA", "Area");
    default:
      return processType;
  }
}

"use client";

import { useCallback, useMemo, useRef } from "react";
import { useCore } from "@/contexts/CoreContext";
import { SelectionModal } from "./SelectionModal";
import {
  AreaSelect,
  type AreaItem,
  type AreaSelectApi,
  type PreloadedAreaItem,
} from "dfa-v6-comp-area";
import "dfa-v6-comp-area/styles.css";
import { Loader } from "@/components/Loader";
import { apiFetch, buildApiHeaders } from "@/lib/api/client";
import type { TreeNode } from "dfa-v6-comp-treeview";

type AreaSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: AreaItem[]) => void;
  baseUrl: string;
  locale?: string;
  initialSelectedItems?: AreaItem[];
  selectionMode?: "SINGLE" | "MULTIPLE";
  allowedAreaNids?: number[];
  preloadedData?: PreloadedAreaItem[] | null;
  /** When > 0, only areas at this `ar_level` can be selected; others are disabled. */
  allowSelectionAtLevel?: number;
};

type NormalizedArea = {
  nid: number;
  parentNid: number | null;
  id: string;
  name: string;
  levelName: string;
};

type RestrictedAreaTree = {
  roots: TreeNode[];
  getChildren: (parentId: string) => TreeNode[];
  getFlat: (params: { level?: string; search?: string }) => TreeNode[];
  levelOptions: { value: string; label: string }[];
  selectableIds: Set<string>;
};

const REFERENCE_PATH_AREAS = "/areas";
const REFERENCE_PATH_AREA_LEVELS = "/area-levels";
const FALLBACK_LEVEL_OPTION = [{ value: "", label: "All Levels (Tree View)" }];

export function AreaSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  locale,
  initialSelectedItems = [],
  selectionMode,
  allowedAreaNids,
  preloadedData,
  allowSelectionAtLevel,
}: AreaSelectionModalProps) {
  const apiRef = useRef<AreaSelectApi | null>(null);
  const restrictedTreeRef = useRef<RestrictedAreaTree | null>(null);
  const { t } = useCore();
  const isSingle = selectionMode === "SINGLE";
  const allowedNidsSet = useMemo(() => {
    const out = new Set<number>();
    for (const value of allowedAreaNids ?? []) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) continue;
      out.add(parsed);
    }
    return out;
  }, [allowedAreaNids]);
  const hasRestrictedAreas = allowedNidsSet.size > 0;

  const baseUrlNorm = useMemo(
    () => baseUrl.replace(/\/$/, ""),
    [baseUrl]
  );

  const handleReady = useCallback((api: AreaSelectApi) => {
    apiRef.current = api;
  }, []);

  const handleChange = useCallback(
    (items: AreaItem[]) => {
      if (hasRestrictedAreas) {
        const selectableIds = restrictedTreeRef.current?.selectableIds ?? new Set<string>();
        const nextItems = items.filter((item) => {
          const parsedNid = Number(item.nid);
          if (Number.isInteger(parsedNid) && parsedNid > 0) {
            return allowedNidsSet.has(parsedNid);
          }
          return selectableIds.has(String(item.id));
        });
        if (nextItems.length !== items.length) {
          apiRef.current?.setSelectedIds(nextItems.map((item) => item.id));
        }
      }
    },
    [allowedNidsSet, hasRestrictedAreas]
  );

  const areaStrings = useMemo(
    () => ({
      filterByLevel: t("AREA_FILTER_BY_LEVEL", "Filter by Level"),
      searchPlaceholder: t("AREA_SEARCH_PLACEHOLDER", "Search areas..."),
      expandAll: t("AREA_EXPAND_ALL", "Expand All"),
      collapseAll: t("AREA_COLLAPSE_ALL", "Collapse All"),
      selectAll: t("COMMON_SELECT_ALL", "Select All"),
      deselectAll: t("COMMON_DESELECT_ALL", "Deselect All"),
      loadingLabel: t("COMMON_LOADING", "Loading..."),
      emptyLabel: t("AREA_EMPTY_LABEL", "No areas to display."),
      summaryNone: t("AREA_SUMMARY_NONE", "No areas selected"),
      summaryOne: t("AREA_SUMMARY_ONE", "1 area selected"),
      summaryMany: t("AREA_SUMMARY_MANY", "{n} areas selected"),
      summarySelectedPanelTitle: t("AREA_SELECTED_PANEL_TITLE", "Selected areas"),
      close: t("COMMON_CLOSE", "Close"),
    }),
    [t]
  );

  const toNode = useCallback(
    (
      area: NormalizedArea,
      childrenByParentNid: Map<number, NormalizedArea[]>
    ): TreeNode =>
      ({
        id: area.id,
        label: area.name,
        type: area.levelName,
        hasChildren: (childrenByParentNid.get(area.nid)?.length ?? 0) > 0,
        nid: area.nid,
      }) as TreeNode,
    []
  );

  const ensureRestrictedTree = useCallback(async (): Promise<RestrictedAreaTree> => {
    if (restrictedTreeRef.current) return restrictedTreeRef.current;
    const headers = buildApiHeaders({ acceptLanguage: locale });
    const base = baseUrlNorm;
    const [areasRes, levelsRes] = await Promise.all([
      apiFetch(`${base}${REFERENCE_PATH_AREAS}`, { headers }),
      apiFetch(`${base}${REFERENCE_PATH_AREA_LEVELS}`, { headers }),
    ]);
    const areasJson = (await areasRes.json()) as
      | { success?: boolean; data?: Record<string, unknown>[] }
      | Record<string, unknown>[];
    const levelsJson = (await levelsRes.json()) as
      | { success?: boolean; data?: Record<string, unknown>[] }
      | Record<string, unknown>[];

    const rawAreas = Array.isArray(areasJson)
      ? areasJson
      : areasJson.success && Array.isArray(areasJson.data)
        ? areasJson.data
        : [];
    const rawLevels = Array.isArray(levelsJson)
      ? levelsJson
      : levelsJson.success && Array.isArray(levelsJson.data)
        ? levelsJson.data
        : [];

    const levelNameByLevel = new Map<number, string>();
    for (const level of rawLevels) {
      const levelNo = Number(level.al_level ?? level.level ?? 0);
      const levelName = String(level.al_name ?? level.name ?? "").trim();
      if (!Number.isInteger(levelNo) || levelNo <= 0 || !levelName) continue;
      levelNameByLevel.set(levelNo, levelName);
    }

    const normalizedAreas: NormalizedArea[] = rawAreas
      .map((area) => {
        const nid = Number(area.ar_nid ?? area.a_nid ?? 0);
        if (!Number.isInteger(nid) || nid <= 0) return null;
        const rawParent = area.ar_parent_nid ?? area.a_parent_nid;
        const parentNum = Number(rawParent);
        const parentNid =
          rawParent == null || !Number.isInteger(parentNum) || parentNum <= 0 || parentNum === nid
            ? null
            : parentNum;
        const id = String(area.ar_id ?? area.a_id ?? nid).trim();
        const name = String(area.ar_name ?? area.a_name ?? id).trim() || id;
        const levelNo = Number(area.ar_level ?? area.a_level ?? 0);
        const levelName =
          levelNameByLevel.get(levelNo) ??
          (Number.isInteger(levelNo) && levelNo > 0 ? `Level ${levelNo}` : "Unknown");
        return { nid, parentNid, id, name, levelName };
      })
      .filter((area): area is NormalizedArea => area !== null);

    const byNid = new Map(normalizedAreas.map((area) => [area.nid, area]));
    const visibleNids = new Set<number>();
    for (const nid of allowedNidsSet) {
      const current = byNid.get(nid);
      if (!current) continue;
      visibleNids.add(current.nid);
      let parent = current.parentNid;
      while (parent != null && parent > 0) {
        const parentArea = byNid.get(parent);
        if (!parentArea) break;
        visibleNids.add(parentArea.nid);
        parent = parentArea.parentNid;
      }
    }
    const visibleAreas = normalizedAreas.filter((area) => visibleNids.has(area.nid));
    const byId = new Map(visibleAreas.map((area) => [area.id, area]));
    const childrenByParentNid = new Map<number, NormalizedArea[]>();
    for (const area of visibleAreas) {
      const key = area.parentNid ?? 0;
      const bucket = childrenByParentNid.get(key) ?? [];
      bucket.push(area);
      childrenByParentNid.set(key, bucket);
    }
    const roots = visibleAreas
      .filter((area) => area.parentNid == null || !byNid.has(area.parentNid))
      .map((area) => toNode(area, childrenByParentNid));
    const selectableIds = new Set(
      visibleAreas
        .filter((area) => allowedNidsSet.has(area.nid))
        .map((area) => area.id)
    );

    const tree: RestrictedAreaTree = {
      roots,
      getChildren: (parentId) => {
        const parent = byId.get(parentId);
        if (!parent) return [];
        return (childrenByParentNid.get(parent.nid) ?? []).map((area) =>
          toNode(area, childrenByParentNid)
        );
      },
      getFlat: ({ level, search }) => {
        const levelQuery = String(level ?? "").trim().toLowerCase();
        const searchQuery = String(search ?? "").trim().toLowerCase();
        return visibleAreas
          .filter((area) => {
            if (levelQuery && area.levelName.toLowerCase() !== levelQuery) return false;
            if (!searchQuery) return true;
            return (
              area.name.toLowerCase().includes(searchQuery) ||
              area.id.toLowerCase().includes(searchQuery)
            );
          })
          .map((area) => toNode(area, childrenByParentNid));
      },
      levelOptions: [
        { value: "", label: "All Levels (Tree View)" },
        ...Array.from(new Set(visibleAreas.map((area) => area.levelName))).map((levelName) => ({
          value: levelName,
          label: levelName,
        })),
      ],
      selectableIds,
    };
    restrictedTreeRef.current = tree;
    return tree;
  }, [allowedNidsSet, baseUrlNorm, locale, toNode]);

  const loadRestrictedRoots = useCallback(async () => {
    const tree = await ensureRestrictedTree();
    return tree.roots;
  }, [ensureRestrictedTree]);

  const loadRestrictedChildren = useCallback(
    async (parentId: string) => {
      const tree = await ensureRestrictedTree();
      return tree.getChildren(parentId);
    },
    [ensureRestrictedTree]
  );

  const fetchRestrictedFlat = useCallback(
    async (params: { level?: string; search?: string }) => {
      const tree = await ensureRestrictedTree();
      return tree.getFlat(params);
    },
    [ensureRestrictedTree]
  );

  const hasPreloadedData = Array.isArray(preloadedData) && preloadedData.length > 0;

  /** With preloaded rows, omit levelOptions so AreaSelect loads `/area-levels` and maps real level labels (not "Level N"). */
  const levelOptions = useMemo(() => {
    if (!hasRestrictedAreas) return undefined;
    if (hasPreloadedData) return undefined;
    return restrictedTreeRef.current?.levelOptions ?? FALLBACK_LEVEL_OPTION;
  }, [hasRestrictedAreas, hasPreloadedData]);

  return (
    <SelectionModal<AreaItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("MODAL_SELECT_AREA", "Select Area")}
      onApply={onApply}
      getApi={() => apiRef.current}
    >
      <AreaSelect
        key={`${baseUrlNorm}-${isOpen ? "open" : "closed"}`}
        baseUrl={baseUrlNorm}
        locale={locale}
        headers={buildApiHeaders({ acceptLanguage: locale })}
        multiSelect={!isSingle}
        preloadedData={hasPreloadedData ? preloadedData : undefined}
        fetchRoots={!hasPreloadedData && hasRestrictedAreas ? loadRestrictedRoots : undefined}
        loadChildren={!hasPreloadedData && hasRestrictedAreas ? loadRestrictedChildren : undefined}
        fetchFlat={!hasPreloadedData && hasRestrictedAreas ? fetchRestrictedFlat : undefined}
        levelOptions={levelOptions}
        allowSelectionAtLevel={allowSelectionAtLevel}
        initialSelectedItems={initialSelectedItems}
        onReady={handleReady}
        onChange={!hasPreloadedData && hasRestrictedAreas ? handleChange : undefined}
        loadingComponent={
          <Loader
            loadingLabel={t("COMMON_LOADING", "Loading...")}
            size={40}
            showStatusText={true}
          />
        }
        strings={areaStrings}
      />
    </SelectionModal>
  );
}

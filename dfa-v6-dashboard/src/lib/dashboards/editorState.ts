import type { LayoutItem } from "react-grid-layout";

import type { VisualizationSettings, VisualizationState } from "@/lib/visualizations/types";

import type { DashboardFormValues, FilterItem } from "./types";

// Layout

export type GridLayoutItemData = LayoutItem;

export const CANVAS_DEFAULT_W = 4;
export const CANVAS_DEFAULT_H = 3;
export const FILTER_DEFAULT_W = 3;
export const FILTER_DEFAULT_H = 1;

// Document types

export type GlobalFilterPlacement = {
  placementId: string;
  filterId: string;
};

export type GlobalFilterBarState = {
  placements: GlobalFilterPlacement[];
  layout: GridLayoutItemData[];
};

export type CanvasBlockState = {
  placementId: string;
  sourceType: "visualization" | "select_list_filter";
  entityId: string;
};

export type SectionCanvasState = {
  blocks: CanvasBlockState[];
  layout: GridLayoutItemData[];
};

export type DashboardSection = {
  id: string;
  label: string;
  canvas: SectionCanvasState;
};

export type DashboardEditorState = {
  dashboardId: string;
  config: DashboardFormValues;
  visualizations: VisualizationState[];
  filters: FilterItem[];
  globalFilterBar: GlobalFilterBarState;
  sections: DashboardSection[];
  activeSectionId: string;
};

/** Resolved block for canvas rendering */
export type ResolvedCanvasBlock = {
  placementId: string;
  sourceType: "visualization" | "select_list_filter";
  entityId: string;
  name: string;
  typeId?: string;
  icon?: string;
  settings?: VisualizationSettings;
};

/** Resolved global filter for filter bar rendering */
export type ResolvedGlobalFilter = {
  placementId: string;
  filterId: string;
  name: string;
  icon: string;
};

export type SectionTab = Pick<DashboardSection, "id" | "label">;

// UI state (not serializable)

export type DashboardEditorUIState = {
  configurationOpen: boolean;
  savedConfigOverride: DashboardFormValues | null;
  vizCreateModalOpen: boolean;
  vizDrawerOpen: boolean;
  editingVizId: string | null;
  liveVizPreview: VisualizationState | null;
  filterCreateModalOpen: boolean;
  filterDrawerOpen: boolean;
  editingFilterId: string | null;
};

export const INITIAL_UI_STATE: DashboardEditorUIState = {
  configurationOpen: false,
  savedConfigOverride: null,
  vizCreateModalOpen: false,
  vizDrawerOpen: false,
  editingVizId: null,
  liveVizPreview: null,
  filterCreateModalOpen: false,
  filterDrawerOpen: false,
  editingFilterId: null,
};

// Actions

export type DashboardEditorAction =
  | { type: "HYDRATE"; state: DashboardEditorState }
  | { type: "SET_CONFIG"; config: DashboardFormValues }
  | { type: "ADD_VISUALIZATION"; visualization: VisualizationState }
  | { type: "UPDATE_VISUALIZATION"; visualization: VisualizationState }
  | { type: "DELETE_VISUALIZATION"; vizId: string }
  | { type: "ADD_FILTER"; filter: FilterItem }
  | { type: "UPDATE_FILTER"; filter: FilterItem }
  | { type: "DELETE_FILTER"; filterId: string }
  | {
      type: "PLACE_VISUALIZATION_ON_SECTION";
      sectionId: string;
      block: CanvasBlockState;
      layoutItem: GridLayoutItemData;
    }
  | {
      type: "PLACE_SELECT_LIST_FILTER_ON_SECTION";
      sectionId: string;
      block: CanvasBlockState;
      layoutItem: GridLayoutItemData;
    }
  | {
      type: "PLACE_GLOBAL_FILTER";
      placement: GlobalFilterPlacement;
      layoutItem: GridLayoutItemData;
    }
  | { type: "REMOVE_CANVAS_BLOCK"; sectionId: string; placementId: string }
  | { type: "REMOVE_GLOBAL_FILTER"; placementId: string }
  | {
      type: "UPDATE_SECTION_LAYOUT";
      sectionId: string;
      layout: GridLayoutItemData[];
    }
  | { type: "UPDATE_GLOBAL_FILTER_LAYOUT"; layout: GridLayoutItemData[] }
  | { type: "ADD_SECTION"; section: DashboardSection }
  | { type: "RENAME_SECTION"; sectionId: string; label: string }
  | { type: "REORDER_SECTIONS"; sections: DashboardSection[] }
  | { type: "DELETE_SECTION"; sectionId: string }
  | { type: "SET_ACTIVE_SECTION"; sectionId: string };

// Factories

export function createDefaultSection(label = "Overview"): DashboardSection {
  const id = `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    label,
    canvas: { blocks: [], layout: [] },
  };
}

export function createEmptyDashboardState(
  dashboardId: string,
  config: DashboardFormValues,
): DashboardEditorState {
  const defaultSection = createDefaultSection();
  return {
    dashboardId,
    config,
    visualizations: [],
    filters: [],
    globalFilterBar: { placements: [], layout: [] },
    sections: [defaultSection],
    activeSectionId: defaultSection.id,
  };
}

export function createInitialDashboardState(
  dashboardId: string,
  config: DashboardFormValues,
): DashboardEditorState {
  return createEmptyDashboardState(dashboardId, config);
}

// Selectors

export function getActiveSection(
  state: DashboardEditorState,
): DashboardSection | undefined {
  return state.sections.find((s) => s.id === state.activeSectionId);
}

export function getSectionById(
  state: DashboardEditorState,
  sectionId: string,
): DashboardSection | undefined {
  return state.sections.find((s) => s.id === sectionId);
}

export function getVisualizationById(
  state: DashboardEditorState,
  vizId: string,
): VisualizationState | undefined {
  return state.visualizations.find((v) => v.vizId === vizId);
}

export function getFilterById(
  state: DashboardEditorState,
  filterId: string,
): FilterItem | undefined {
  return state.filters.find((f) => f.id === filterId);
}

function getPlacedFilterIds(state: DashboardEditorState): Set<string> {
  const ids = new Set<string>();
  for (const placement of state.globalFilterBar.placements) {
    ids.add(placement.filterId);
  }
  for (const section of state.sections) {
    for (const block of section.canvas.blocks) {
      if (block.sourceType === "select_list_filter") {
        ids.add(block.entityId);
      }
    }
  }
  return ids;
}

export function getAvailableVisualizations(
  state: DashboardEditorState,
): VisualizationState[] {
  return state.visualizations.filter((v) => !v.inUse);
}

export function getAvailableFilters(state: DashboardEditorState): FilterItem[] {
  const placed = getPlacedFilterIds(state);
  return state.filters.filter((f) => !placed.has(f.id));
}

export function getSectionTabs(state: DashboardEditorState): SectionTab[] {
  return state.sections.map(({ id, label }) => ({ id, label }));
}

export function resolveCanvasBlocks(
  state: DashboardEditorState,
  blocks: CanvasBlockState[],
): ResolvedCanvasBlock[] {
  return blocks.map((block) => {
    if (block.sourceType === "visualization") {
      const viz = getVisualizationById(state, block.entityId);
      return {
        ...block,
        name: viz?.name ?? "Visualization",
        typeId: viz?.typeId,
        settings: viz?.settings,
      };
    }
    const filter = getFilterById(state, block.entityId);
    return {
      ...block,
      name: filter?.name ?? "Filter",
      icon: "filter_list",
    };
  });
}

export function resolveGlobalFilters(
  state: DashboardEditorState,
): ResolvedGlobalFilter[] {
  return state.globalFilterBar.placements.map((placement) => {
    const filter = getFilterById(state, placement.filterId);
    return {
      placementId: placement.placementId,
      filterId: placement.filterId,
      name: filter?.name ?? "Filter",
      icon: filter?.filterType === "global" ? "language" : "filter_list",
    };
  });
}

// Reducer helpers 

function updateSection(
  state: DashboardEditorState,
  sectionId: string,
  updater: (section: DashboardSection) => DashboardSection,
): DashboardEditorState {
  return {
    ...state,
    sections: state.sections.map((s) =>
      s.id === sectionId ? updater(s) : s,
    ),
  };
}

function removeEntityFromAllCanvases(
  state: DashboardEditorState,
  entityId: string,
  sourceType?: CanvasBlockState["sourceType"],
): DashboardEditorState {
  return {
    ...state,
    sections: state.sections.map((section) => {
      const blocksToRemove = section.canvas.blocks.filter(
        (b) =>
          b.entityId === entityId &&
          (sourceType === undefined || b.sourceType === sourceType),
      );
      if (blocksToRemove.length === 0) return section;
      const placementIds = new Set(blocksToRemove.map((b) => b.placementId));
      return {
        ...section,
        canvas: {
          blocks: section.canvas.blocks.filter(
            (b) => !placementIds.has(b.placementId),
          ),
          layout: section.canvas.layout.filter(
            (l) => !placementIds.has(l.i),
          ),
        },
      };
    }),
  };
}

function syncVisualizationInUse(state: DashboardEditorState): VisualizationState[] {
  const inUseIds = new Set<string>();
  for (const section of state.sections) {
    for (const block of section.canvas.blocks) {
      if (block.sourceType === "visualization") {
        inUseIds.add(block.entityId);
      }
    }
  }
  return state.visualizations.map((v) => ({
    ...v,
    inUse: inUseIds.has(v.vizId),
  }));
}

// Reducer

export function dashboardEditorReducer(
  state: DashboardEditorState,
  action: DashboardEditorAction,
): DashboardEditorState {
  console.log(state)
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    case "SET_CONFIG":
      return { ...state, config: action.config };

    case "ADD_VISUALIZATION":
      return {
        ...state,
        visualizations: [...state.visualizations, action.visualization],
      };

    case "UPDATE_VISUALIZATION":
      return {
        ...state,
        visualizations: state.visualizations.map((v) =>
          v.vizId === action.visualization.vizId ? action.visualization : v,
        ),
      };

    case "DELETE_VISUALIZATION": {
      const next = removeEntityFromAllCanvases(
        state,
        action.vizId,
        "visualization",
      );
      return {
        ...next,
        visualizations: next.visualizations.filter(
          (v) => v.vizId !== action.vizId,
        ),
      };
    }

    case "ADD_FILTER":
      return { ...state, filters: [...state.filters, action.filter] };

    case "UPDATE_FILTER":
      return {
        ...state,
        filters: state.filters.map((f) =>
          f.id === action.filter.id ? action.filter : f,
        ),
      };

    case "DELETE_FILTER": {
      const next = removeEntityFromAllCanvases(state, action.filterId);
      const remainingPlacements = next.globalFilterBar.placements.filter(
        (p) => p.filterId !== action.filterId,
      );
      const remainingPlacementIds = new Set(
        remainingPlacements.map((p) => p.placementId),
      );
      return {
        ...next,
        filters: next.filters.filter((f) => f.id !== action.filterId),
        globalFilterBar: {
          placements: remainingPlacements,
          layout: next.globalFilterBar.layout.filter((l) =>
            remainingPlacementIds.has(l.i),
          ),
        },
      };
    }

    case "PLACE_VISUALIZATION_ON_SECTION": {
      const next = updateSection(state, action.sectionId, (section) => ({
        ...section,
        canvas: {
          blocks: [...section.canvas.blocks, action.block],
          layout: [...section.canvas.layout, action.layoutItem],
        },
      }));
      return {
        ...next,
        visualizations: next.visualizations.map((v) =>
          v.vizId === action.block.entityId ? { ...v, inUse: true } : v,
        ),
      };
    }

    case "PLACE_SELECT_LIST_FILTER_ON_SECTION":
      return updateSection(state, action.sectionId, (section) => ({
        ...section,
        canvas: {
          blocks: [...section.canvas.blocks, action.block],
          layout: [...section.canvas.layout, action.layoutItem],
        },
      }));

    case "PLACE_GLOBAL_FILTER":
      return {
        ...state,
        globalFilterBar: {
          placements: [
            ...state.globalFilterBar.placements,
            action.placement,
          ],
          layout: [...state.globalFilterBar.layout, action.layoutItem],
        },
      };

    case "REMOVE_CANVAS_BLOCK": {
      const section = getSectionById(state, action.sectionId);
      if (!section) return state;
      const block = section.canvas.blocks.find(
        (b) => b.placementId === action.placementId,
      );
      if (!block) return state;

      const next = updateSection(state, action.sectionId, (s) => ({
        ...s,
        canvas: {
          blocks: s.canvas.blocks.filter(
            (b) => b.placementId !== action.placementId,
          ),
          layout: s.canvas.layout.filter((l) => l.i !== action.placementId),
        },
      }));

      if (block.sourceType === "visualization") {
        return {
          ...next,
          visualizations: syncVisualizationInUse(next),
        };
      }
      return next;
    }

    case "REMOVE_GLOBAL_FILTER":
      return {
        ...state,
        globalFilterBar: {
          placements: state.globalFilterBar.placements.filter(
            (p) => p.placementId !== action.placementId,
          ),
          layout: state.globalFilterBar.layout.filter(
            (l) => l.i !== action.placementId,
          ),
        },
      };

    case "UPDATE_SECTION_LAYOUT":
      return updateSection(state, action.sectionId, (section) => ({
        ...section,
        canvas: { ...section.canvas, layout: action.layout },
      }));

    case "UPDATE_GLOBAL_FILTER_LAYOUT":
      return {
        ...state,
        globalFilterBar: {
          ...state.globalFilterBar,
          layout: action.layout,
        },
      };

    case "ADD_SECTION":
      return {
        ...state,
        sections: [...state.sections, action.section],
        activeSectionId: action.section.id,
      };

    case "RENAME_SECTION":
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.sectionId ? { ...s, label: action.label } : s,
        ),
      };

    case "REORDER_SECTIONS":
      return { ...state, sections: action.sections };

    case "DELETE_SECTION": {
      if (state.sections.length <= 1) return state;
      const remaining = state.sections.filter(
        (s) => s.id !== action.sectionId,
      );
      const nextActive =
        state.activeSectionId === action.sectionId
          ? (remaining[0]?.id ?? state.activeSectionId)
          : state.activeSectionId;
      const next = {
        ...state,
        sections: remaining,
        activeSectionId: nextActive,
      };
      return {
        ...next,
        visualizations: syncVisualizationInUse(next),
      };
    }

    case "SET_ACTIVE_SECTION":
      return { ...state, activeSectionId: action.sectionId };

    default:
      return state;
  }
}

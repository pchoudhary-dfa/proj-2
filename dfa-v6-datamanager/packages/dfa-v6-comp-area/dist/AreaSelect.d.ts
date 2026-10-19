import { ReactNode } from 'react';
import { TreeNode } from 'dfa-v6-comp-treeview';
export type AreaItem = {
    id: string;
    label: string;
    type?: string;
    nid?: number;
};
export type AreaSelectApi = {
    getSelected(): AreaItem[];
    clear(): void;
    setSelectedIds(ids: (string | number)[]): void;
    expandAll(): void;
    collapseAll(): void;
    selectAll(): void;
    deselectAll(): void;
};
export type AreaSelectFetchFlatParams = {
    level?: string;
    search?: string;
};
export type PreloadedAreaItem = {
    ar_nid: number;
    ar_parent_nid: number | null;
    ar_id: string;
    ar_name: string;
    ar_gid?: string;
    ar_level: number;
    ar_short_name?: string | null;
    ar_block_nids?: string;
    ar_map?: string;
    ar_is_global?: boolean;
    ar_has_data?: boolean;
};
export type AreaSelectProps = {
    baseUrl?: string;
    multiSelect?: boolean;
    /** Locale for `Accept-Language` on reference fetches (applied inside the component). */
    locale?: string;
    /** When proxy disabled: `buildHeaders()` from the app. Do not pass `acceptLanguage` — use `locale`. */
    headers?: Record<string, string>;
    /**
     * When provided and non-empty, these items are used as the area options (flat list with level filter)
     * and no API call is made. When undefined, null, or empty, areas are loaded via fetchRoots/baseUrl as usual.
     */
    preloadedData?: PreloadedAreaItem[] | null;
    /** When provided, used instead of baseUrl for roots (e.g. direct backend call). */
    fetchRoots?: () => Promise<TreeNode[]>;
    /** When provided, used instead of baseUrl for loading children (e.g. direct backend call). */
    loadChildren?: (parentId: string) => Promise<TreeNode[]>;
    /** When provided, used instead of baseUrl for flat list by level/search (e.g. direct backend call). */
    fetchFlat?: (params: AreaSelectFetchFlatParams) => Promise<TreeNode[]>;
    /** Level filter dropdown options (e.g. from area-levels API). First option should be "All Levels (Tree View)" with value "". */
    levelOptions?: {
        value: string;
        label: string;
    }[];
    /**
     * When set to a positive number (> 0), the tree is shown but only areas at this
     * `ar_level` have enabled checkboxes; all other levels are disabled.
     * When 0 or undefined, all areas are selectable (default behaviour).
     * Works in reference mode (baseUrl with no fetch overrides).
     */
    allowSelectionAtLevel?: number;
    initialSelectedIds?: (string | number)[];
    initialSelectedItems?: AreaItem[];
    onReady?: (api: AreaSelectApi) => void;
    onChange?: (items: AreaItem[]) => void;
    /** Optional custom loading UI (e.g. brand loader). When not provided, shows text-only loading state. */
    loadingComponent?: ReactNode;
    strings?: {
        filterByLevel?: string;
        searchPlaceholder?: string;
        expandAll?: string;
        collapseAll?: string;
        selectAll?: string;
        deselectAll?: string;
        emptyLabel?: string;
        loadingLabel?: string;
        summaryNone?: string;
        summaryOne?: string;
        summaryMany?: string;
        summarySelectedPanelTitle?: string;
        close?: string;
    };
};
export declare function AreaSelect({ baseUrl, multiSelect, locale, headers: headersProp, preloadedData, fetchRoots: fetchRootsProp, loadChildren: loadChildrenProp, fetchFlat: fetchFlatProp, levelOptions: levelOptionsProp, allowSelectionAtLevel, initialSelectedIds, initialSelectedItems, onReady, onChange, loadingComponent, strings: stringsProp, }: AreaSelectProps): import("react/jsx-runtime").JSX.Element;

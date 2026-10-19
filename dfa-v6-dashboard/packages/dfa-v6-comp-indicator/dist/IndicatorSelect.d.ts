import { ReactNode } from 'react';
export type IndicatorItem = {
    id: string | number;
    label: string;
    nid?: number;
    unitGid?: string;
    unitName?: string;
    subgroupGid?: string;
    subgroupName?: string;
    iusNid?: number;
};
export type IndicatorSelectApi = {
    getSelected(): IndicatorItem[];
    clear(): void;
    setSelectedIds(ids: (string | number)[]): void;
};
export type IndicatorSelectFetchParams = {
    search?: string;
    /** IC type code (SC, GL, TH, CF, IT, CN). Preferred over legacy sector/goal/theme. */
    icType?: string;
    /** Selected classification identifier (ic_nid or ic_gid). */
    icIdentifier?: string;
    /** @deprecated Prefer icType + icIdentifier */
    sector?: string;
    /** @deprecated Prefer icType + icIdentifier */
    theme?: string;
    /** @deprecated Prefer icType + icIdentifier */
    goal?: string;
};
export type ClassificationOption = {
    id: string | number;
    label: string;
};
export type IndicatorSelectProps = {
    /** When provided without fetchIndicators, options are fetched from baseUrl/indicators (reference mode). */
    baseUrl?: string;
    multiSelect?: boolean;
    /** Locale for `Accept-Language` on reference fetches (applied inside the component). */
    locale?: string;
    /** When proxy disabled: `buildHeaders()` from the app (auth/signing). Do not pass `acceptLanguage` here — use `locale`. */
    headers?: Record<string, string>;
    /** When provided, fetches from this function instead of baseUrl (override / custom backend). */
    fetchIndicators?: (params: IndicatorSelectFetchParams) => Promise<IndicatorItem[]>;
    /**
     * Cache scope for `fetchIndicators` results on the All tab. Required when the override
     * returns dynamic data (e.g. eligible IUS lists); omit for stable lists.
     */
    fetchIndicatorsCacheKey?: string;
    /** When provided, fetches IC dropdown options by type code (SC, GL, TH, …). */
    fetchClassificationOptions?: (icType: string) => Promise<ClassificationOption[]>;
    initialSelectedIds?: (string | number)[];
    initialSelectedItems?: IndicatorItem[];
    onReady?: (api: IndicatorSelectApi) => void;
    onChange?: (selected: IndicatorItem[]) => void;
    /** Optional custom loading UI (e.g. brand loader). When not provided, shows text-only loading state. */
    loadingComponent?: ReactNode;
    /** When true: expand indicators to IU rows (one per unit). Default: true. When false: show unique indicators only (original behavior). When enableSubgroup=true, this is forced to true. */
    enableUnit?: boolean;
    /** When true: fetch with subgroup=true, render IU+Subgroup tree, return IUS GIDs */
    enableSubgroup?: boolean;
    /** When true: fetch with subgroup=true and show a flat IUS list (ListView), not a tree. Mutually exclusive with enableSubgroup. */
    flatIusList?: boolean;
    /** When flatIusList: only include rows for this unit GID. */
    restrictUnitGid?: string;
    /** When flatIusList: exclude these IUS GIDs from the list. */
    excludeIusGids?: string[];
    strings?: {
        searchPlaceholder?: string;
        allTabLabel?: string;
        selectClassification?: string;
        pleaseSelectClassification?: string;
        chooseClassificationOption?: string;
        selectSector?: string;
        selectTheme?: string;
        selectGoal?: string;
        pleaseSelectSector?: string;
        pleaseSelectTheme?: string;
        pleaseSelectGoal?: string;
        loadingLabel?: string;
        emptyLabel?: string;
        summaryNone?: string;
        summaryOne?: string;
        summaryMany?: string;
        summarySelectedPanelTitle?: string;
        close?: string;
        selectAll?: string;
        deselectAll?: string;
    };
};
export declare function IndicatorSelect({ baseUrl, multiSelect, locale, headers: headersProp, fetchIndicators, fetchIndicatorsCacheKey, fetchClassificationOptions, initialSelectedIds, initialSelectedItems, onReady, onChange, loadingComponent, enableUnit, enableSubgroup, flatIusList, restrictUnitGid, excludeIusGids, strings: stringsProp, }: IndicatorSelectProps): import("react/jsx-runtime").JSX.Element;

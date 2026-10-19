import { ReactNode } from 'react';
export type SubgroupItem = {
    id: string | number;
    label: string;
    nid?: number;
};
export type SubgroupSelectApi = {
    getSelected(): SubgroupItem[];
    clear(): void;
    setSelectedIds(ids: (string | number)[]): void;
};
export type SubgroupSelectProps = {
    /** When provided without fetchOptions, options are fetched from baseUrl/subgroups and cached (reference mode). */
    baseUrl?: string;
    multiSelect?: boolean;
    /** Locale for `Accept-Language` on reference fetches (applied inside the component). */
    locale?: string;
    /** When proxy disabled: `buildHeaders()` from the app. Do not pass `acceptLanguage` — use `locale`. */
    headers?: Record<string, string>;
    /** When provided (array), these options are used and no API is called. When undefined, options are fetched from baseUrl/subgroups (or fetchOptions) as usual. Pass [] to show no options without calling the API. */
    preloadedSubgroupOptions?: SubgroupItem[];
    options?: SubgroupItem[];
    fetchOptions?: () => Promise<SubgroupItem[]>;
    initialSelectedIds?: (string | number)[];
    initialSelectedItems?: SubgroupItem[];
    onReady?: (api: SubgroupSelectApi) => void;
    onChange?: (selected: SubgroupItem[]) => void;
    /** Optional custom loading UI (e.g. brand loader). When not provided, shows text-only loading state. */
    loadingComponent?: ReactNode;
    strings?: {
        searchPlaceholder?: string;
        selectAll?: string;
        deselectAll?: string;
        loadingLabel?: string;
        emptyLabel?: string;
        summaryNone?: string;
        summaryOne?: string;
        summaryMany?: string;
        summarySelectedPanelTitle?: string;
        close?: string;
    };
};
export declare function SubgroupSelect({ baseUrl, multiSelect, locale, headers: headersProp, preloadedSubgroupOptions, options: optionsProp, fetchOptions, initialSelectedIds, initialSelectedItems, onReady, onChange, loadingComponent, strings: stringsProp, }: SubgroupSelectProps): import("react/jsx-runtime").JSX.Element;

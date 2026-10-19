import { ReactNode } from 'react';
export type TimePeriodItem = {
    id: string | number;
    label: string;
    nid?: number;
};
export type TimePeriodSelectApi = {
    getSelected(): TimePeriodItem[];
    clear(): void;
    setSelectedIds(ids: (string | number)[]): void;
};
export type TimePeriodSelectProps = {
    /** When provided without fetchOptions, options are fetched from baseUrl/time-periods and cached (reference mode). */
    baseUrl?: string;
    multiSelect?: boolean;
    /** Locale for `Accept-Language` on reference fetches (applied inside the component). */
    locale?: string;
    /**
     * When calling the API directly (proxy disabled), pass `buildHeaders()` from the app. Do not pass `acceptLanguage` — use `locale`.
     * When the proxy is enabled, omit — only Accept-Language is sent.
     */
    headers?: Record<string, string>;
    /**
     * When provided and non-empty, these items are used as the time period options and no API call is made
     * (e.g. time periods already present in chart/visualization data). When undefined, null, or empty,
     * options are loaded via options, fetchOptions, or baseUrl/time-periods as usual.
     */
    preloadedData?: TimePeriodItem[] | null;
    options?: TimePeriodItem[];
    fetchOptions?: () => Promise<TimePeriodItem[]>;
    initialSelectedIds?: (string | number)[];
    initialSelectedItems?: TimePeriodItem[];
    onReady?: (api: TimePeriodSelectApi) => void;
    onChange?: (selected: TimePeriodItem[]) => void;
    quickSelectCounts?: number[];
    /** Optional custom loading UI (e.g. brand loader). When not provided, shows text-only loading state. */
    loadingComponent?: ReactNode;
    strings?: {
        quickSelectLabel?: string;
        recent5?: string;
        recent10?: string;
        recent20?: string;
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
export declare function TimePeriodSelect({ baseUrl, multiSelect, locale, headers: headersProp, preloadedData, options: optionsProp, fetchOptions, initialSelectedIds, initialSelectedItems, onReady, onChange, quickSelectCounts, loadingComponent, strings: stringsProp, }: TimePeriodSelectProps): import("react/jsx-runtime").JSX.Element;

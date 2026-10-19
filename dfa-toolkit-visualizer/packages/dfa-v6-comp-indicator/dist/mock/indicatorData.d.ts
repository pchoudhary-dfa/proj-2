/** Mock indicator options and category mappings. Replace with real API when backend is ready. */
export declare const MOCK_INDICATORS: Record<string, unknown>[];
export declare const MOCK_UNIT_META: {
    USD: {
        unit_gid: string;
        unit_name: string;
        unit_nid: number;
    };
    PPP: {
        unit_gid: string;
        unit_name: string;
        unit_nid: number;
    };
    PERCENT: {
        unit_gid: string;
        unit_name: string;
        unit_nid: number;
    };
    INDEX: {
        unit_gid: string;
        unit_name: string;
        unit_nid: number;
    };
    INR: {
        unit_gid: string;
        unit_name: string;
        unit_nid: number;
    };
};
export declare const MOCK_BY_SECTOR: Record<string, string[]>;
export declare const MOCK_BY_THEME: Record<string, string[]>;
export declare const MOCK_BY_GOAL: Record<string, string[]>;
export declare const SECTOR_OPTIONS: {
    id: string;
    label: string;
}[];
export declare const THEME_OPTIONS: {
    id: string;
    label: string;
}[];
export declare const GOAL_OPTIONS: {
    id: string;
    label: string;
}[];
export type FetchParams = {
    search?: string;
    sector?: string;
    theme?: string;
    goal?: string;
};
/** Simulate async fetch; returns envelope matching real API with meta.unit. */
export declare function fetchMockIndicators(params: FetchParams): Promise<Record<string, unknown>[]>;

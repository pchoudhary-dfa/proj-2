/**
 * Internal utilities for the chip search component.
 */
export declare function toEl(mountEl: HTMLElement | string): HTMLElement;
export declare function debounce<A extends unknown[], R>(fn: (...args: A) => R, ms: number): (...args: A) => void;
export declare function uniqByKey<T>(items: T[], keyFn: (it: T) => string): T[];
export declare function safeTypeLabel(type: string, formatKeywordType?: (type: string) => string): string;
export declare function emit(el: HTMLElement, name: string, detail: unknown): void;
export declare function escapeHtml(str: string): string;
/** Truncate string with "..." in the middle; e.g. "Very Long Label" -> "Very Lo...bel". When maxLen is very small, returns start... only. */
export declare function truncateMiddle(str: string, maxLen: number): string;
export declare function svgSearchIcon(): string;
export declare function svgChipIcon(): string;
export declare function svgBadgeIcon(): string;
//# sourceMappingURL=utils.d.ts.map
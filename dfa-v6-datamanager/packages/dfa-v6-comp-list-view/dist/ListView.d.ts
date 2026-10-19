import { default as React } from 'react';
/**
 * List view (scrollable list with checkboxes). Styling is token-driven via styles.css;
 * uses design tokens from packages/design-tokens/tokens.css when loaded by the app.
 */
export type ListViewItem = {
    id: string | number;
    label: string;
};
export type ListViewApi = {
    getData(): ListViewItem[];
    clearData(): void;
};
export type ListViewProps = {
    items: ListViewItem[];
    multiSelect?: boolean;
    selectedIds?: (string | number)[];
    onSelectionChange?: (selected: ListViewItem[]) => void;
    onReady?: (api: ListViewApi) => void;
};
export declare const ListView: React.ForwardRefExoticComponent<ListViewProps & React.RefAttributes<ListViewApi>>;

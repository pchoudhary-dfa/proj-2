import { default as React } from 'react';
/**
 * Tree view UI (expandable rows, checkboxes, labels).
 * Styling is token-driven via styles.css; uses design tokens from
 * packages/design-tokens/tokens.css when loaded by the app.
 */
export type TreeNode = {
    id: string;
    label: string;
    type?: string;
    hasChildren?: boolean;
    path?: string;
    /** Count shown as a badge on the right when `enableCount` is true on the TreeView. */
    count?: number;
};
export type TreeViewApi = {
    getData(): TreeNode[];
    clearData(): void;
    expandAll(): void;
    collapseAll(): void;
    selectAll(): void;
    deselectAll(): void;
    /** Select all direct children of `parentId` (cached children only; no-op if not loaded). */
    selectChildrenOf(parentId: string): void;
    /** Deselect all direct children of `parentId` (cached children only; no-op if not loaded). */
    deselectChildrenOf(parentId: string): void;
};
export type TreeViewProps = {
    roots: TreeNode[];
    loadChildren?: (parentId: string) => Promise<TreeNode[]>;
    multiSelect?: boolean;
    selectedIds?: (string | number)[];
    /** IDs of nodes whose checkbox/radio should be rendered disabled (visible but not selectable). */
    disabledIds?: (string | number)[];
    onSelectionChange?: (selected: TreeNode[]) => void;
    onReady?: (api: TreeViewApi) => void;
    flatItems?: TreeNode[];
    /** Labels for per-parent "Select All" / "Deselect All" under expanded nodes (tree mode only). Defaults to "Select All" / "Deselect All". */
    childActionLabels?: {
        selectAll: string;
        deselectAll: string;
    };
    /** When true, render `id` (e.g. area `ar_id`) in muted text before the primary `label` (name). */
    showIdAfterLabel?: boolean;
    /** When true, render `node.count` as a badge on the right side of each row. */
    enableCount?: boolean;
    /** When true, hides the checkbox/radio input. Selected rows are highlighted instead. */
    disableCheckbox?: boolean;
    /** Icon rendered before the label of every row. Applied uniformly to all nodes at all levels. */
    icon?: React.ReactNode;
};
export declare const TreeView: React.ForwardRefExoticComponent<TreeViewProps & React.RefAttributes<TreeViewApi>>;

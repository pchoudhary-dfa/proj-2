/** Internal type for IU row data when enableSubgroup=true */
export type IuRowData = {
    iuKey: string;
    indicatorGid: string;
    indicatorName: string;
    unitGid: string;
    unitName: string;
    nid?: number;
    subgroups: {
        sgGid: string;
        sgName: string;
        isDefault: boolean;
        iusNid?: number;
    }[];
};
export type IuTreeViewProps = {
    iuRows: IuRowData[];
    selectedGids: Set<string>;
    expandedIus: Set<string>;
    onToggleExpand: (iuKey: string) => void;
    onIuCheck: (row: IuRowData, checked: boolean) => void;
    onSubgroupCheck: (iusGid: string, checked: boolean) => void;
};
export declare function IuTreeView({ iuRows, selectedGids, expandedIus, onToggleExpand, onIuCheck, onSubgroupCheck, }: IuTreeViewProps): import("react/jsx-runtime").JSX.Element;

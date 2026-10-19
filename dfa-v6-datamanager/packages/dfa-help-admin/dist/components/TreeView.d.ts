import React from 'react';
import { KeyNode } from '../types';
interface TreeViewProps {
    nodes: KeyNode[];
    onNodeSelect: (node: KeyNode) => void;
    onNodeDelete: (nodeId: number) => void;
    onNodeCreate: (adaptationId: number, parentId: number, title: string) => void;
    selectedNode?: KeyNode;
    adaptationId?: number;
}
export declare const TreeView: React.FC<TreeViewProps>;
export {};

import React from 'react';
import { KeyNode, UpdatePayload } from '../types';
interface FormProps {
    selectedNode: KeyNode | null;
    selectedAdaptation: string;
    adaptationCode: string;
    allNodes: KeyNode[];
    onSave: (payload: UpdatePayload) => Promise<void>;
    onTitleChange?: (nodeId: number, newTitle: string) => void;
}
export declare const Form: React.FC<FormProps>;
export {};

"use client";

import React, { useCallback } from "react";

/** Internal type for IU row data when enableSubgroup=true */
export type IuRowData = {
  iuKey: string;           // indicatorGid_unitGid (used as expand key)
  indicatorGid: string;
  indicatorName: string;
  unitGid: string;
  unitName: string;
  nid?: number;
  subgroups: { sgGid: string; sgName: string; isDefault: boolean; iusNid?: number }[];
};

export type IuTreeViewProps = {
  iuRows: IuRowData[];
  selectedGids: Set<string>;       // set of IUS GIDs (all selections are at subgroup level)
  expandedIus: Set<string>;        // set of iuKey strings
  onToggleExpand: (iuKey: string) => void;
  onIuCheck: (row: IuRowData, checked: boolean) => void;
  onSubgroupCheck: (iusGid: string, checked: boolean) => void;
};

/** Helper to get selection state for an IU row: { allSelected, someSelected, isIndeterminate } */
function getIuSelectionState(row: IuRowData, selectedGids: Set<string>) {
  if (row.subgroups.length === 0) {
    return { allSelected: false, someSelected: false, isIndeterminate: false };
  }
  let selectedCount = 0;
  for (const sg of row.subgroups) {
    const iusGid = `${row.indicatorGid}|${row.unitGid}|${sg.sgGid}`;
    if (selectedGids.has(iusGid)) {
      selectedCount++;
    }
  }
  const allSelected = selectedCount === row.subgroups.length;
  const someSelected = selectedCount > 0;
  const isIndeterminate = someSelected && !allSelected;
  return { allSelected, someSelected, isIndeterminate };
}

/** Component for IU checkbox - no indeterminate state, only checked when all subgroups selected */
function IuCheckbox({
  checked,
  onClick,
  ariaLabel,
}: {
  checked: boolean;
  onClick: (e: React.MouseEvent) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      className="dtk-iu-checkbox"
      checked={checked}
      onChange={() => {}}
      onClick={onClick}
      aria-label={ariaLabel}
    />
  );
}

export function IuTreeView({
  iuRows,
  selectedGids,
  expandedIus,
  onToggleExpand,
  onIuCheck,
  onSubgroupCheck,
}: IuTreeViewProps) {
  const handleIuCheckboxClick = useCallback((e: React.MouseEvent, row: IuRowData) => {
    e.stopPropagation();
    const { allSelected } = getIuSelectionState(row, selectedGids);
    // If all selected, uncheck (pass false); otherwise check (pass true to select all)
    onIuCheck(row, !allSelected);
  }, [selectedGids, onIuCheck]);

  const handleSubgroupCheckboxClick = useCallback((e: React.MouseEvent, iusGid: string) => {
    e.stopPropagation();
    onSubgroupCheck(iusGid, !selectedGids.has(iusGid));
  }, [selectedGids, onSubgroupCheck]);

  return (
    <div className="dtk-iu-tree-root">
      <div className="dtk-iu-tree-list">
        {iuRows.map((row) => {
          const isExpanded = expandedIus.has(row.iuKey);
          const { allSelected, someSelected } = getIuSelectionState(row, selectedGids);
          const iuLabel = `${row.indicatorName}, ${row.unitName}`;

          return (
            <div key={row.iuKey} className="dtk-iu-tree-item">
              <div className={`dtk-iu-row ${someSelected ? "dtk-iu-row-has-selection" : ""}`}>
                <button
                  type="button"
                  className={`dtk-iu-chevron ${isExpanded ? "dtk-iu-chevron-open" : ""}`}
                  onClick={() => onToggleExpand(row.iuKey)}
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <svg className="dtk-iu-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  ) : (
                    <svg className="dtk-iu-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>
                <IuCheckbox
                  checked={allSelected}
                  onClick={(e) => handleIuCheckboxClick(e, row)}
                  ariaLabel={iuLabel}
                />
                <span 
                  className="dtk-iu-label"
                  onClick={(e) => handleIuCheckboxClick(e, row)}
                  style={{ cursor: 'pointer' }}
                >
                  {iuLabel}
                </span>
              </div>
              {isExpanded && (
                <div className="dtk-iu-subgroup-list">
                  {row.subgroups.map((sg) => {
                    const iusGid = `${row.indicatorGid}|${row.unitGid}|${sg.sgGid}`;
                    const sgChecked = selectedGids.has(iusGid);
                    
                    return (
                      <div key={sg.sgGid} className="dtk-iu-subgroup-row">
                        <input
                          type="checkbox"
                          className="dtk-iu-subgroup-checkbox"
                          checked={sgChecked}
                          onChange={() => {}}
                          onClick={(e) => handleSubgroupCheckboxClick(e, iusGid)}
                          aria-label={sg.sgName}
                        />
                        <span 
                          className="dtk-iu-subgroup-label"
                          onClick={(e) => handleSubgroupCheckboxClick(e, iusGid)}
                          style={{ cursor: 'pointer' }}
                        >
                          {sg.sgName}
                          {sg.isDefault && <span className="dtk-iu-subgroup-default-badge"> (default)</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

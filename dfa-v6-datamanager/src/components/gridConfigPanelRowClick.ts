import type { MouseEvent as ReactMouseEvent, TableHTMLAttributes } from "react";

const GRID_PANEL_SWITCH_IGNORE_SELECTOR =
  "input, button, textarea, select, label, [role='listbox'], [role='option']";

/** Ignore clicks on interactive controls inside a grid row. */
export function isGridPanelSwitchIgnoredClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return target.closest(GRID_PANEL_SWITCH_IGNORE_SELECTOR) != null;
}

type GridConfigPanelRowTrPropsOptions = {
  panelOpen: boolean;
  isActiveRow: boolean;
  onSwitchRow: () => void;
};

/** Row props for switching an open configure drawer/panel by clicking another grid row. */
export function gridConfigPanelRowTrProps({
  panelOpen,
  isActiveRow,
  onSwitchRow,
}: GridConfigPanelRowTrPropsOptions): Pick<
  TableHTMLAttributes<HTMLTableRowElement>,
  "className" | "onClick"
> {
  if (!panelOpen) return {};
  return {
    className: "tv-grid-row--clickable",
    onClick: (event: ReactMouseEvent<HTMLTableRowElement>) => {
      if (isActiveRow) return;
      if (isGridPanelSwitchIgnoredClick(event.target)) return;
      onSwitchRow();
    },
  };
}

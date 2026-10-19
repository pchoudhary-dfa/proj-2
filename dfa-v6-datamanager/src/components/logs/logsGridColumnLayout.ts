import type { EditableGridColumnDef } from "@/components/TableView";
import type { GridColumnLayout } from "@/components/gridColumnLayout";

/** Fixed leading ID column width (transaction + server error log grids). */
export const LOG_GRID_ID_COLUMN_WIDTH = 96;

/** Fixed leading path column width — stays sticky while the rest of the table scrolls. */
export const LOG_GRID_PATH_COLUMN_WIDTH = 240;

/** Header clamp + body clip for narrow log grid columns (spread into each column def). */
export const LOG_GRID_TEXT_OVERFLOW: Pick<
  EditableGridColumnDef<unknown>,
  "headerTextClamp" | "cellOverflowHidden"
> = {
  headerTextClamp: true,
  cellOverflowHidden: true,
};

export function logGridIdColumnLayout(): GridColumnLayout {
  return { width: LOG_GRID_ID_COLUMN_WIDTH, sticky: "left" };
}

export function logGridPathColumnLayout(): GridColumnLayout {
  return {
    width: LOG_GRID_PATH_COLUMN_WIDTH,
    minWidth: 200,
    sticky: "left",
  };
}

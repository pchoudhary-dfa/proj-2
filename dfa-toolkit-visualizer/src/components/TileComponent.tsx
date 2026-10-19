"use client";

import { getTooltipHandlers, useTooltipCleanup } from "@/components/CustomTooltip";
import { useCore } from "@/contexts/CoreContext";
import type { SelectedItem } from "@/lib/visualizer/types";

type TileProps = {
  label: string;
  primaryColor?: string; // text / icon color (optional when chipClassName supplies styles)
  secondaryColor?: string; // background color (optional when chipClassName supplies styles)
  onRemoveAction: () => void;
  /** Optional border color for chip. */
  chipBorder?: string;
  /** Optional subtle shadow for chip. */
  chipShadow?: string;
  /** Optional class for chip (e.g. filter-panel__chip); when set, chip uses class for bg/color/border/shadow and remove icon uses inherit. */
  chipClassName?: string;
};

export function Tile({ label, primaryColor, secondaryColor, onRemoveAction, chipBorder, chipShadow, chipClassName }: TileProps) {
  const { t } = useCore();
  const tooltipHandlers = getTooltipHandlers(label);
  const useClassStyles = Boolean(chipClassName);
  return (
    <span
      className={`inline-flex min-w-0 max-w-[193px] shrink items-center rounded-sm py-1 px-2.5 text-sm font-normal transition-colors hover:opacity-90 ${chipClassName ?? ""}`.trim()}
      style={
        useClassStyles
          ? undefined
          : {
              backgroundColor: secondaryColor,
              color: primaryColor,
              ...(chipBorder ? { border: `1px solid ${chipBorder}` } : {}),
              ...(chipShadow ? { boxShadow: chipShadow } : {}),
            }
      }
      {...tooltipHandlers}
    >
      <span className="min-w-0 truncate text-sm filter-panel__label">{label}</span>
      <button
        type="button"
        onClick={onRemoveAction}
        className="flex-shrink-0 rounded p-0.5 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        style={useClassStyles ? { color: "inherit" } : { color: primaryColor }}
        aria-label={`${t("COMMON_REMOVE")} ${label}`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

type TileComponentProps = {
  items: SelectedItem[];
  primaryColor?: string;
  secondaryColor?: string;
  onChangeAction: (nextItems: SelectedItem[]) => void;
  chipBorder?: string;
  chipShadow?: string;
  /** When set, chip uses this class for styles (e.g. filter-panel__chip); primaryColor/secondaryColor/chipBorder/chipShadow can be omitted. */
  chipClassName?: string;
};

export function TileComponent({ items, primaryColor, secondaryColor, onChangeAction, chipBorder, chipShadow, chipClassName }: TileComponentProps) {
  useTooltipCleanup();
  const handleRemove = (id: string | number) => {
    const idStr = String(id);
    const nextItems = items.filter((item) => String(item.id) !== idStr);
    onChangeAction(nextItems);
  };

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Tile
          key={item.id}
          label={item.label}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          onRemoveAction={() => handleRemove(item.id)}
          chipBorder={chipBorder}
          chipShadow={chipShadow}
          chipClassName={chipClassName}
        />
      ))}
    </div>
  );
}

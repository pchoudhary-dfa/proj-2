"use client";

import { type Dispatch, type SetStateAction } from "react";
import { AccordionGroup, AccordionSection } from "./AccordionSection";
import type { ThemeSettings, VisualizationState } from "@/lib/visualizations/types";

type ThemeTabProps = {
  themeState: ThemeSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function ThemeTab({ themeState, setVizState }: ThemeTabProps) {
  return (
    <AccordionGroup>
      <AccordionSection
        title="Theme"
        badge={
          <span
            className="material-icons !text-base leading-none"
            aria-hidden
          >
            info_outline
          </span>
        }
        defaultOpen
      >
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text">
            <input type="checkbox" className="checkbox-comp" />
            Enable Theme
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text">
            <input type="checkbox" className="checkbox-comp" />
            Global Subgroup Color
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text">
            <input type="checkbox" className="checkbox-comp" />
            Enable Global IU Color
          </label>
        </div>
      </AccordionSection>
    </AccordionGroup>
  );
}

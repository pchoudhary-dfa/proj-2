"use client";

import { type Dispatch, type SetStateAction } from "react";
import { SelectField } from "@/components/SelectField";
import { AccordionGroup, AccordionSection } from "./AccordionSection";
import type { SeriesSettings, VisualizationState } from "@/lib/visualizations/types";

type SeriesTabProps = {
  seriesState: SeriesSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function SeriesTab({ seriesState, setVizState }: SeriesTabProps) {
  return (
    <AccordionGroup>
      <AccordionSection
        title="Series"
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
          <span className="text-xs font-medium text-text">Series</span>
          <SelectField
            options={[]}
            placeholder="Select Series"
            className="w-full"
          />
        </div>
      </AccordionSection>
    </AccordionGroup>
  );
}

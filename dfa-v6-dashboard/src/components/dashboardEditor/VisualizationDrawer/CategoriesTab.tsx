"use client";

import { type Dispatch, type SetStateAction } from "react";
import { AccordionGroup, AccordionSection } from "./AccordionSection";
import type { CategoriesSettings, VisualizationState } from "@/lib/visualizations/types";

type CategoriesTabProps = {
  categoriesState: CategoriesSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function CategoriesTab({ categoriesState, setVizState }: CategoriesTabProps) {
  return (
    <AccordionGroup>
      <AccordionSection title="Categories">
        <p className="text-xs text-text-muted">
          Configure category settings for the visualization.
        </p>
      </AccordionSection>
    </AccordionGroup>
  );
}

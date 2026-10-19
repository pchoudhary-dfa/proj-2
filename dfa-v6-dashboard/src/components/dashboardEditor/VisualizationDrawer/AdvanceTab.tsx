"use client";

import { type Dispatch, type SetStateAction } from "react";
import { TextField } from "@/components/TextField";
import { AccordionGroup, AccordionSection } from "./AccordionSection";
import type { AdvanceSettings, VisualizationState } from "@/lib/visualizations/types";

type AdvanceTabProps = {
  advanceState: AdvanceSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function AdvanceTab({ advanceState, setVizState }: AdvanceTabProps) {
  function updateAdvance(patch: Partial<AdvanceSettings>) {
    setVizState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        advance: { ...prev.settings.advance, ...patch },
      },
    }));
  }

  return (
    <AccordionGroup>
      <AccordionSection title="Datawarehouse" defaultOpen>
        <div className="flex flex-col gap-3">
          <label className="config-toggle-row">
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={true}
              onChange={(e) =>
                updateAdvance({
                })
              }
            />
            <span className="form-label">Enable Datawarehouse</span>
          </label>
        </div>
      </AccordionSection>

      <AccordionSection title="Context Menu Options">
        <div className="flex flex-col gap-3">
          <label className="config-toggle-row">
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={advanceState.contextMenu.enabled}
              onChange={(e) =>
                updateAdvance({
                  contextMenu: {
                    ...advanceState.contextMenu,
                    enabled: e.target.checked,
                  }
                })
              }
            />
            <span className="form-label">Enable Context Menu</span>
          </label>

          {advanceState.contextMenu.enabled && (
            <>
             
            </>
          )}
        </div>
      </AccordionSection>
    </AccordionGroup>
  );
}

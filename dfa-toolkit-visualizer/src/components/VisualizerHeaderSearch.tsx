"use client";

import { useCallback, useMemo } from "react";
import { useVisualizerState } from "@/contexts/VisualizerStateContext";
import { VendorChipSearch, type ChipSearchDetail } from "@/components/VendorChipSearch";
import { chipsToSelectedComponents } from "@/lib/visualizer/sessionAdapter";
import { selectedComponentsToVendorChips } from "@/lib/visualizer/sessionAdapter";
import { EMPTY_SELECTED_COMPONENTS } from "@/lib/visualizer/types";
import type { Locale } from "@/lib/i18n/config";

export function VisualizerHeaderSearch({ locale }: { locale: Locale }) {
  const { selectedComponents, setSelectedComponents, setHasChipsFromSearch } = useVisualizerState();

  const onApply = useCallback(
    (detail: ChipSearchDetail) => {
      const chips = detail.chips ?? [];
      if (chips.length === 0) {
        setSelectedComponents(EMPTY_SELECTED_COMPONENTS);
        setHasChipsFromSearch(false);
      } else {
        setSelectedComponents(chipsToSelectedComponents(chips));
      }
    },
    [setSelectedComponents, setHasChipsFromSearch]
  );

  const initialChips = useMemo(() => {
    const chips = selectedComponentsToVendorChips(selectedComponents);
    return chips.map((c) => ({
      keywordId: c.keywordId,
      keywordType: c.keywordType,
      displayText: c.displayText ?? String(c.keywordId),
    }));
  }, [selectedComponents]);

  const chipSearchStyle = useMemo(
    () => ({
      height: 38,
      chipBehavior: "scroll" as const,
      bgColor: "var(--color-surface-muted)",
      textColor: "var(--color-text)",
      borderColor: "1.5px solid var(--color-border)",
      crossBgColor: "var(--color-border)",
    }),
    [],
  );

  return (
    <div className="flex flex-1 min-w-0 w-full max-w-2xl h-10 items-center justify-center">
      <VendorChipSearch
        locale={locale}
        onApply={onApply}
        initialChips={initialChips}
        style={chipSearchStyle}
      />
    </div>
  );
}

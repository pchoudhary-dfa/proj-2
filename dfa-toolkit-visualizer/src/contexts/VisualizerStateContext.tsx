"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { SelectedComponents } from "@/lib/visualizer/types";
import { SESSION_STORAGE_KEYS } from "@/lib/constants";
import { resetSearchHandoffDrainCache } from "@/lib/visualizer/sessionAdapter";

interface VisualizerStateContextValue {
  selectedComponents: SelectedComponents;
  setSelectedComponents: React.Dispatch<React.SetStateAction<SelectedComponents>>;
  /** True when initial hydration from session (chips from landing search) ran. */
  hasChipsFromSearch: boolean;
  setHasChipsFromSearch: React.Dispatch<React.SetStateAction<boolean>>;
}

const VisualizerStateContext = createContext<VisualizerStateContextValue | undefined>(undefined);

/**
 * Clears visualizer context and session snapshots when leaving `/visualizer` for another
 * destination (e.g. home), so "Advanced Search" returns to a clean slate.
 * For sign-in and gallery, leaves context and session intact so returning does not wipe
 * chips/chart state or overwrite sessionStorage with an empty selection before unmount.
 */
function ClearVisualizerStateOnLeave() {
  const pathname = usePathname() ?? "";
  const prevPathnameRef = useRef(pathname);
  const ctx = useContext(VisualizerStateContext);

  useEffect(() => {
    if (!ctx) return;
    const { setSelectedComponents, setHasChipsFromSearch } = ctx;
    const wasVisualizer = prevPathnameRef.current.includes("/visualizer");
    const isVisualizer = pathname.includes("/visualizer");
    prevPathnameRef.current = pathname;
    if (wasVisualizer && !isVisualizer) {
      resetSearchHandoffDrainCache();

      // Temporary destinations: user often returns to the same visualizer session (browser back
      // or in-app "Back to visualization"). Do not clear context — clearing selectedComponents
      // here re-renders the visualizer before unmount and its persist effect can write an empty
      // selection to sessionStorage, wiping filters/chart state. Do not clear session keys either.
      const isTemporaryDestination =
        pathname.includes("/auth") || pathname.includes("/gallery");

      if (isTemporaryDestination) {
        return;
      }

      setSelectedComponents({});
      setHasChipsFromSearch(false);
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_SELECTION);
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_VIZ_CONFIG);
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_UI_STATE);
      } catch {
        // ignore storage errors
      }
    }
  }, [pathname, ctx]);

  if (!ctx) return null;
  return null;
}

export interface VisualizerStateProviderProps {
  children: ReactNode;
}

export function VisualizerStateProvider({ children }: VisualizerStateProviderProps) {
  const [selectedComponents, setSelectedComponents] = useState<SelectedComponents>({});
  const [hasChipsFromSearch, setHasChipsFromSearch] = useState(false);

  return (
    <VisualizerStateContext.Provider
      value={{
        selectedComponents,
        setSelectedComponents,
        hasChipsFromSearch,
        setHasChipsFromSearch,
      }}
    >
      <ClearVisualizerStateOnLeave />
      {children}
    </VisualizerStateContext.Provider>
  );
}

export function useVisualizerState(): VisualizerStateContextValue {
  const ctx = useContext(VisualizerStateContext);
  if (ctx === undefined) {
    throw new Error("useVisualizerState must be used within VisualizerStateProvider");
  }
  return ctx;
}

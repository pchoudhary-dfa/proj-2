"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DwOption } from "@/lib/constants";

/** Toolbar Delete wiring (e.g. bulk delete on Indicators page). Null = disabled. */
export type BulkDeleteToolbarConfig = {
  onClick: () => void;
  disabled: boolean;
};

/** Toolbar Export wiring (e.g. XLSX export on Indicators page). Null = disabled. */
export type ToolbarExportConfig = {
  onClick: () => void | Promise<void>;
  disabled: boolean;
};

/** Header Import button — same shape as export; null = not available. */
export type ToolbarImportConfig = ToolbarExportConfig;

/** Payload from the shell `FileImport` modal when the user confirms Import. */
export type FileImportSubmitPayload = {
  file: File | null;
  format: "csv" | "xlsx";
};

export type FileImportSubmitHandler = (
  payload: FileImportSubmitPayload
) => void | Promise<void>;

export type FileImportTemplateHandler = () => void;

export type { DwOption };

export type SidebarContextValue = {
  dwId: string;
  setDwId: (id: string) => void;
  /** All warehouses the current user can access (same list the sidebar dropdown shows). */
  dwOptions: DwOption[];
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  dwDropdownOpen: boolean;
  setDwDropdownOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  toolbarExtra: ReactNode;
  setToolbarExtra: (node: ReactNode) => void;
  /** When set, main toolbar Delete invokes this (Indicators bulk delete). */
  bulkDelete: BulkDeleteToolbarConfig | null;
  setBulkDelete: (config: BulkDeleteToolbarConfig | null) => void;
  /** When set, main toolbar Export invokes this (e.g. Indicators XLSX). */
  toolbarExport: ToolbarExportConfig | null;
  setToolbarExport: (config: ToolbarExportConfig | null) => void;
  /** When set, main toolbar Import invokes this. */
  toolbarImport: ToolbarImportConfig | null;
  setToolbarImport: (config: ToolbarImportConfig | null) => void;
  /** Incremented when DW-scoped permissions are refreshed; use as useMemo dep. */
  dwPermissionsVersion: number;
  /** Selected report-type slug on analytical/quality report pages; null on all other routes. */
  selectedReportType: string | null;
  setSelectedReportType: (value: string) => void;
  /**
   * Template routes use the shell `FileImport` modal; pages register the POST/upload logic here.
   * Cleared on unmount when the page sets null.
   */
  fileImportSubmitHandler: FileImportSubmitHandler | null;
  setFileImportSubmitHandler: (handler: FileImportSubmitHandler | null) => void;
  /** Optional callback for template download button in shell FileImport modal. */
  fileImportTemplateHandler: FileImportTemplateHandler | null;
  setFileImportTemplateHandler: (handler: FileImportTemplateHandler | null) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SidebarContextValue;
}) {
  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within Sidebar");
  }
  return ctx;
}

export function useSidebarOptional(): SidebarContextValue | null {
  return useContext(SidebarContext);
}

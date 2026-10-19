"use client";

import Drawer from "@/components/Drawer";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import type {
  DashboardFormValues,
  DatawarehouseOption,
} from "@/lib/dashboards/types";
import { MOCK_HEADER_FOOTER_ROWS } from "@/components/headerFooterGridColumns";
import type { HeaderFooterListRow } from "@/lib/headerFooter/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import GlobalScriptConfiguration from "./GlobalScriptConfiguration";
import HeaderFooterConfiguration from "./HeaderFooterConfiguration";
import MediaFilesConfiguration from "./MediaFilesConfiguration";
import MultipleLanguageSupportConfiguration from "./MultipleLanguageSupportConfiguration";
import SectionManagementConfiguration from "./SectionManagementConfiguration";
import SettingsConfiguration from "./SettingsConfiguration";

const CONFIGURATION_TABS = [
  { id: "settings", label: "Settings" },
  { id: "global-scripts", label: "Global Scripts" },
  { id: "header-footer", label: "Header/Footer" },
  { id: "media-files", label: "Media Files" },
  { id: "section-management", label: "Section Management" },
  { id: "multiple-language", label: "Multiple Language Support" },
] as const;

type ConfigurationTabId = (typeof CONFIGURATION_TABS)[number]["id"];

type DashboardConfigurationDrawerProps = {
  open: boolean;
  initialValues: DashboardFormValues;
  datawarehouseOptions: DatawarehouseOption[];
  publishBase?: string;
  saving?: boolean;
  onClose: () => void;
  onSave?: (values: DashboardFormValues) => void | Promise<void>;
};

export function DashboardConfigurationDrawer({
  open,
  initialValues,
  datawarehouseOptions,
  publishBase = '',
  saving = false,
  onClose,
  onSave,
}: DashboardConfigurationDrawerProps) {
  const [activeTab, setActiveTab] = useState<ConfigurationTabId>("settings");
  const [values, setValues] = useState<DashboardFormValues>(initialValues);
  const [headerFooterRows, setHeaderFooterRows] = useState<HeaderFooterListRow[]>(MOCK_HEADER_FOOTER_ROWS);

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setActiveTab("settings");
    }
  }, [open, initialValues]);

  const headerFooterOptions = useMemo(
    () => headerFooterRows.map((row) => ({ value: row.id, label: row.theme })),
    [headerFooterRows],
  );

  const handleRefreshHeaderFooters = useCallback(() => {
    setHeaderFooterRows([...MOCK_HEADER_FOOTER_ROWS]);
  }, []);

  const handleHeaderFooterSelect = useCallback(
    (id: string) => {
      const row = headerFooterRows.find((r) => r.id === id);
      if (!row) return;
      setValues((prev) => ({
        ...prev,
        headerFooter: {
          ...prev.headerFooter,
          selectedHeaderFooterId: id,
          headerHtml: row.headerHTML,
          footerHtml: row.footerHTML,
          footerFixedAtBottom: row.footer.fixedAtBottom,
        },
      }));
    },
    [headerFooterRows],
  );

  const publishPreview = useMemo(() => {
    const slug = values.dashboardUrl.trim();
    if (!slug) return publishBase;
    return `${publishBase.replace(/\/$/, "")}/${slug}`;
  }, [publishBase, values.dashboardUrl]);

  const handleSave = () => {
    void onSave?.(values);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="50%"
      zIndexClassName="z-[500]"
      title="Configuration"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-0 py-0"
      headerActions={
        saving ? (
          <button
            type="button"
            className="btn-comp-primary !h-9 gap-1.5 !text-xs font-semibold"
            disabled
          >
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            Saving…
          </button>
        ) : (
          <PrimarySaveButton
            className="!h-9 !text-xs font-semibold"
            onClick={handleSave}
          >
            Save Changes
          </PrimarySaveButton>
        )
      }
    >
      <nav className="flex-wrap bc-main-tabs shrink-0 overflow-x-auto border-b border-border px-5">
        {CONFIGURATION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn-comp-tab whitespace-nowrap ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "settings" && (
          <SettingsConfiguration
            values={values}
            setValues={setValues}
            publishPreview={publishPreview}
            datawarehouseOptions={datawarehouseOptions}
          />
        )}
        {activeTab === "global-scripts" && (
          <GlobalScriptConfiguration values={values} setValues={setValues} />
        )}
        {activeTab === "header-footer" && (
          <HeaderFooterConfiguration
            values={values}
            setValues={setValues}
            headerFooterOptions={headerFooterOptions}
            onRefreshHeaderFooters={handleRefreshHeaderFooters}
            onSelectHeaderFooter={handleHeaderFooterSelect}
          />
        )}
        {activeTab === "media-files" && <MediaFilesConfiguration />}
        {activeTab === "section-management" && (
          <SectionManagementConfiguration
            values={values}
            setValues={setValues}
          />
        )}
        {activeTab === "multiple-language" && (
          <MultipleLanguageSupportConfiguration
            values={values}
            setValues={setValues}
          />
        )}
      </div>
    </Drawer>
  );
}

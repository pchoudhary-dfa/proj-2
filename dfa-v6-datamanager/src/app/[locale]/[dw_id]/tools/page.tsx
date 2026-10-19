"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import { MainTabsBar } from "@/components/MainTabsBar";
import { Modal } from "@/components/Modal";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { postRequest } from "@/lib/api/http";
import { getDWAPIURL } from "@/lib/constants";

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

type ToolsTabId = "optimize" | "default_subgroup" | "set_ismrd" | "set_ius_data_exist";

type OptimizeOptions = {
  normalize_table_and_column_names?: boolean;
  ensure_primary_keys?: boolean;
  rebuild_indexes?: boolean;
  rebuild_indexes_after_reset?: boolean;
  seed_system_initial_defaults?: boolean;
  validate_sync_new_columns?: boolean;
  validate_sync_new_tables?: boolean;
  enforce_fk_referential_integrity?: boolean;
  sync_dw_stats_counts?: boolean;
  configuration_sync?: boolean;
  normalize_subgroup_display_orders?: boolean;
  ensure_default_subgroup?: boolean;
  ensure_default_workflow?: boolean;
};

export default function ToolsPage() {
  const { t } = useCore();
  const { dwId } = useSidebar();
  const [activeTab, setActiveTab] = useState<ToolsTabId>("optimize");
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.administration.tools);

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Tabs bar */}
      <div className="page-subtabs-row">
        <MainTabsBar
          tabs={(
            [
              ["optimize", t("OPTIMIZE_DATAWAREHOUSE"), "speed"] as const,
              ["default_subgroup", t("DEFAULT_SUBGROUP"), "tune"] as const,
              ["set_ismrd", t("SET_ISMRD"), "flag"] as const,
              ["set_ius_data_exist", t("SET_IUS_DATA_EXIST"), "check_circle"] as const,
            ] as const
          ).map(([value, label, icon]) => ({ value, label, icon }))}
          activeValue={activeTab}
          onSelect={setActiveTab}
        />
      </div>

      {/* Tab content panels */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "optimize" && <OptimizeTabContent dwId={dwId} t={t} />}
        {activeTab === "default_subgroup" && <DefaultSubgroupTabContent dwId={dwId} t={t} />}
        {activeTab === "set_ismrd" && <SetIsmrdTabContent dwId={dwId} t={t} />}
        {activeTab === "set_ius_data_exist" && <SetIusDataExistTabContent dwId={dwId} t={t} />}
      </div>
    </div>
  );
}

// Optimize Tab Content Component
function OptimizeTabContent({ dwId, t }: { dwId: string; t: (key: string) => string }) {
  const [loading, setLoading] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [optimizeOptions, setOptimizeOptions] = useState<OptimizeOptions>({
    normalize_table_and_column_names: true,
    ensure_primary_keys: true,
    rebuild_indexes: true,
    rebuild_indexes_after_reset: true,
    seed_system_initial_defaults: true,
    validate_sync_new_columns: true,
    validate_sync_new_tables: true,
    enforce_fk_referential_integrity: true,
    sync_dw_stats_counts: true,
    configuration_sync: false,
    normalize_subgroup_display_orders: false,
    ensure_default_subgroup: false,
    ensure_default_workflow: false,
  });

  const handleToggle = (key: keyof OptimizeOptions) => {
    setOptimizeOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const mandatoryOptions = [
    { key: "normalize_table_and_column_names" as const, label: t("NORMALIZE_TABLE_AND_COLUMN_NAMES") },
    { key: "ensure_primary_keys" as const, label: t("ENSURE_PRIMARY_KEYS") },
    { key: "rebuild_indexes" as const, label: t("REBUILD_INDEXES") },
    { key: "rebuild_indexes_after_reset" as const, label: t("REBUILD_INDEXES_AFTER_RESET") },
    { key: "seed_system_initial_defaults" as const, label: t("SEED_SYSTEM_INITIAL_DEFAULTS") },
    { key: "validate_sync_new_columns" as const, label: t("VALIDATE_SYNC_NEW_COLUMNS") },
    { key: "validate_sync_new_tables" as const, label: t("VALIDATE_SYNC_NEW_TABLES") },
  ];

  const optionalOptions = [
    { key: "enforce_fk_referential_integrity" as const, label: t("ENFORCE_FK_REFERENTIAL_INTEGRITY") },
    { key: "sync_dw_stats_counts" as const, label: t("SYNC_DW_STATS_COUNTS") },
    { key: "configuration_sync" as const, label: t("CONFIGURATION_SYNC") },
    { key: "normalize_subgroup_display_orders" as const, label: t("NORMALIZE_SUBGROUP_DISPLAY_ORDERS") },
    { key: "ensure_default_subgroup" as const, label: t("ENSURE_DEFAULT_SUBGROUP") },
    { key: "ensure_default_workflow" as const, label: t("ENSURE_DEFAULT_WORKFLOW") },
  ];

  const enabledCount = Object.values(optimizeOptions).filter(Boolean).length;
  const totalCount = Object.keys(optimizeOptions).length;

  const handleOptimize = async () => {
    if (!dwId) {
      toast.error(t("NO_DATAWAREHOUSE_SELECTED"));
      return;
    }

    if (enabledCount === 0) {
      toast.error(t("SELECT_AT_LEAST_ONE_OPTION"));
      return;
    }

    setLoading(true);
    setConfigModalOpen(false);

    try {
      const url = getDWAPIURL(dwId, "/optimize");
      const response = await postRequest(url, optimizeOptions, undefined, undefined, { suppressErrorMessage: true });
      
      if (response?.status === "success" || response?.success === true) {
        toast.success(t("OPTIMIZATION_SUCCESS"));
      } else {
        toast.error(response?.message || response?.err_message || t("OPTIMIZATION_FAILED"));
      }
    } catch (error: any) {
      toast.error(error?.message || t("OPTIMIZATION_FAILED"));
      console.error("Optimize error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-on-surface-variant">
          {t("OPTIMIZE_DESCRIPTION")}
        </p>
      </div>

      {/* Configuration Summary Card */}
      <div className="rounded-lg border border-border bg-surface-container p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-xs mb-1">{t("OPTIMIZATION_SETTINGS")}</h3>
            <p className="text-xs text-on-surface-variant">
              {t("OPTIONS_ENABLED").replace("{count}", String(enabledCount)).replace("{total}", String(totalCount))}
            </p>
          </div>
          <SecondaryButton
            type="button"
            icon="settings"
            onClick={() => setConfigModalOpen(true)}
            disabled={loading}
          >
            {t("CONFIGURE")}
          </SecondaryButton>
        </div>
      </div>

      {/* Action Button */}
      <div>
        <button
          onClick={handleOptimize}
          disabled={loading || enabledCount === 0}
          className="btn-comp-primary"
          title={enabledCount === 0 ? t("SELECT_AT_LEAST_ONE_OPTION") : undefined}
        >
          {loading ? t("LOADING") : t("OPTIMIZE")}
        </button>
        {enabledCount === 0 && (
          <p className="text-xs text-on-surface-variant mt-2">
            {t("CONFIGURE_AT_LEAST_ONE_OPTION")}
          </p>
        )}
      </div>

      {/* Configuration Modal */}
      <Modal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        title={t("OPTIMIZATION_SETTINGS")}
        titleId="optimize-config-modal-title"
        className="max-w-2xl"
        closeAriaLabel={t("CLOSE")}
        footer={
          <>
            <SecondaryButton type="button" variant="modal" onClick={() => setConfigModalOpen(false)}>
              {t("CANCEL")}
            </SecondaryButton>
            <PrimarySaveButton
              type="button"
              onClick={() => {
                setConfigModalOpen(false);
                toast.success(t("SAVE_SUCCESS"));
              }}
            >
              {t("SAVE")}
            </PrimarySaveButton>
          </>
        }
      >
        <div className="space-y-6">
          {/* Mandatory Steps */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-on-surface">
              {t("MANDATORY_STEPS")}
            </h3>
            <div className="space-y-0.5">
              {mandatoryOptions.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-surface-muted transition-colors"
                >
                  <span className="text-sm text-on-surface flex-1 pr-4">
                    {label}
                  </span>
                  <ToggleSwitch
                    size="md"
                    checked={!!optimizeOptions[key]}
                    onCheckedChange={() => handleToggle(key)}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Optional Steps */}
          <div>
            <h3 className="font-semibold text-sm mb-3 text-on-surface">
              {t("OPTIONAL_STEPS")}
            </h3>
            <div className="space-y-0.5">
              {optionalOptions.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-surface-muted transition-colors"
                >
                  <span className="text-sm text-on-surface flex-1 pr-4">
                    {label}
                  </span>
                  <ToggleSwitch
                    size="md"
                    checked={!!optimizeOptions[key]}
                    onCheckedChange={() => handleToggle(key)}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Default Subgroup Tab Content Component
function DefaultSubgroupTabContent({ dwId, t }: { dwId: string; t: (key: string) => string }) {
  const [loading, setLoading] = useState(false);

  const handleExecute = async () => {
    if (!dwId) {
      toast.error(t("NO_DATAWAREHOUSE_SELECTED"));
      return;
    }

    setLoading(true);

    try {
      const url = getDWAPIURL(dwId, "/ius/mark-default-subgroups");
      const response = await postRequest(url, {}, undefined, undefined, { suppressErrorMessage: true });
      
      if (response?.status === "success" || response?.success === true) {
        toast.success(t("DEFAULT_SUBGROUP_SUCCESS"));
      } else {
        toast.error(response?.message || response?.err_message || t("OPERATION_FAILED"));
      }
    } catch (error: any) {
      toast.error(error?.message || t("DEFAULT_SUBGROUP_FAILED"));
      console.error("Default subgroup error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-on-surface-variant">
          {t("DEFAULT_SUBGROUP_DESCRIPTION")}
        </p>
      </div>

      {/* Action Button */}
      <div>
        <button
          onClick={handleExecute}
          disabled={loading}
          className="btn-comp-primary"
        >
          {loading ? t("LOADING") : t("MARK_DEFAULT_SUBGROUPS")}
        </button>
      </div>
    </div>
  );
}

// Set ISMRD Tab Content Component
function SetIsmrdTabContent({ dwId, t }: { dwId: string; t: (key: string) => string }) {
  const [loading, setLoading] = useState(false);

  const handleExecute = async () => {
    if (!dwId) {
      toast.error(t("NO_DATAWAREHOUSE_SELECTED"));
      return;
    }

    setLoading(true);

    try {
      const url = getDWAPIURL(dwId, "/data/set-mrd");
      const response = await postRequest(url, {}, undefined, undefined, { suppressErrorMessage: true });
      
      if (response?.status === "success" || response?.success === true) {
        toast.success(t("SET_ISMRD_SUCCESS"));
      } else {
        toast.error(response?.message || response?.err_message || t("OPERATION_FAILED"));
      }
    } catch (error: any) {
      toast.error(error?.message || t("SET_ISMRD_FAILED"));
      console.error("Set ISMRD error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-on-surface-variant">
          {t("SET_ISMRD_DESCRIPTION")}
        </p>
      </div>

      {/* Action Button */}
      <div>
        <button
          onClick={handleExecute}
          disabled={loading}
          className="btn-comp-primary"
        >
          {loading ? t("LOADING") : t("SET_ISMRD")}
        </button>
      </div>
    </div>
  );
}

// Set IUS Data Exist Tab Content Component
function SetIusDataExistTabContent({ dwId, t }: { dwId: string; t: (key: string) => string }) {
  const [loading, setLoading] = useState(false);

  const handleExecute = async () => {
    if (!dwId) {
      toast.error(t("NO_DATAWAREHOUSE_SELECTED"));
      return;
    }

    setLoading(true);

    try {
      const url = getDWAPIURL(dwId, "/data/set-ius-data-exist");
      const response = await postRequest(url, {}, undefined, undefined, { suppressErrorMessage: true });
      
      if (response?.status === "success" || response?.success === true) {
        toast.success(t("SET_IUS_DATA_EXIST_SUCCESS"));
      } else {
        toast.error(response?.message || response?.err_message || t("OPERATION_FAILED"));
      }
    } catch (error: any) {
      toast.error(error?.message || t("SET_IUS_DATA_EXIST_FAILED"));
      console.error("Set IUS Data Exist error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-on-surface-variant">
          {t("SET_IUS_DATA_EXIST_DESCRIPTION")}
        </p>
      </div>

      {/* Action Button */}
      <div>
        <button
          onClick={handleExecute}
          disabled={loading}
          className="btn-comp-primary"
        >
          {loading ? t("LOADING") : t("SET_IUS_DATA_EXIST")}
        </button>
      </div>
    </div>
  );
}

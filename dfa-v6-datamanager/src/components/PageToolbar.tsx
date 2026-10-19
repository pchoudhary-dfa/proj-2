"use client";

import { type ReactNode } from "react";
import { useCoreOptional } from "@/contexts/CoreContext";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import { ToolbarHelpButton } from "@/components/ToolbarHelpButton";
import type {
  BulkDeleteToolbarConfig,
  ToolbarExportConfig,
  ToolbarImportConfig,
} from "@/contexts/SidebarContext";
import { PrimaryButton } from "@/components/PrimaryButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SECONDARY_TOOLBAR_CLASS, SecondaryButton } from "@/components/SecondaryButton";
import { SelectField, type SelectFieldOption } from "@/components/SelectField";

const _fb = getTranslationsFallback("en");
const fallbackT = (code: string, fb?: string) => _fb[code] ?? fb ?? code;

/**
 * Primary page toolbar under the breadcrumb strip (icon + title + actions).
 * Used inside the warehouse shell and on app-shell pages that mirror the same UX.
 */
export function PageToolbar({
  title,
  icon,
  titlePrefix,
  toolbarExtra,
  bulkDelete,
  toolbarExport,
  toolbarImport,
  hideActions,
  hideImportExport,
  hideImport = false,
  hideDelete,
  hideInfo = false,
  reportTypeSelect,
  notificationDwId,
}: {
  title: string;
  icon: string;
  titlePrefix?: ReactNode;
  toolbarExtra: ReactNode;
  bulkDelete: BulkDeleteToolbarConfig | null;
  toolbarExport: ToolbarExportConfig | null;
  toolbarImport: ToolbarImportConfig | null;
  hideActions: boolean;
  hideImportExport: boolean;
  /** When false, only Export is shown (Import hidden). Requires `hideImportExport` false. */
  hideImport?: boolean;
  hideDelete: boolean;
  hideInfo?: boolean;
  reportTypeSelect?: {
    options: SelectFieldOption[];
    value: string;
    onChange: (value: string) => void;
  } | null;
  /** When set, shows the warehouse-scoped notification bell on the far right. */
  notificationDwId?: string;
}) {
  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;
  const deleteEnabled = Boolean(bulkDelete && !bulkDelete.disabled);
  const renderInlineExtra = hideActions && Boolean(toolbarExtra);
  const showInfo = !hideInfo;

  const infoButton = showInfo ? <ToolbarHelpButton /> : null;

  return (
    <>
      <div className="flex h-breadcrumb shrink-0 items-center gap-0 border-b border-border bg-surface px-5">
      {titlePrefix ? <div className="me-2 shrink-0">{titlePrefix}</div> : null}
      <span className="page-chrome-icon mr-2 h-8 w-8">
        <span className="material-icons text-sm leading-none text-primary">
          {icon}
        </span>
      </span>
      <span className="text-sm font-bold tracking-tight text-text whitespace-nowrap">
        {title}
      </span>
      {reportTypeSelect ? (
        <>
          <div className="mx-[18px] h-5 w-px shrink-0 self-center bg-border" />
          <div className="shrink-0">
            <SelectField
              className="min-w-[200px] max-w-[340px]"
              options={reportTypeSelect.options}
              value={reportTypeSelect.value}
              onChange={(e) => reportTypeSelect.onChange(e.target.value)}
              menuPortal
            />
          </div>
        </>
      ) : null}
      {!hideActions && (
        <>
          <div className="mx-[18px] h-5 w-px shrink-0 self-center bg-border" />
          <div className="flex flex-wrap items-center gap-1">
            {!hideImportExport ? (
              <>
                {!hideImport ? (
                  <SecondaryButton
                    icon="upload"
                    disabled={!toolbarImport || toolbarImport.disabled}
                    onClick={() => void toolbarImport?.onClick()}
                    title={
                      !toolbarImport
                        ? t(
                            "TOOLBAR_EXPORT_NOT_AVAILABLE",
                            "Import is not available on this page"
                          )
                        : t("IMPORT")
                    }
                  >
                    {t("IMPORT")}
                  </SecondaryButton>
                ) : null}
                <SecondaryButton
                  icon="download"
                  disabled={!toolbarExport || toolbarExport.disabled}
                  onClick={() => void toolbarExport?.onClick()}
                  title={
                    !toolbarExport
                      ? t("TOOLBAR_EXPORT_NOT_AVAILABLE")
                      : t("TOOLBAR_DOWNLOAD_EXCEL")
                  }
                >
                  {t("EXPORT")}
                </SecondaryButton>
              </>
            ) : null}
            {!hideDelete ? (
              deleteEnabled ? (
                <PrimaryButton
                  icon="delete"
                  disabled={!bulkDelete || bulkDelete.disabled}
                  onClick={() => bulkDelete?.onClick()}
                  title={t("TOOLBAR_DELETE_SELECTED")}
                >
                  {t("DELETE")}
                </PrimaryButton>
              ) : (
                <SecondaryButton
                  icon="delete"
                  disabled={!bulkDelete || bulkDelete.disabled}
                  onClick={() => bulkDelete?.onClick()}
                  title={t("TOOLBAR_SELECT_HINT")}
                >
                  {t("DELETE")}
                </SecondaryButton>
              )
            ) : null}
          </div>
          {infoButton}
        </>
      )}
      {hideActions && showInfo ? (
        <>
          <div className="mx-[18px] h-5 w-px shrink-0 self-center bg-border" />
          {infoButton}
        </>
      ) : null}
      {renderInlineExtra ? (
        <>
          <div className="mx-[18px] h-5 w-px shrink-0 self-center bg-border" />
          <div className="flex min-w-0 flex-1 items-center">{toolbarExtra}</div>
        </>
      ) : (
        <>
          <div className="flex-1" />
          {toolbarExtra}
        </>
      )}
      {notificationDwId ? (
        <NotificationBell
          dwId={notificationDwId}
          variant="toolbar"
          className="ms-2"
        />
      ) : null}
      </div>
    </>
  );
}

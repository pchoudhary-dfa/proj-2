"use client";
import type { ReactNode } from "react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton, SECONDARY_TOOLBAR_CLASS } from "@/components/SecondaryButton";
import GroupButton, { type GroupButtonItem } from "./GroupButton";

export type ToolbarExportConfig = {
  onClick: () => void | Promise<void>;
  disabled: boolean;
};

export type ToolbarImportConfig = ToolbarExportConfig;

export type BulkDeleteToolbarConfig = {
  onClick: () => void;
  disabled: boolean;
};

export type PageToolbarProps = {
  title: string;
  icon?: string;
  onAddClick?: () => void;
  addLabel?: string;
  hideInfo?: boolean;
  onInfoClick?: () => void;
  trailingMeta?: ReactNode;
  groupButtons?: GroupButtonItem[];
  toolbarExtra?: ReactNode;
  toolbarExport?: ToolbarExportConfig | null;
  toolbarImport?: ToolbarImportConfig | null;
  bulkDelete?: BulkDeleteToolbarConfig | null;
  hideActions?: boolean;
  hideImportExport?: boolean;
  hideImport?: boolean;
  hideDelete?: boolean;
};

export function PageToolbar({
  title,
  icon = "grid_view",
  onAddClick,
  addLabel = "Add",
  hideInfo = false,
  onInfoClick,
  trailingMeta,
  groupButtons,
  toolbarExtra,
  toolbarExport,
  toolbarImport,
  bulkDelete,
  hideActions = false,
  hideImportExport = false,
  hideImport = false,
  hideDelete = false,
}: PageToolbarProps) {

  const hasGroupButtons = Boolean(groupButtons?.length);
  const hasAdd = Boolean(onAddClick) && !hasGroupButtons;
  const deleteEnabled = Boolean(bulkDelete && !bulkDelete.disabled);

  const showConfigActions = !hideActions && (toolbarExport || toolbarImport || bulkDelete);

  return (
    <section className="bc-main shrink-0">
      <div className="flex h-breadcrumb shrink-0 items-center gap-0 bg-surface px-5">
        <span className="bg-primary-soft mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--color-primary)_24%,var(--color-border))]">
          <span className="material-icons text-sm leading-none text-primary">{icon}</span>
        </span>
        <span className="whitespace-nowrap text-sm font-bold tracking-tight text-text">
          {title}
        </span>

        {(hasAdd || hasGroupButtons || showConfigActions || !hideInfo) && (
          <div className="mx-[18px] h-5 w-px shrink-0 self-center bg-border" />
        )}

        {hasAdd ? (
          <div className="flex flex-wrap items-center gap-1">
            <PrimaryButton type="button" icon="add" onClick={onAddClick}>
              {addLabel}
            </PrimaryButton>
          </div>
        ) : null}
        {hasGroupButtons ? (
          <div className="flex flex-wrap items-center gap-1">
            <GroupButton buttons={groupButtons!} />
          </div>
        ) : null}

        {showConfigActions ? (
          <div className="flex flex-wrap items-center gap-1">
            {!hideImportExport ? (
              <>
                {!hideImport ? (
                  <SecondaryButton
                    icon="upload"
                    disabled={!toolbarImport || toolbarImport.disabled}
                    onClick={() => void toolbarImport?.onClick()}
                  >
                    Import
                  </SecondaryButton>
                ) : null}
                <SecondaryButton
                  icon="download"
                  disabled={!toolbarExport || toolbarExport.disabled}
                  onClick={() => void toolbarExport?.onClick()}
                >
                  Export
                </SecondaryButton>
              </>
            ) : null}
            {!hideDelete ? (
              deleteEnabled ? (
                <PrimaryButton
                  icon="delete"
                  disabled={!bulkDelete || bulkDelete.disabled}
                  onClick={() => bulkDelete?.onClick()}
                >
                  Delete
                </PrimaryButton>
              ) : (
                <SecondaryButton
                  icon="delete"
                  disabled={!bulkDelete || bulkDelete.disabled}
                  onClick={() => bulkDelete?.onClick()}
                >
                  Delete
                </SecondaryButton>
              )
            ) : null}
          </div>
        ) : null}

        {!hideInfo ? (
          <>
            <div className="mx-[3px] h-5 w-px shrink-0 self-center" />
            <button type="button" className={SECONDARY_TOOLBAR_CLASS} onClick={onInfoClick} aria-label="Info">
              <span className="material-icons !text-sm leading-none" aria-hidden>
                info
              </span>
              Info
            </button>
          </>
        ) : null}
        <div className="flex-1" />
        {toolbarExtra}
        {trailingMeta}
      </div>
    </section>
  );
}


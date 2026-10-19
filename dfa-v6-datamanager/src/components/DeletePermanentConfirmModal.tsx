"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { SecondaryButton } from "@/components/SecondaryButton";

export type DeletePermanentConfirmModalImpact = {
  title: ReactNode;
  loading?: boolean;
  loadingLabel?: ReactNode;
  error?: string | null;
  /** Shown under error when preview fetch failed; delete may still proceed */
  errorInfoLabel?: ReactNode;
  /** List item contents when preview is ready (not loading, no error) */
  lines?: ReactNode[] | null;
  className?: string;
};

export type DeletePermanentConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleId: string;
  closeAriaLabel: string;
  dismissDisabled?: boolean;
  children: ReactNode;
  /** Optional impact preview (`.modal-impact`); omit when not needed */
  impact?: DeletePermanentConfirmModalImpact;
  /** Error from the delete action itself (shown below body / impact) */
  runError?: string | null;
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  confirmLoadingLabel?: string;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  onConfirm: () => void | Promise<void>;
};

function DeleteModalImpactBody({
  title,
  loading = false,
  loadingLabel,
  error = null,
  errorInfoLabel,
  lines = null,
  className,
}: DeletePermanentConfirmModalImpact) {
  const showLines = !loading && !error && lines != null && lines.length > 0;

  return (
    <div className={className ? `modal-impact ${className}` : "modal-impact"}>
      <div className="modal-impact-title">{title}</div>
      {loading ? (
        <p className="cell-empty" style={{ margin: 0 }}>
          {loadingLabel}
        </p>
      ) : null}
      {!loading && error ? (
        <>
          <p className="modal-error">{error}</p>
          {errorInfoLabel ? (
            <p className="cell-empty mt-2 text-xs">{errorInfoLabel}</p>
          ) : null}
        </>
      ) : null}
      {showLines ? (
        <ul className="modal-impact-list">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Data (+ optional IUS) row counts from association-count delete preview APIs */
export function dataIusAssociationImpactLines(
  labels: { dataRows: string; iusRows?: string },
  counts: { dataCount: number; iusCount?: number }
): string[] {
  const out = [
    labels.dataRows.replace("{count}", counts.dataCount.toLocaleString()),
  ];
  if (labels.iusRows != null && counts.iusCount != null) {
    out.push(labels.iusRows.replace("{count}", counts.iusCount.toLocaleString()));
  }
  return out;
}

/**
 * Standard delete confirmation dialog: {@link Modal} chrome + modal-panel body patterns,
 * with toolbar-aligned footer buttons (`btn-comp-secondary`, `btn-comp-primary`).
 * Pass {@link impact} when the dialog should show an association / impact preview block.
 */
export function DeletePermanentConfirmModal({
  open,
  onClose,
  title,
  titleId,
  closeAriaLabel,
  dismissDisabled = false,
  children,
  impact,
  runError = null,
  cancelLabel,
  onCancel,
  confirmLabel,
  confirmLoadingLabel,
  confirmDisabled = false,
  confirmLoading = false,
  onConfirm,
}: DeletePermanentConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleId={titleId}
      dismissDisabled={dismissDisabled}
      closeAriaLabel={closeAriaLabel}
      footer={
        <>
          <SecondaryButton type="button" variant="modal" disabled={confirmLoading} onClick={onCancel}>
            {cancelLabel}
          </SecondaryButton>
          <button
            type="button"
            className="btn-comp-primary"
            disabled={confirmDisabled || confirmLoading}
            onClick={() => {
              void Promise.resolve(onConfirm());
            }}
          >
            {confirmLoading && confirmLoadingLabel
              ? confirmLoadingLabel
              : confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {impact ? <DeleteModalImpactBody {...impact} /> : null}
      {runError ? (
        <p className="modal-error" style={{ marginTop: 12 }}>
          {runError}
        </p>
      ) : null}
    </Modal>
  );
}

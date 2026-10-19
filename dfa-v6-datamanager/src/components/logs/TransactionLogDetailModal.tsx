"use client";

import { useMemo, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { SecondaryButton } from "@/components/SecondaryButton";
import { formatDateString } from "@/services/utils";
import type { TransactionLogRow } from "./transactionLogsGridColumns";

type TransactionLogDetailModalProps = {
  open: boolean;
  row: TransactionLogRow | null;
  onClose: () => void;
  t: (code: string, fallback?: string) => string;
};

function formatBlock(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "—";
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return trimmed;
    }
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  const text = String(value).trim();
  return text || "—";
}

function formatTextField(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-xs text-text">{children}</dd>
    </div>
  );
}

export function TransactionLogDetailModal({
  open,
  row,
  onClose,
  t,
}: TransactionLogDetailModalProps) {
  const title = useMemo(() => {
    if (!row) return t("TRANSACTION_LOG_DETAILS", "Transaction log details");
    const path = row.path?.trim();
    return path
      ? `${t("TRANSACTION_LOG_DETAILS", "Transaction log details")} — ${path}`
      : `${t("TRANSACTION_LOG_DETAILS", "Transaction log details")} #${row.id}`;
  }, [row, t]);

  if (!row) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleId="transaction-log-detail-title"
      className="max-w-4xl"
      bodyClassName="!max-h-[min(72vh,640px)] overflow-y-auto"
      footer={
        <SecondaryButton type="button" variant="modal" onClick={onClose}>
          {t("CLOSE", "Close")}
        </SecondaryButton>
      }
    >
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailField label="ID">{row.id}</DetailField>
        <DetailField label={t("CREATED", "Created")}>
          {formatDateString(row.created)}
        </DetailField>
        <DetailField label={t("ACTION", "Action")}>{row.action ?? "—"}</DetailField>
        <DetailField label={t("STATUS", "Status")}>{row.status ?? "—"}</DetailField>
        <DetailField label={t("MODULE", "Module")}>{row.module ?? "—"}</DetailField>
        <DetailField label={t("IDENTIFIER", "Identifier")}>
          {row.identifier ?? "—"}
        </DetailField>
        <DetailField label={t("USER_ID", "User ID")}>{row.user_id ?? "—"}</DetailField>
        <DetailField label={t("PATH", "Path")}>
          <span className="break-all text-[11px]">{row.path ?? "—"}</span>
        </DetailField>
      </dl>

      <div className="mt-4 space-y-4">
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("DESCRIPTION", "Description")}
          </h3>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-[11px] leading-relaxed text-text">
            {formatTextField(row.description)}
          </pre>
        </section>

        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("PREVIOUS_VALUE", "Previous value")}
          </h3>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-[11px] leading-relaxed text-text">
            {formatBlock(row.previous_value)}
          </pre>
        </section>

        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("NEW_VALUE", "New value")}
          </h3>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-[11px] leading-relaxed text-text">
            {formatBlock(row.new_value)}
          </pre>
        </section>
      </div>
    </Modal>
  );
}

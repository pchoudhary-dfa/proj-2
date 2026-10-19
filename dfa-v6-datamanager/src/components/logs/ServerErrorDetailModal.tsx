"use client";

import { useMemo, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { SecondaryButton } from "@/components/SecondaryButton";
import { formatDateString } from "@/services/utils";
import type { ServerErrorLogRow } from "./serverErrorsGridColumns";

type ServerErrorDetailModalProps = {
  open: boolean;
  row: ServerErrorLogRow | null;
  onClose: () => void;
  t: (code: string, fallback?: string) => string;
};

function formatBlock(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return trimmed;
  }
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

export function ServerErrorDetailModal({
  open,
  row,
  onClose,
  t,
}: ServerErrorDetailModalProps) {
  const title = useMemo(() => {
    if (!row) return t("SERVER_ERROR_DETAILS", "Server error details");
    const path = row.path?.trim();
    return path
      ? `${t("SERVER_ERROR_DETAILS", "Server error details")} — ${path}`
      : `${t("SERVER_ERROR_DETAILS", "Server error details")} #${row.id}`;
  }, [row, t]);

  if (!row) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleId="server-error-detail-title"
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
        <DetailField label={t("LEVEL", "Level")}>{row.level ?? "—"}</DetailField>
        <DetailField label={t("METHOD", "Method")}>{row.method ?? "—"}</DetailField>
        <DetailField label={t("STATUS", "Status")}>{row.status_code ?? "—"}</DetailField>
        <DetailField label={t("PATH", "Path")}>
          <span className="break-all text-[11px]">{row.path ?? "—"}</span>
        </DetailField>
      </dl>

      <div className="mt-4 space-y-4">
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("ERROR_MESSAGE_LABEL", "Error message")}
          </h3>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-[11px] leading-relaxed text-text">
            {row.error_message?.trim() || "—"}
          </pre>
        </section>

        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("STACK_TRACE", "Stack trace")}
          </h3>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-[11px] leading-relaxed text-text">
            {row.stack_trace?.trim() || "—"}
          </pre>
        </section>

        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("REQUEST_BODY", "Request body")}
          </h3>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-[11px] leading-relaxed text-text">
            {formatBlock(row.request_body)}
          </pre>
        </section>

        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            {t("REQUEST_HEADERS", "Request headers")}
          </h3>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-muted p-3 text-[11px] leading-relaxed text-text">
            {formatBlock(row.request_headers)}
          </pre>
        </section>
      </div>
    </Modal>
  );
}

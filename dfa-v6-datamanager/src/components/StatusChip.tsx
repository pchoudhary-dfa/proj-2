"use client";

type StatusChipProps = {
  status?: string | null;
  label?: string;
  className?: string;
};

type StatusTone =
  | "approved"
  | "rejected"
  | "pending"
  | "revision"
  | "draft"
  | "submitted"
  | "default";

function normalizeStatusTone(status: string): StatusTone {
  const token = status.trim().toUpperCase();
  if (token === "APPROVED" || token === "PUBLISHED") return "approved";
  if (token === "REJECTED" || token === "FAILED") return "rejected";
  if (token === "PENDING_REVIEW" || token === "BUILDING" || token === "UNDER_REVIEW") return "pending";
  if (token === "REVISION" || token === "RETURNED" || token === "RETURNED_FOR_REVISION") return "revision";
  if (token === "SUBMITTED") return "submitted";
  if (token === "DRAFT" || token === "CREATED" || token === "READY") return "draft";
  return "default";
}

const TONE_CLASS: Record<StatusTone, string> = {
  approved: "tone-pill--success",
  rejected: "tone-pill--error",
  pending: "tone-pill--warning",
  revision: "tone-pill--primary",
  draft: "tone-pill--primary",
  submitted: "tone-pill--primary",
  default: "tone-pill--neutral",
};

export function StatusChip({ status, label, className = "" }: StatusChipProps) {
  const token = String(status ?? "").trim();
  const tone = token ? normalizeStatusTone(token) : "default";
  const toneClass = TONE_CLASS[tone];

  const text = (label ?? token) || "-";
  return <span className={`status-chip ${toneClass} ${className}`.trim()}>{text}</span>;
}

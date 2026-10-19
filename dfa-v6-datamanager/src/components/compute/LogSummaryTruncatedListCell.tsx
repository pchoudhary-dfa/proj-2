"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { SecondaryButton } from "@/components/SecondaryButton";

const SEE_MORE_MIN_LEN = 44;
/** Inline bulleted rows (matches compute process target-IUS cell). */
const INLINE_BULLET_MAX = 3;

export type LogSummaryItem =
  | string
  | {
      label: string;
      /** Shown under the label in the see-more modal (e.g. area id / gid). */
      modalDetail?: string;
    };

function itemLabel(item: LogSummaryItem): string {
  return typeof item === "string" ? item : item.label;
}

function itemModalDetail(item: LogSummaryItem): string | undefined {
  if (typeof item === "string") return undefined;
  const detail = item.modalDetail?.trim();
  if (!detail || detail === item.label.trim()) return undefined;
  return detail;
}

function LogSummaryInlineBulletedPreview({ items }: { items: LogSummaryItem[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((item, index) => (
        <li
          key={`log-summary-inline-${index}`}
          className="flex min-w-0 items-center gap-1.5"
        >
          <span
            className="h-1 w-1 shrink-0 rounded-full bg-text-muted"
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-xs leading-tight text-text">
            {itemLabel(item)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function LogSummaryModalListItem({ item }: { item: LogSummaryItem }) {
  const label = itemLabel(item);
  const detail = itemModalDetail(item);
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span
        className={
          detail
            ? "min-w-0 whitespace-normal break-words font-medium text-text"
            : "min-w-0 whitespace-normal break-words text-text"
        }
      >
        {label}
      </span>
      {detail ? (
        <span className="min-w-0 whitespace-normal break-words text-text-muted">
          {detail}
        </span>
      ) : null}
    </span>
  );
}

export type LogSummaryTruncatedListCellProps = {
  items: LogSummaryItem[];
  /** Shown when `items` is empty (e.g. "—" or a single formatted summary). */
  fallbackDisplay: string;
  modalTitle: string;
  seeMoreAriaLabel: string;
  /** Template with `{count}` in the modal lead line. */
  modalCountLabel: string;
  /** Unique id for modal title accessibility (defaults to generic). */
  modalTitleId?: string;
  t: (code: string, fallback?: string) => string;
};

export function LogSummaryTruncatedListCell({
  items,
  fallbackDisplay,
  modalTitle,
  seeMoreAriaLabel,
  modalCountLabel,
  modalTitleId = "dm-log-summary-list-title",
  t,
}: LogSummaryTruncatedListCellProps) {
  const [open, setOpen] = useState(false);

  const modalItems =
    items.length > 0
      ? items
      : fallbackDisplay.trim() && fallbackDisplay !== "—"
        ? [fallbackDisplay]
        : [];

  const showSeeMore =
    items.length > INLINE_BULLET_MAX ||
    (items.length > 1 && items.length <= INLINE_BULLET_MAX) ||
    (items.length === 1 && itemLabel(items[0]!).length >= SEE_MORE_MIN_LEN) ||
    (items.length === 0 &&
      modalItems.length === 1 &&
      itemLabel(modalItems[0]!).length >= SEE_MORE_MIN_LEN);

  const inlineItems =
    items.length > INLINE_BULLET_MAX
      ? items.slice(0, INLINE_BULLET_MAX)
      : items;

  if (items.length === 0 && !showSeeMore) {
    return (
      <span className="block min-w-0 truncate text-text">{fallbackDisplay}</span>
    );
  }

  if (!showSeeMore) {
    return <LogSummaryInlineBulletedPreview items={items} />;
  }

  const full = modalItems
    .map((item) => {
      const detail = itemModalDetail(item);
      const label = itemLabel(item);
      return detail ? `${label}\n${detail}` : label;
    })
    .join("\n");

  return (
    <>
      <div className="flex min-w-0 max-w-full flex-col items-stretch gap-0.5 py-0">
        <div className="min-w-0" title={full}>
          {items.length > 0 ? (
            <LogSummaryInlineBulletedPreview items={inlineItems} />
          ) : (
            <span className="block truncate text-xs leading-tight text-text">
              {fallbackDisplay}
            </span>
          )}
        </div>
        <button
          type="button"
          className="self-start text-xs font-medium whitespace-nowrap text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          aria-label={seeMoreAriaLabel}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          {t("SEE_MORE")}
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={modalTitle}
        titleId={modalTitleId}
        dismissDisabled={false}
        closeAriaLabel={t("CLOSE")}
        className="max-w-lg"
        bodyClassName="flex min-h-0 flex-col gap-2"
        footer={
          <SecondaryButton
            type="button"
            variant="modal"
            onClick={() => setOpen(false)}
          >
            {t("CLOSE")}
          </SecondaryButton>
        }
      >
        <p className="text-xs text-text-muted">
          {modalCountLabel.replace("{count}", String(modalItems.length))}
        </p>
        <div className="min-h-0 max-h-[min(55vh,420px)] overflow-y-auto rounded border border-border bg-surface-muted/60">
          <ul className="m-0 list-none divide-y divide-border px-0 py-0 text-xs">
            {modalItems.map((item, index) => (
              <li
                key={`log-summary-${index}`}
                className="min-w-0 px-3 py-2"
              >
                <LogSummaryModalListItem item={item} />
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}

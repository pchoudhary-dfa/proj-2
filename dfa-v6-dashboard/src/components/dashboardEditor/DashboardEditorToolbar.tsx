"use client";

import Link from "next/link";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SECONDARY_TOOLBAR_CLASS } from "@/components/SecondaryButton";

type DashboardEditorToolbarProps = {
  title: string;
  backHref: string;
  onConfigurationClick?: () => void;
};

export function DashboardEditorToolbar({
  title,
  backHref,
  onConfigurationClick,
}: DashboardEditorToolbarProps) {
  return (
    <section className="bc-main shrink-0">
      <div className="flex h-breadcrumb shrink-0 items-center gap-2 bg-surface px-5">
        <Link
          href={backHref}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition hover:bg-surface-muted hover:text-text"
          aria-label="Back to dashboards"
        >
          <span className="material-icons !text-lg leading-none">arrow_back</span>
        </Link>
        <h1 className="min-w-0 truncate text-sm font-bold tracking-tight text-text">
          {title}
        </h1>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={SECONDARY_TOOLBAR_CLASS}
            onClick={onConfigurationClick}
          >
            <span className="material-icons !text-sm leading-none" aria-hidden>
              settings
            </span>
            Configuration
          </button>
          <button type="button" className={SECONDARY_TOOLBAR_CLASS}>
            <span className="material-icons !text-sm leading-none" aria-hidden>
              visibility
            </span>
            Preview
          </button>
          <PrimaryButton type="button" icon="event_available">
            Publish
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}

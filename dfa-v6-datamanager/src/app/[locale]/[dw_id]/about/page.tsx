"use client";

import { useCore } from "@/contexts/CoreContext";
import Breadcrumb from "@/components/Breadcrumb";
import { AppShellUtilityPageToolbar } from "@/components/AppShellUtilityPageToolbar";

export default function AboutPage() {
  const { t } = useCore();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      <Breadcrumb />
      <AppShellUtilityPageToolbar />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto overflow-x-hidden px-5 py-4">
        <p className="w-full max-w-none text-xs leading-relaxed text-text">
          {t("ABOUT_US_DESCRIPTION")}
        </p>
      </div>
    </main>
  );
}

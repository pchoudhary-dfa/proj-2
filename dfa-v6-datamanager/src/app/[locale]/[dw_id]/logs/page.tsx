"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import TransactionLogsAdminTab from "@/components/logs/TransactionLogsAdminTab";
import { DW_ROUTE_PERMISSIONS, hasAnyDwPermission } from "@/lib/auth/user";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";

type DwLogsSection = "transaction-logs";

function resolveDwLogsSection(_sectionRaw: string | null): DwLogsSection {
  return "transaction-logs";
}

export default function DwLogsPage() {
  const searchParams = useSearchParams();
  const sectionRaw = searchParams.get("section");

  useDwPermissionGuard(DW_ROUTE_PERMISSIONS.logs.transactionLogs);

  const canViewTransactionLogs = hasAnyDwPermission(
    DW_ROUTE_PERMISSIONS.logs.transactionLogs
  );

  const resolvedSection = resolveDwLogsSection(sectionRaw);
  const activeSection: DwLogsSection = useMemo(() => {
    if (resolvedSection === "transaction-logs" && canViewTransactionLogs) {
      return "transaction-logs";
    }
    return "transaction-logs";
  }, [resolvedSection, canViewTransactionLogs]);

  if (!canViewTransactionLogs) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
      {activeSection === "transaction-logs" ? <TransactionLogsAdminTab /> : null}
    </div>
  );
}

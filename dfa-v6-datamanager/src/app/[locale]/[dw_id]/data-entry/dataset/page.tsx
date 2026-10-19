"use client";

import { useParams } from "next/navigation";
import { DatasetFlowPage } from "@/components/dataEntry/DatasetFlowPage";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

export default function DataEntryDatasetPage() {
  const params = useParams<{ locale: string; dw_id: string }>();
  const locale = readParam(params?.locale) || "en";
  const dwId = readParam(params?.dw_id);
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.dataManagement.dataEntry, {
    parentResourceCode: DW_ROUTE_PERMISSIONS.dataManagement.parent,
  });
  if (!allowed) return null;
  return <DatasetFlowPage locale={locale} dwId={dwId} section="data-entry" />;
}

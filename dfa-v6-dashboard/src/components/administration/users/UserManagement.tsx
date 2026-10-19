"use client";

import UserManagementGridView from "@/components/administration/users/UserManagementGridView";
import { useCore } from "@/contexts/CoreContext";
import {
  FALLBACK_USER_ROWS,
  fetchUsersList,
  type UserRow,
} from "@/lib/users/users";
import { useCallback, useEffect, useState } from "react";

export default function UserManagement() {
  const { t } = useCore();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchUsersList({ page: 1, page_size: 100 });
    if (result.error) {
      setError(result.error);
      setRows(FALLBACK_USER_ROWS);
    } else {
      setRows(result.rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return (
    <div className="app-body flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <main className="sys-config bg-surface-muted font-body">
          <section className="bc-main shrink-0">
            <div className="flex h-breadcrumb shrink-0 items-center gap-0 bg-surface px-5">
              <span className="bg-primary-soft mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--color-primary)_24%,var(--color-border))]">
                <span className="material-icons text-sm leading-none text-primary">
                  group
                </span>
              </span>
              <span className="whitespace-nowrap text-sm font-bold tracking-tight text-text">
                {t("USER_MANAGEMENT", "User Management")}
              </span>
            </div>
          </section>

          {error && (
            <div className="mx-5 mt-2 rounded border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning-text">
              <span className="material-icons mr-1 align-middle !text-sm">warning</span>
              Could not load users from server. Showing cached data.
            </div>
          )}

          <div className="flex min-h-0 flex-1 min-w-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md">
              <div className="h-full min-h-0 flex-1">
                <UserManagementGridView
                  rows={rows}
                  selectedIds={new Set()}
                  onSelectedIdsChange={() => {}}
                  getRowActions={() => []}
                  loading={loading}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

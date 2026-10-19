"use client";

import { useMemo } from "react";
import { useSidebarOptional } from "@/contexts/SidebarContext";
import { hasDwPermission } from "@/lib/auth/user";

export type DwCrudPermissions = {
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

/**
 * Hook to get CRUD permissions for a DW resource.
 * Re-computes when DW permissions are refreshed (dwPermissionsVersion changes).
 *
 * @param resourceCode - The DW resource code (e.g. "dm_dw_indicator")
 * @returns Object with canCreate, canRead, canUpdate, canDelete booleans
 *
 * @example
 * const { canCreate, canUpdate, canDelete } = useDwCrudPermissions("dm_dw_indicator");
 * // Disable add button if user can't create
 * <button disabled={!canCreate}>Add</button>
 */
export function useDwCrudPermissions(resourceCode: string): DwCrudPermissions {
  const sidebar = useSidebarOptional();
  const dwPermissionsVersion = sidebar?.dwPermissionsVersion ?? 0;

  return useMemo(
    () => ({
      canCreate: hasDwPermission(resourceCode, "C"),
      canRead: hasDwPermission(resourceCode, "R"),
      canUpdate: hasDwPermission(resourceCode, "U"),
      canDelete: hasDwPermission(resourceCode, "D"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resourceCode, dwPermissionsVersion]
  );
}

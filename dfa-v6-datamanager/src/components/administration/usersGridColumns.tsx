"use client";

import type { RefObject } from "react";
import { useMemo } from "react";
import type { UserRaw, UserRoleMasterItem } from "@/lib/api/types";
import { gridTextFieldClassName } from "@/components/TextField";
import { GridConfigureButton } from "@/components/GridConfigureButton";
import { TV_GRID_CONFIGURE_BTN } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  InlineEditRowActions,
  type EditableGridColumnDef,
} from "@/components/TableView";

/** Fits ~3 role name chips on one row (e.g. Administrator + Data Entry Admin + Template Admin). */
const USER_ROLES_COL = "th-user-roles";

export function userRowId(row: UserRaw): string {
  return `uid-${row.id}`;
}

export function formatUserRoleLabels(
  codes: string[],
  rolesMeta?: Record<string, UserRoleMasterItem> | null
): string {
  if (!codes.length) return "";
  return codes
    .map((code) => {
      const name = rolesMeta?.[code]?.name?.trim();
      return name || code;
    })
    .join(", ");
}

export type UserInlineFocusField =
  | "username"
  | "first_name"
  | "last_name"
  | "email"
  | "status"
  | "phone"
  | "organisation"
  | "location";

export type UseUsersGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  allRowsSelected: boolean;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  colFilterUsername: string;
  setColFilterUsername: (v: string) => void;
  colFilterFirstName: string;
  setColFilterFirstName: (v: string) => void;
  colFilterEmail: string;
  setColFilterEmail: (v: string) => void;
  colFilterLastName: string;
  setColFilterLastName: (v: string) => void;
  colFilterStatus: string;
  setColFilterStatus: (v: string) => void;
  colFilterPhone: string;
  setColFilterPhone: (v: string) => void;
  colFilterOrganisation: string;
  setColFilterOrganisation: (v: string) => void;
  colFilterLocation: string;
  setColFilterLocation: (v: string) => void;
  colFilterRoles: string;
  setColFilterRoles: (v: string) => void;
  rolesMeta?: Record<string, UserRoleMasterItem> | null;
  onSortUsername: () => void;
  onSortFirstName: () => void;
  onSortEmail: () => void;
  onSortStatus: () => void;
  onSortLastLogin: () => void;
  sortIconUsername: "arrow_upward" | "arrow_downward" | "unfold_more";
  sortIconFirstName: "arrow_upward" | "arrow_downward" | "unfold_more";
  sortIconEmail: "arrow_upward" | "arrow_downward" | "unfold_more";
  sortIconStatus: "arrow_upward" | "arrow_downward" | "unfold_more";
  sortIconLastLogin: "arrow_upward" | "arrow_downward" | "unfold_more";
  // inline edit
  editingRowId: string | null;
  inlineUsername: string;
  setInlineUsername: (v: string) => void;
  inlineUsernameInputRef: RefObject<HTMLInputElement | null>;
  inlineFirstName: string;
  setInlineFirstName: (v: string) => void;
  inlineFirstNameInputRef: RefObject<HTMLInputElement | null>;
  inlineLastName: string;
  setInlineLastName: (v: string) => void;
  inlineEmail: string;
  setInlineEmail: (v: string) => void;
  inlineStatus: number;
  setInlineStatus: (v: number) => void;
  inlinePhone: string;
  setInlinePhone: (v: string) => void;
  inlinePhoneInputRef: RefObject<HTMLInputElement | null>;
  inlineOrganisation: string;
  setInlineOrganisation: (v: string) => void;
  inlineOrganisationInputRef: RefObject<HTMLInputElement | null>;
  inlineLocation: string;
  setInlineLocation: (v: string) => void;
  inlineLocationInputRef: RefObject<HTMLInputElement | null>;
  inlineSaveLoading: boolean;
  onStartInlineEdit?: (row: UserRaw, focusField: UserInlineFocusField) => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
  openConfigPanel?: (row: UserRaw) => void;
  onResendRegistrationEmail?: (user: UserRaw) => void;
};

function displayCell(s: string | number | null | undefined): string {
  if (s == null) return "—";
  const v = String(s).trim();
  return v || "—";
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export function useUsersGridColumns(
  p: UseUsersGridColumnsParams
): EditableGridColumnDef<UserRaw>[] {
  const { t } = p;
  return useMemo((): EditableGridColumnDef<UserRaw>[] => {
    return [
      {
        id: "select",
        layout: { width: 1 },
        header: {
          kind: "selectAll",
          checked: p.allRowsSelected,
          onChange: p.selectAll,
          ariaLabel: t("SELECT_ALL"),
        },
        filter: null,
        cell: ({ row }) => {
          const id = userRowId(row);
          return (
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={id ? p.selectedRowIds.has(id) : false}
              onChange={() => id && p.toggleSelect(id)}
              aria-label={t("SELECT_ROW_USER").replace("{id}", String(row.id))}
            />
          );
        },
      },
      {
        id: "username",
        layout: { width: 240, sticky: true, main: true },
        header: {
          kind: "sort",
          text: t("USERNAME"),
          onSort: p.onSortUsername,
          sortIcon: p.sortIconUsername,
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("USERNAME")),
        },
        filter: {
          kind: "search",
          value: p.colFilterUsername,
          onChange: p.setColFilterUsername,
          placeholder: t("FILTER_BY_LABEL").replace("{label}", t("USERNAME")),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("USERNAME")),
        },
        onCellDoubleClick: p.onStartInlineEdit ? ({ row }) => p.onStartInlineEdit!(row, "username") : undefined,
        viewCell: ({ row }) => (
          <span className="block truncate text-xs text-text">
            {displayCell(row.username)}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineUsername,
          onChange: p.setInlineUsername,
          inputRef: p.inlineUsernameInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("USERNAME"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "first_name",
        layout: { width: 5, minWidth: 80 },
        header: {
          kind: "sort",
          text: t("FIRST_NAME"),
          onSort: p.onSortFirstName,
          sortIcon: p.sortIconFirstName,
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("FIRST_NAME")),
        },
        filter: {
          kind: "search",
          value: p.colFilterFirstName,
          onChange: p.setColFilterFirstName,
          placeholder: t("FILTER_BY_LABEL").replace("{label}", t("FIRST_NAME")),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("FIRST_NAME")),
        },
        onCellDoubleClick: p.onStartInlineEdit ? ({ row }) => p.onStartInlineEdit!(row, "first_name") : undefined,
        viewCell: ({ row }) => (
          <span className="block truncate text-xs text-text">
            {displayCell(row.first_name)}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineFirstName,
          onChange: p.setInlineFirstName,
          inputRef: p.inlineFirstNameInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("FIRST_NAME"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "last_name",
        layout: { width: 5, minWidth: 80 },
        header: t("LAST_NAME"),
        filter: {
          kind: "search",
          value: p.colFilterLastName,
          onChange: p.setColFilterLastName,
          placeholder: t("FILTER_BY_LABEL").replace("{label}", t("LAST_NAME")),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("LAST_NAME")),
        },
        onCellDoubleClick: p.onStartInlineEdit ? ({ row }) => p.onStartInlineEdit!(row, "last_name") : undefined,
        viewCell: ({ row }) => (
          <span className="block truncate text-xs text-text">
            {displayCell(row.last_name)}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineLastName,
          onChange: p.setInlineLastName,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("LAST_NAME"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "email",
        layout: { width: 320, minWidth: 200, maxWidth: 400 },
        header: {
          kind: "sort",
          text: t("EMAIL"),
          onSort: p.onSortEmail,
          sortIcon: p.sortIconEmail,
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("EMAIL")),
        },
        filter: {
          kind: "search",
          value: p.colFilterEmail,
          onChange: p.setColFilterEmail,
          placeholder: t("FILTER_BY_LABEL").replace("{label}", t("EMAIL")),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("EMAIL")),
        },
        onCellDoubleClick: p.onStartInlineEdit ? ({ row }) => p.onStartInlineEdit!(row, "email") : undefined,
        viewCell: ({ row }) => (
          <span className="flex items-center gap-1 min-w-0">
            <span
              className="material-icons text-sm shrink-0"
              style={{ color: row.email_verified ? "var(--color-success)" : "var(--color-error)" }}
              aria-label={row.email_verified ? t("EMAIL_VERIFIED") : t("EMAIL_NOT_VERIFIED")}
            >
              {row.email_verified ? "check_circle" : "warning"}
            </span>
            <span className="truncate text-xs text-text">{displayCell(row.email)}</span>
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineEmail,
          onChange: p.setInlineEmail,
          type: "email",
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("EMAIL"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "status",
        layout: { width: 4 },
        header: {
          kind: "sort",
          text: t("STATUS"),
          onSort: p.onSortStatus,
          sortIcon: p.sortIconStatus,
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("STATUS")),
        },
        filter: {
          kind: "select",
          value: p.colFilterStatus,
          onChange: p.setColFilterStatus,
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("STATUS")),
          options: [
            { value: "", label: t("ALL") },
            { value: "1", label: t("ACTIVE") },
            { value: "0", label: t("INACTIVE") },
          ],
        },
        onCellDoubleClick: p.onStartInlineEdit ? ({ row }) => p.onStartInlineEdit!(row, "status") : undefined,
        viewCell: ({ row }) => {
          const active = row.status === 1;
          return (
            <span
              className={`label-tag ${active ? "tone-pill--success-subtle" : "tone-pill--muted-subtle"}`}
            >
              {active ? t("ACTIVE") : t("INACTIVE")}
            </span>
          );
        },
        editField: {
          kind: "select",
          value: String(p.inlineStatus),
          onChange: (v) => p.setInlineStatus(Number(v)),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("STATUS"),
          options: [
            { value: "1", label: t("ACTIVE") },
            { value: "0", label: t("INACTIVE") },
          ],
        },
      },
      {
        id: "organisation",
        layout: { width: 220 },
        header: t("ORGANIZATION"),
        filter: {
          kind: "search",
          value: p.colFilterOrganisation,
          onChange: p.setColFilterOrganisation,
          placeholder: t("FILTER_BY_LABEL").replace("{label}", t("ORGANIZATION")),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("ORGANIZATION")),
        },
        onCellDoubleClick: p.onStartInlineEdit
          ? ({ row }) => p.onStartInlineEdit!(row, "organisation")
          : undefined,
        viewCell: ({ row }) => (
          <span className="block truncate text-xs text-text">
            {displayCell(row.organisation)}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineOrganisation,
          onChange: p.setInlineOrganisation,
          inputRef: p.inlineOrganisationInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("ORGANIZATION"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "location",
        layout: { width: 280 },
        header: t("LOCATION"),
        filter: {
          kind: "search",
          value: p.colFilterLocation,
          onChange: p.setColFilterLocation,
          placeholder: t("FILTER_BY_LABEL").replace("{label}", t("LOCATION")),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("LOCATION")),
        },
        onCellDoubleClick: p.onStartInlineEdit
          ? ({ row }) => p.onStartInlineEdit!(row, "location")
          : undefined,
        viewCell: ({ row }) => (
          <span className="block truncate text-xs text-text">
            {displayCell(row.location)}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineLocation,
          onChange: p.setInlineLocation,
          inputRef: p.inlineLocationInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("LOCATION"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "phone",
        layout: { width: 5, minWidth: 80 },
        header: t("PHONE_NUMBER"),
        filter: {
          kind: "search",
          value: p.colFilterPhone,
          onChange: p.setColFilterPhone,
          placeholder: t("FILTER_BY_LABEL").replace("{label}", t("PHONE_NUMBER")),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("PHONE_NUMBER")),
        },
        onCellDoubleClick: p.onStartInlineEdit
          ? ({ row }) => p.onStartInlineEdit!(row, "phone")
          : undefined,
        viewCell: ({ row }) => (
          <span className="block truncate text-xs text-text">
            {displayCell(row.phone)}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlinePhone,
          onChange: p.setInlinePhone,
          inputRef: p.inlinePhoneInputRef,
          inputMode: "numeric",
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("PHONE_NUMBER"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "last_login",
        layout: { width: 170 },
        header: {
          kind: "sort",
          text: t("LAST_LOGIN"),
          onSort: p.onSortLastLogin,
          sortIcon: p.sortIconLastLogin,
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("LAST_LOGIN")),
        },
        filter: null,
        cell: ({ row }) => (
          <span className="block truncate text-xs text-text-muted">
            {formatDate(row.last_loggedin_on)}
          </span>
        ),
      },
      {
        id: "actions",
        layout: { width: 100, minWidth: 100, maxWidth: 100, sticky: "right" as const },
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row, mode }) => (
          <InlineEditRowActions
            isEditing={mode === "edit" && p.editingRowId === userRowId(row)}
            saveLoading={p.inlineSaveLoading}
            onSave={p.onInlineSave}
            onCancel={p.onInlineCancel}
            saveTitle={t("SAVE")}
            saveAriaLabel={t("SAVE")}
            cancelTitle={t("CANCEL_INLINE_EDIT")}
            cancelAriaLabel={t("CANCEL_INLINE_EDIT")}
            viewContent={
              (p.onResendRegistrationEmail && !row.email_verified) || p.openConfigPanel ? (
                <div className="add-row-action-btns">
                  {!row.email_verified && p.onResendRegistrationEmail && (
                    <button
                      type="button"
                      className={TV_GRID_CONFIGURE_BTN}
                      title={t("RESEND_REGISTRATION_EMAIL", "Resend registration email")}
                      aria-label={t("RESEND_REGISTRATION_EMAIL", "Resend registration email")}
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onResendRegistrationEmail!(row);
                      }}
                    >
                      <span className="material-icons !text-sm" aria-hidden="true">mail</span>
                    </button>
                  )}
                  {p.openConfigPanel && (
                    <GridConfigureButton
                      wrapInActionBtns={false}
                      ariaLabel={t("CONFIGURE", "Configure")}
                      onClick={(e) => {
                        e.stopPropagation();
                        p.openConfigPanel!(row);
                      }}
                    />
                  )}
                </div>
              ) : null
            }
          />
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- granular `p.*` deps; full `p` would match compiler but churns column defs
  }, [
    t,
    p.allRowsSelected,
    p.selectedRowIds,
    p.selectAll,
    p.toggleSelect,
    p.colFilterUsername,
    p.setColFilterUsername,
    p.colFilterFirstName,
    p.setColFilterFirstName,
    p.colFilterEmail,
    p.setColFilterEmail,
    p.colFilterLastName,
    p.setColFilterLastName,
    p.colFilterStatus,
    p.setColFilterStatus,
    p.colFilterPhone,
    p.setColFilterPhone,
    p.colFilterOrganisation,
    p.setColFilterOrganisation,
    p.colFilterLocation,
    p.setColFilterLocation,
    p.colFilterRoles,
    p.setColFilterRoles,
    p.rolesMeta,
    p.onSortUsername,
    p.onSortFirstName,
    p.onSortEmail,
    p.onSortStatus,
    p.onSortLastLogin,
    p.sortIconUsername,
    p.sortIconFirstName,
    p.sortIconEmail,
    p.sortIconStatus,
    p.sortIconLastLogin,
    p.inlineUsername,
    p.setInlineUsername,
    p.inlineUsernameInputRef,
    p.inlineFirstName,
    p.setInlineFirstName,
    p.inlineFirstNameInputRef,
    p.inlineLastName,
    p.setInlineLastName,
    p.inlineEmail,
    p.setInlineEmail,
    p.inlineStatus,
    p.setInlineStatus,
    p.inlinePhone,
    p.setInlinePhone,
    p.inlinePhoneInputRef,
    p.inlineOrganisation,
    p.setInlineOrganisation,
    p.inlineOrganisationInputRef,
    p.inlineLocation,
    p.setInlineLocation,
    p.inlineLocationInputRef,
    p.inlineSaveLoading,
    p.onStartInlineEdit,
    p.onInlineSave,
    p.onInlineCancel,
    p.openConfigPanel,
    p.onResendRegistrationEmail,
  ]);
}

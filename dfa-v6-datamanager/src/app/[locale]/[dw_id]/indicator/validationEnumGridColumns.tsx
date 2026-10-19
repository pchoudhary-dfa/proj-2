"use client";

import { useMemo, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { renderEditableGridEditField } from "@/components/editableGridEditField";
import { gridTextFieldClassName } from "@/components/TextField";
import type { ValidationRuleEnumOptionFormInput } from "@/lib/api/types";
import type { EditableGridColumnDef } from "@/components/TableView";

/** Locales shown as columns in the enum values table (matches typical DW setup). */
export const ENUM_TABLE_LOCALES = ["en", "fr", "ar"] as const;

/** Left-to-right tab order for Code → locales → Score (used for Enter navigation). */
export const ENUM_ROW_FIELD_ORDER = [
  "code",
  ...ENUM_TABLE_LOCALES,
  "score",
] as const;

export type EnumGhostFocusField = (typeof ENUM_ROW_FIELD_ORDER)[number];

export type ValidationEnumGridRow = ValidationRuleEnumOptionFormInput & {
  _rowKey: string;
};

export function emptyEnumRowLabels(): Record<string, string> {
  return Object.fromEntries(ENUM_TABLE_LOCALES.map((l) => [l, ""])) as Record<
    string,
    string
  >;
}

export function withEnumRowKey(
  row: ValidationRuleEnumOptionFormInput
): ValidationEnumGridRow {
  return { ...row, _rowKey: crypto.randomUUID() };
}

const COMPACT_TD = "!px-1.5 !py-0.5";

export type UseValidationEnumGridColumnsParams = {
  t: (code: string) => string;
  rows: ValidationEnumGridRow[];
  onRowsChange: Dispatch<SetStateAction<ValidationEnumGridRow[]>>;
  ghostBump: number;
  onDataRowEnterNav: (
    e: KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    field: EnumGhostFocusField,
    rowCount: number,
    ghostKey: number
  ) => void;
};

function localePlaceholder(t: (code: string) => string, loc: string): string {
  if (loc === "en") return t("LANG_EN");
  if (loc === "fr") return t("LANG_FR");
  return t("LANG_AR");
}

export function useValidationEnumGridColumns(
  p: UseValidationEnumGridColumnsParams
): EditableGridColumnDef<ValidationEnumGridRow>[] {
  const { t, rows, onRowsChange, ghostBump, onDataRowEnterNav } = p;

  return useMemo((): EditableGridColumnDef<ValidationEnumGridRow>[] => {
    const localeCols: EditableGridColumnDef<ValidationEnumGridRow>[] =
      ENUM_TABLE_LOCALES.map((loc) => ({
        id: `label_${loc}`,
        header: localePlaceholder(t, loc),
        layout: { width: 120, minWidth: 96 },
        tdExtraProps: { className: COMPACT_TD },
        cell: (ctx) =>
          renderEditableGridEditField(
            {
              kind: "text",
              value: ctx.row.labels[loc] ?? "",
              onChange: (v) => {
                const next = [...rows];
                next[ctx.rowIndex] = {
                  ...ctx.row,
                  labels: {
                    ...ctx.row.labels,
                    [loc]: v,
                  },
                };
                onRowsChange(next);
              },
              onKeyDown: (e) =>
                onDataRowEnterNav(e, ctx.rowIndex, loc, rows.length, ghostBump),
              id: `validation-enum-${ctx.rowIndex}-${loc}`,
              placeholder: localePlaceholder(t, loc),
              className: gridTextFieldClassName(),
            },
            ctx
          ),
      }));

    return [
      {
        id: "code",
        header: t("CODE"),
        layout: { width: 72, minWidth: 72 },
        tdExtraProps: { className: COMPACT_TD },
        cell: (ctx) =>
          renderEditableGridEditField(
            {
              kind: "text",
              value: ctx.row.option_code,
              onChange: (v) => {
                const next = [...rows];
                next[ctx.rowIndex] = { ...ctx.row, option_code: v };
                onRowsChange(next);
              },
              onKeyDown: (e) =>
                onDataRowEnterNav(e, ctx.rowIndex, "code", rows.length, ghostBump),
              id: `validation-enum-${ctx.rowIndex}-code`,
              placeholder: t("CODE"),
              className: gridTextFieldClassName(),
            },
            ctx
          ),
      },
      ...localeCols,
      {
        id: "score",
        header: t("SCORE"),
        layout: { width: 88, minWidth: 88, maxWidth: 88 },
        tdExtraProps: { className: COMPACT_TD },
        cell: (ctx) =>
          renderEditableGridEditField(
            {
              kind: "text",
              value:
                ctx.row.score != null && Number.isFinite(ctx.row.score)
                  ? String(ctx.row.score)
                  : "",
              onChange: (v) => {
                const next = [...rows];
                const rawScore = v.trim();
                next[ctx.rowIndex] = {
                  ...ctx.row,
                  score: rawScore === "" ? null : Number(rawScore),
                };
                onRowsChange(next);
              },
              onKeyDown: (e) =>
                onDataRowEnterNav(e, ctx.rowIndex, "score", rows.length, ghostBump),
              id: `validation-enum-${ctx.rowIndex}-score`,
              placeholder: "0",
              className: gridTextFieldClassName("text-left"),
              type: "text",
              inputMode: "decimal",
            },
            ctx
          ),
      },
      {
        id: "actions",
        header: { kind: "srOnly", text: t("ACTIONS") },
        layout: { width: 48, minWidth: 48, maxWidth: 48 },
        tdExtraProps: { className: `${COMPACT_TD} text-center` },
        cell: ({ rowIndex }) => (
          <button
            type="button"
            className="btn-comp-ghost btn-comp-ghost--lg btn-comp-ghost--danger"
            onClick={() => {
              onRowsChange(rows.filter((_, i) => i !== rowIndex));
            }}
            aria-label={t("REMOVE_OPTION")}
          >
            <span className="material-icons !text-sm leading-none" aria-hidden>
              delete_outline
            </span>
          </button>
        ),
      },
    ];
  }, [t, rows, onRowsChange, ghostBump, onDataRowEnterNav]);
}

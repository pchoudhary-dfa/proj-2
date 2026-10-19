// Column definitions for the Translations data grid.
// First column: Code (fixed, sortable, filterable).
// Subsequent columns: one per system language locale (dynamic, editable inline).

import { useMemo } from "react";
import type { RefObject } from "react";
import { GridInlineSaveCancelActions } from "@/components/GridInlineSaveCancelActions";
import { gridTextFieldClassName } from "@/components/TextField";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  type EditableGridColumnDef,
} from "@/components/TableView";
import type { SystemLanguageRow } from "@/lib/api/core";
import { systemLanguageRowLabel } from "@/lib/api/core";

export type TranslationRow = {
  code: string;
  translations: Record<string, string>;
};

export function translationRowId(row: TranslationRow): string {
  return row.code;
}

export type UseTranslationsGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  locale: string;
  languages: SystemLanguageRow[];
  /** Locale code for the English column (e.g. `en`); filter row only when set. */
  englishColumnLocale: string | null;
  colFilterCode: string;
  setColFilterCode: (v: string) => void;
  colFilterEnglish: string;
  setColFilterEnglish: (v: string) => void;
  onSortCode: () => void;
  codeSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  canUpdate: boolean;
  editingRowId: string | null;
  inlineTranslations: Record<string, string>;
  setInlineTranslation: (locale: string, value: string) => void;
  inlineInputRefs: RefObject<Map<string, HTMLInputElement>>;
  inlineSaveLoading: boolean;
  onStartInlineEdit: (row: TranslationRow) => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
};

export function useTranslationsGridColumns(
  p: UseTranslationsGridColumnsParams
): EditableGridColumnDef<TranslationRow>[] {
  const { t, locale: displayLocale, languages, englishColumnLocale } = p;

  const localeKey = (loc: string) =>
    loc.trim().replace(/_/g, "-").toLowerCase();

  return useMemo((): EditableGridColumnDef<TranslationRow>[] => {
    const langColumnPercent =
      languages.length > 0 ? (100 - 18) / languages.length : 0;

    const langCols: EditableGridColumnDef<TranslationRow>[] = languages.map(
      (lang) => {
        const locale = lang.locale;
        const label = systemLanguageRowLabel(lang, displayLocale);
        const isEnglishCol =
          englishColumnLocale != null &&
          localeKey(locale) === localeKey(englishColumnLocale);
        return {
          id: `lang_${locale}`,
          layout: { width: langColumnPercent, unit: "%", minWidth: 160 },
          cellOverflowHidden: true,
          header: label,
          filter: isEnglishCol
            ? {
                kind: "search",
                value: p.colFilterEnglish,
                onChange: p.setColFilterEnglish,
                placeholder: t("SEARCH_PLACEHOLDER"),
                ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("LANG_EN")),
              }
            : null,
          onCellDoubleClick: p.canUpdate
            ? ({ row }) => p.onStartInlineEdit(row)
            : undefined,
          viewCell: ({ row }) => {
            const text = row.translations[locale] ?? "";
            return (
              <span className="block truncate text-xs" title={text || undefined}>
                {text || <span className="text-text-muted">—</span>}
              </span>
            );
          },
          editField: p.canUpdate
            ? {
                kind: "text",
                value: p.inlineTranslations[locale] ?? "",
                onChange: (v) => p.setInlineTranslation(locale, v),
                inputRef: (el) => {
                  if (el) p.inlineInputRefs.current?.set(locale, el);
                  else p.inlineInputRefs.current?.delete(locale);
                },
                className: gridTextFieldClassName("min-w-0 w-full"),
                disabled: p.inlineSaveLoading,
                ariaLabel: label,
                onEscape: p.onInlineCancel,
              }
            : undefined,
        };
      }
    );

    return [
      // --- Code column (sticky, sortable, filterable) ---
      {
        id: "code",
        layout: {
          width: 18,
          unit: "%",
          minWidth: 180,
          sticky: "left",
        },
        header: {
          kind: "sort",
          text: t("TRANSLATION_CODE"),
          onSort: p.onSortCode,
          sortIcon: p.codeSortIcon,
          sortAriaLabel: t("SORT_BY_CODE"),
        },
        filter: {
          kind: "search",
          value: p.colFilterCode,
          onChange: p.setColFilterCode,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("TRANSLATION_CODE")),
        },
        onCellDoubleClick: p.canUpdate
          ? ({ row }) => p.onStartInlineEdit(row)
          : undefined,
        cell: ({ row }) => (
          <span className="block truncate text-xs font-medium" title={row.code}>
            {row.code}
          </span>
        ),
      },

      // --- Dynamic language columns ---
      ...langCols,

      // --- Inline save / cancel actions column ---
      {
        id: "inlineActions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row, mode }) => {
          if (
            mode !== "edit" ||
            p.editingRowId !== translationRowId(row)
          ) {
            return null;
          }
          return (
            <GridInlineSaveCancelActions
              onSave={p.onInlineSave}
              onCancel={p.onInlineCancel}
              saveLoading={p.inlineSaveLoading}
              saveDisabled={false}
              saveTitle={t("SAVE_CHANGES")}
              saveAriaLabel={t("SAVE_CHANGES")}
              cancelTitle={t("CANCEL_EDIT")}
              cancelAriaLabel={t("CANCEL_EDIT")}
            />
          );
        },
      },
    ];
  }, [
    t,
    displayLocale,
    languages,
    englishColumnLocale,
    p.colFilterCode,
    p.setColFilterCode,
    p.colFilterEnglish,
    p.setColFilterEnglish,
    p.onSortCode,
    p.codeSortIcon,
    p.canUpdate,
    p.editingRowId,
    p.inlineTranslations,
    p.setInlineTranslation,
    p.inlineInputRefs,
    p.inlineSaveLoading,
    p.onStartInlineEdit,
    p.onInlineSave,
    p.onInlineCancel,
  ]);
}

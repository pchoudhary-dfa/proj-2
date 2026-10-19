"use client";

import { SearchInputBar } from "@/components/SearchInputBar";
import { useCore } from "@/contexts/CoreContext";
import { RefObject } from "react";
import { SystemLanguageRow, systemLanguageRowLabel } from "@/lib/api/core";
import { TranslationRow } from "./Translations";
import { textFieldClassName } from "@/components/TextField";
import { GridInlineSaveCancelActions } from "@/components/GridInlineSaveCancelActions";
import type { GridSortIcon } from "@/components/TableView";

type propsTypes = {
  colFilterCode: string;
  setColFilterCode: (value: string) => void;
  onSortCode: () => void;
  codeSortIcon: GridSortIcon;
  languages: SystemLanguageRow[];
  colFilterEnglish: string;
  setColFilterEnglish: (value: string) => void;
  onStartInlineEdit: (row: TranslationRow) => void;
  editingRowId: string | null;
  inlineTranslations: Record<string, string>;
  setInlineTranslation: (locale: string, value: string) => void;
  onInlineCancel: () => void;
  onInlineSave: () => void;
  inlineSaveLoading: boolean;
  inlineInputRefs: RefObject<Map<string, HTMLInputElement>>;
};

export function useTranslationGridColumns(props: propsTypes) {
  const { t, locale: appLocale } = useCore();
  const { colFilterCode, setColFilterCode, onSortCode, codeSortIcon, languages, colFilterEnglish, setColFilterEnglish, onStartInlineEdit, editingRowId, inlineTranslations, setInlineTranslation, onInlineCancel, onInlineSave, inlineSaveLoading, inlineInputRefs } = props;

  const englishColumnLocale = () => {
    const row = languages.find(l => l.locale === "en");
    return row?.locale;
  };

  const filterCell = (value: string, onChange: (value: string) => void) => (
    <SearchInputBar
      embedded
      placeholder={t("SEARCH_PLACEHOLDER", "Search...")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by code"
    />
  );

  const langCols = languages.map((lang) => {
    const langLocale = lang.locale;
    const label = systemLanguageRowLabel(lang, appLocale);
    const isEnglishCol = englishColumnLocale() === langLocale;
    return {
      id: `lang_${langLocale}`,
      className: "th-search-cell min-w-[160px] w-[200px] bg-surface-muted align-top",
      cellClassName: "min-w-[160px] w-[200px]",
      header: label,
      filterCell: isEnglishCol ? filterCell(colFilterEnglish, setColFilterEnglish) : null,
      onCellDoubleClick: (row: TranslationRow) => onStartInlineEdit(row),
      cell: (row: TranslationRow) => {
        const isEditing = editingRowId === row.code;
        if (isEditing) {
          return (
            <input
              type="text"
              className={textFieldClassName("sm", "min-w-0 w-full")}
              value={inlineTranslations[langLocale] ?? ""}
              onChange={(e) =>
                setInlineTranslation(langLocale, e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onInlineCancel();
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onInlineSave();
                }
              }}
              disabled={inlineSaveLoading}
              ref={(el) => {
                if (el) inlineInputRefs.current?.set(langLocale, el);
                else inlineInputRefs.current?.delete(langLocale);
              }}
              aria-label={label}
            />
          );
        }
        const text = row.translations[langLocale] ?? "";
        return (
          <span className="block truncate text-xs" title={text || undefined}>
            {text || <span className="text-text-muted">—</span>}
          </span>
        );
      },
    };
  });

  return [
    {
      id: "code",
      className: "sticky left-0 z-50 w-[220px] min-w-[180px] border-r border-border bg-surface-muted align-top",
      cellClassName: "sticky left-0 z-20 w-[220px] min-w-[180px] border-r border-border bg-surface",
      header: {
        kind: "sort" as const,
        text: t("TRANSLATION_CODE"),
        onSort: onSortCode,
        sortIcon: codeSortIcon,
        sortAriaLabel: t("SORT_BY_CODE"),
      },
      filterCell: filterCell(colFilterCode, setColFilterCode),
      onCellDoubleClick: (row: TranslationRow) => onStartInlineEdit(row),
      cell: (row: TranslationRow) => (
        <span className="block truncate font-mono text-xs font-medium" title={row.code}>
          {row.code}
        </span>
      ),
    },
    ...langCols,
    {
      id: "inlineActions",
      header: { kind: "sr-only" as const, text: t("ACTIONS") },
      className: "w-[72px] min-w-[72px] bg-surface-muted align-top",
      cellClassName: "w-[72px] min-w-[72px]",
      cell: (row: TranslationRow) => {
        const isEditing = editingRowId === row.code;
        if (isEditing) {
          return (
            <GridInlineSaveCancelActions
              onSave={() => void onInlineSave()}
              onCancel={onInlineCancel}
              saveLoading={inlineSaveLoading}
              saveDisabled={false}
              saveTitle={t("SAVE_CHANGES", "Save")}
              saveAriaLabel={t("SAVE_CHANGES", "Save")}
              cancelTitle={t("CANCEL_EDIT", "Cancel")}
              cancelAriaLabel={t("CANCEL_EDIT", "Cancel")}
            />
          );
        }
        return null;
      },
    },
  ];
}
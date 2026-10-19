import type { TranslationRow } from "@/lib/translations/mockData";

export type TranslationFormValues = {
  code: string;
  texts: Record<string, string>;
};

export const EMPTY_TRANSLATION_FORM: TranslationFormValues = {
  code: "",
  texts: {},
};

export function rowToFormValues(
  row: TranslationRow,
  sourceLocale: string,
): TranslationFormValues {
  return {
    code: row.code,
    texts: {
      [sourceLocale]: row.sourceText,
      ...row.targets,
    },
  };
}

export function formValuesToRow(
  values: TranslationFormValues,
  sourceLocale: string,
  existingId?: string | null,
): TranslationRow {
  const code = values.code.trim().toUpperCase().replace(/\s+/g, "_");
  const sourceText = values.texts[sourceLocale]?.trim() ?? "";
  const targets: Record<string, string> = {};

  for (const [locale, text] of Object.entries(values.texts)) {
    if (locale.toLowerCase() === sourceLocale.toLowerCase()) continue;
    const trimmed = text.trim();
    if (trimmed) targets[locale] = trimmed;
  }

  return {
    id: existingId ?? code,
    code,
    sourceText,
    targets,
  };
}

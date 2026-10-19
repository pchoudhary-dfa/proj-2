/** Distinct non-empty string values from grid rows for ghost autocomplete (NIS.Cost-style). */
export function collectGridSuggestions<T>(
  rows: readonly T[],
  getValue: (row: T) => string | null | undefined
): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const v = (getValue(row) ?? "").trim();
    if (v) values.add(v);
  }
  return Array.from(values).sort();
}

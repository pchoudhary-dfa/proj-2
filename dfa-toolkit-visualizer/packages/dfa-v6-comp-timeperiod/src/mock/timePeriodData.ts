export type TimePeriodItem = { id: string | number; label: string };

/** Years from 1977 to 2026 (oldest first). */
const YEARS = Array.from({ length: 2026 - 1977 + 1 }, (_, i) => 1977 + i);

export const DEFAULT_TIME_PERIOD_YEARS: TimePeriodItem[] = YEARS.map((y) => ({
  id: String(y),
  label: String(y),
}));

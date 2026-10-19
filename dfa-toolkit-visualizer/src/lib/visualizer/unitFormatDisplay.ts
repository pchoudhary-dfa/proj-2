/**
 * App-level unit format display — simple re-export from engine for now.
 * Can be extended with app-specific logic (e.g. loading formatting_enabled from app-config) in the future.
 */

import { formatValueByUnitFormatCode as engineFormatValue } from 'dfa-v6-comp-visualization';

// Re-export for convenience
export { formatValueByUnitFormatCode } from 'dfa-v6-comp-visualization';

/**
 * Resolve display value with unit format support.
 * Mirrors the logic from the engine's resolveFormattedValue for use in app-level UI.
 */
export function resolveUnitDisplayValue(
  value: number,
  options: {
    unitFormatCode?: string | null;
    preFormatted?: string | null;
    useUnitDefault?: boolean;
    vizNumberFormat?: string;
  }
): string {
  const { unitFormatCode, preFormatted, useUnitDefault = false, vizNumberFormat = '1,000[.00]' } = options;
  
  if (useUnitDefault) {
    if (unitFormatCode) {
      return engineFormatValue(value, unitFormatCode);
    }
    if (preFormatted) {
      return preFormatted;
    }
  }
  
  // Fall back to legacy viz number format
  const f = vizNumberFormat || '1,000[.00]';
  switch (f) {
    case '1,000[.00]':
      return value % 1 === 0
        ? value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case '1000.00':
      return value.toFixed(2);
    case '1,000.00':
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case '1000':
      return Math.round(value).toString();
    case '1,000':
      return Math.round(value).toLocaleString('en-US');
    case '1.00K':
      if (Math.abs(value) >= 1000000) {
        return (value / 1000000).toFixed(2) + 'M';
      } else if (Math.abs(value) >= 1000) {
        return (value / 1000).toFixed(2) + 'K';
      }
      return value.toFixed(2);
    case '1K':
      if (Math.abs(value) >= 1000000) {
        return Math.round(value / 1000000) + 'M';
      } else if (Math.abs(value) >= 1000) {
        return Math.round(value / 1000) + 'K';
      }
      return Math.round(value).toString();
    default:
      return value.toFixed(2);
  }
}

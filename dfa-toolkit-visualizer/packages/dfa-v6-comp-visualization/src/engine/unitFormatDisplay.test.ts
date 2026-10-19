import { describe, it, expect } from 'vitest';
import { formatValueByUnitFormatCode } from './unitFormatDisplay';

describe('formatValueByUnitFormatCode', () => {
  describe('COMPACT format', () => {
    it('should format values >= 1000 with K suffix', () => {
      expect(formatValueByUnitFormatCode(1200, 'COMPACT')).toBe('1.2K');
      expect(formatValueByUnitFormatCode(5400, 'COMPACT')).toBe('5.4K');
      expect(formatValueByUnitFormatCode(999, 'COMPACT')).toBe('999.0');
    });

    it('should format values >= 1M with M suffix', () => {
      expect(formatValueByUnitFormatCode(3400000, 'COMPACT')).toBe('3.4M');
      expect(formatValueByUnitFormatCode(12500000, 'COMPACT')).toBe('12.5M');
    });

    it('should format values >= 1B with B suffix', () => {
      expect(formatValueByUnitFormatCode(1200000000, 'COMPACT')).toBe('1.2B');
      expect(formatValueByUnitFormatCode(5600000000, 'COMPACT')).toBe('5.6B');
    });

    it('should format values >= 1T with T suffix', () => {
      expect(formatValueByUnitFormatCode(2300000000000, 'COMPACT')).toBe('2.3T');
    });

    it('should handle negative values', () => {
      expect(formatValueByUnitFormatCode(-1200, 'COMPACT')).toBe('-1.2K');
      expect(formatValueByUnitFormatCode(-3400000, 'COMPACT')).toBe('-3.4M');
    });
  });

  describe('INTEGER format', () => {
    it('should format as grouped integer', () => {
      expect(formatValueByUnitFormatCode(1234.56, 'INTEGER')).toBe('1,234');
      expect(formatValueByUnitFormatCode(1000000, 'INTEGER')).toBe('1,000,000');
    });
  });

  describe('DECIMAL format', () => {
    it('should format with 2 decimal places and grouping', () => {
      expect(formatValueByUnitFormatCode(1234.5, 'DECIMAL')).toBe('1,234.50');
      expect(formatValueByUnitFormatCode(1234.567, 'DECIMAL')).toBe('1,234.57');
    });
  });

  describe('PERCENTAGE format', () => {
    it('should format as percentage without grouping', () => {
      expect(formatValueByUnitFormatCode(25, 'PERCENTAGE')).toBe('25%');
      expect(formatValueByUnitFormatCode(99.5, 'PERCENTAGE')).toBe('100%');
    });
  });

  describe('SCIENTIFIC format', () => {
    it('should format in scientific notation', () => {
      expect(formatValueByUnitFormatCode(123400, 'SCIENTIFIC')).toBe('1.23E+05');
      expect(formatValueByUnitFormatCode(0.00123, 'SCIENTIFIC')).toBe('1.23E-03');
    });
  });

  describe('Currency formats', () => {
    it('should format USD', () => {
      expect(formatValueByUnitFormatCode(1234, 'USD')).toBe('$1,234.00');
      expect(formatValueByUnitFormatCode(1000000, 'USD')).toBe('$1,000,000.00');
    });

    it('should format INR', () => {
      expect(formatValueByUnitFormatCode(1234, 'INR')).toBe('₹1,234.00');
    });

    it('should format EUR', () => {
      expect(formatValueByUnitFormatCode(1234, 'EUR')).toBe('€1,234.00');
    });

    it('should format AED', () => {
      expect(formatValueByUnitFormatCode(1234, 'AED')).toBe('د.إ1,234.00');
    });

    it('should format JPY (0 decimal places)', () => {
      expect(formatValueByUnitFormatCode(1234, 'JPY')).toBe('¥1,234');
    });

    it('should format BHD (3 decimal places)', () => {
      expect(formatValueByUnitFormatCode(1234, 'BHD')).toBe('.د.ب1,234.000');
    });
  });

  describe('Unknown formats', () => {
    it('should fallback to grouped decimal for unknown codes', () => {
      expect(formatValueByUnitFormatCode(1234.5, 'UNKNOWN')).toBe('1,234.50');
      expect(formatValueByUnitFormatCode(1234.5, '')).toBe('1,234.50');
    });
  });

  describe('Case insensitivity', () => {
    it('should handle lowercase codes', () => {
      expect(formatValueByUnitFormatCode(1200, 'compact')).toBe('1.2K');
      expect(formatValueByUnitFormatCode(25, 'percentage')).toBe('25%');
      expect(formatValueByUnitFormatCode(1234, 'usd')).toBe('$1,234.00');
    });
  });
});

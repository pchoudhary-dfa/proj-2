type ParsedTimePeriod = {
  year: number;
  rank: number;
  index: number;
  day: number;
  endYear: number;
  endIndex: number;
  endDay: number;
  normalized: string;
};

function toFourDigitYear(startYear: number, shortYear: number): number {
  const centuryBase = Math.floor(startYear / 100) * 100;
  const candidate = centuryBase + shortYear;
  return candidate < startYear ? candidate + 100 : candidate;
}

function parseTimePeriod(value: string): ParsedTimePeriod {
  const text = String(value ?? '').trim();
  const upper = text.toUpperCase();

  // YYYY
  {
    const m = upper.match(/^((?:19|20)\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      return { year: y, rank: 0, index: 0, day: 0, endYear: y, endIndex: 0, endDay: 0, normalized: upper };
    }
  }

  // YYYY-YY or YYYY-YYYY (commonly fiscal year range)
  {
    const m = upper.match(/^((?:19|20)\d{2})\s*-\s*(\d{2}|\d{4})$/);
    if (m) {
      const start = parseInt(m[1], 10);
      const endRaw = parseInt(m[2], 10);
      const end = m[2].length === 2 ? toFourDigitYear(start, endRaw) : endRaw;
      return { year: start, rank: 1, index: 0, day: 0, endYear: end, endIndex: 0, endDay: 0, normalized: upper };
    }
  }

  // Qn.YYYY
  {
    const m = upper.match(/^Q([1-4])\.(\d{4})$/);
    if (m) {
      const q = parseInt(m[1], 10);
      const y = parseInt(m[2], 10);
      return { year: y, rank: 2, index: q, day: 0, endYear: y, endIndex: q, endDay: 0, normalized: upper };
    }
  }

  // Qn.YYYY-Qn.YYYY (sort by start period)
  {
    const m = upper.match(/^Q([1-4])\.(\d{4})\s*-\s*Q([1-4])\.(\d{4})$/);
    if (m) {
      const qStart = parseInt(m[1], 10);
      const yStart = parseInt(m[2], 10);
      const qEnd = parseInt(m[3], 10);
      const yEnd = parseInt(m[4], 10);
      return { year: yStart, rank: 2, index: qStart, day: 0, endYear: yEnd, endIndex: qEnd, endDay: 0, normalized: upper };
    }
  }

  // YYYY.MM-YYYY.MM
  {
    const m = upper.match(/^((?:19|20)\d{2})\.(\d{1,2})\s*-\s*((?:19|20)\d{2})\.(\d{1,2})$/);
    if (m) {
      const startYear = parseInt(m[1], 10);
      const startMonth = parseInt(m[2], 10);
      const endYear = parseInt(m[3], 10);
      const endMonth = parseInt(m[4], 10);
      if (startMonth >= 1 && startMonth <= 12 && endMonth >= 1 && endMonth <= 12) {
        return { year: startYear, rank: 3, index: startMonth, day: 0, endYear, endIndex: endMonth, endDay: 0, normalized: upper };
      }
    }
  }

  // YYYY.MM
  {
    const m = upper.match(/^((?:19|20)\d{2})\.(\d{1,2})$/);
    if (m) {
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      if (month >= 1 && month <= 12) {
        return { year, rank: 3, index: month, day: 0, endYear: year, endIndex: month, endDay: 0, normalized: upper };
      }
    }
  }

  // MM.YYYY (legacy support)
  {
    const m = upper.match(/^(\d{1,2})\.(\d{4})$/);
    if (m) {
      const month = parseInt(m[1], 10);
      const year = parseInt(m[2], 10);
      if (month >= 1 && month <= 12) {
        return { year, rank: 3, index: month, day: 0, endYear: year, endIndex: month, endDay: 0, normalized: upper };
      }
    }
  }

  // YYYY.MM.DD-YYYY.MM.DD
  {
    const m = upper.match(
      /^((?:19|20)\d{2})\.(\d{1,2})\.(\d{1,2})\s*-\s*((?:19|20)\d{2})\.(\d{1,2})\.(\d{1,2})$/
    );
    if (m) {
      const startYear = parseInt(m[1], 10);
      const startMonth = parseInt(m[2], 10);
      const startDay = parseInt(m[3], 10);
      const endYear = parseInt(m[4], 10);
      const endMonth = parseInt(m[5], 10);
      const endDay = parseInt(m[6], 10);
      if (
        startMonth >= 1 && startMonth <= 12 &&
        endMonth >= 1 && endMonth <= 12 &&
        startDay >= 1 && startDay <= 31 &&
        endDay >= 1 && endDay <= 31
      ) {
        return {
          year: startYear,
          rank: 4,
          index: startMonth,
          day: startDay,
          endYear,
          endIndex: endMonth,
          endDay,
          normalized: upper,
        };
      }
    }
  }

  // YYYY.MM.DD
  {
    const m = upper.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
    if (m) {
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      const day = parseInt(m[3], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, rank: 4, index: month, day, endYear: year, endIndex: month, endDay: day, normalized: upper };
      }
    }
  }

  // Fallback: try to extract first year so mixed unknown formats still group chronologically.
  {
    const yearMatch = upper.match(/(?:19|20)\d{2}/);
    const y = yearMatch ? parseInt(yearMatch[0], 10) : Number.MAX_SAFE_INTEGER;
    return { year: y, rank: 9, index: 0, day: 0, endYear: y, endIndex: 0, endDay: 0, normalized: upper };
  }
}

export function compareTimePeriodIds(a: string, b: string): number {
  const pa = parseTimePeriod(a);
  const pb = parseTimePeriod(b);

  if (pa.year !== pb.year) return pa.year - pb.year;
  if (pa.rank !== pb.rank) return pa.rank - pb.rank;
  if (pa.index !== pb.index) return pa.index - pb.index;
  if (pa.day !== pb.day) return pa.day - pb.day;
  if (pa.endYear !== pb.endYear) return pa.endYear - pb.endYear;
  if (pa.endIndex !== pb.endIndex) return pa.endIndex - pb.endIndex;
  if (pa.endDay !== pb.endDay) return pa.endDay - pb.endDay;
  return pa.normalized.localeCompare(pb.normalized, undefined, { numeric: true, sensitivity: 'base' });
}

/** Mock indicator options and category mappings. Replace with real API when backend is ready. */

export const MOCK_INDICATORS: Record<string, unknown>[] = [
  { id: "1", indicator_gid: "1", indicator_name: "GDP Growth Rate", unit_gid: ["PERCENT"] },
  { id: "2", indicator_gid: "2", indicator_name: "GDP Per Capita", unit_gid: ["USD", "PPP"] },
  { id: "3", indicator_gid: "3", indicator_name: "Consumer Price Index (CPI)", unit_gid: ["INDEX"] },
  { id: "4", indicator_gid: "4", indicator_name: "Wholesale Price Index (WPI)", unit_gid: ["INDEX"] },
  { id: "5", indicator_gid: "5", indicator_name: "Unemployment Rate", unit_gid: ["PERCENT"] },
  { id: "6", indicator_gid: "6", indicator_name: "Government Expenditure", unit_gid: ["USD", "INR"] },
  { id: "7", indicator_gid: "7", indicator_name: "Fiscal Deficit", unit_gid: ["PERCENT"] },
  { id: "8", indicator_gid: "8", indicator_name: "Labor Force Participation Rate", unit_gid: ["PERCENT"] },
];

export const MOCK_UNIT_META = {
  "USD": { unit_gid: "USD", unit_name: "US dollars", unit_nid: 1 },
  "PPP": { unit_gid: "PPP", unit_name: "Purchasing power parity", unit_nid: 2 },
  "PERCENT": { unit_gid: "PERCENT", unit_name: "Percent", unit_nid: 3 },
  "INDEX": { unit_gid: "INDEX", unit_name: "Index", unit_nid: 4 },
  "INR": { unit_gid: "INR", unit_name: "Indian Rupees", unit_nid: 5 },
};

export const MOCK_BY_SECTOR: Record<string, string[]> = {
  economic_growth: ["1", "2", "6", "7"],
  public_finance: ["6", "7", "8"],
  labor_market: ["5", "8"],
  trade_commerce: ["1", "2", "3", "4"],
  social_development: ["5", "6", "7", "8"],
};

export const MOCK_BY_THEME: Record<string, string[]> = {
  macroeconomic: ["1", "2", "3", "4"],
  government_finance: ["6", "7"],
  employment_wages: ["5", "8"],
};

export const MOCK_BY_GOAL: Record<string, string[]> = {
  no_poverty: ["1", "2", "5"],
  zero_hunger: ["3", "4"],
  good_health: ["5", "6"],
  quality_education: ["7", "8"],
};

export const SECTOR_OPTIONS: { id: string; label: string }[] = [
  { id: "economic_growth", label: "Economic Growth" },
  { id: "public_finance", label: "Public Finance" },
  { id: "labor_market", label: "Labor Market" },
  { id: "trade_commerce", label: "Trade & Commerce" },
  { id: "social_development", label: "Social Development" },
];

export const THEME_OPTIONS: { id: string; label: string }[] = [
  { id: "macroeconomic", label: "Macroeconomic Indicators" },
  { id: "government_finance", label: "Government Finance" },
  { id: "employment_wages", label: "Employment & Wages" },
];

export const GOAL_OPTIONS: { id: string; label: string }[] = [
  { id: "no_poverty", label: "No Poverty" },
  { id: "zero_hunger", label: "Zero Hunger" },
  { id: "good_health", label: "Good Health and Well-being" },
  { id: "quality_education", label: "Quality Education" },
];

export type FetchParams = {
  search?: string;
  sector?: string;
  theme?: string;
  goal?: string;
};

/** Simulate async fetch; returns envelope matching real API with meta.unit. */
export function fetchMockIndicators(params: FetchParams): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      let items = [...MOCK_INDICATORS];
      const { search, sector, theme, goal } = params;

      if (sector && MOCK_BY_SECTOR[sector]) {
        const ids = new Set(MOCK_BY_SECTOR[sector]);
        items = items.filter((it) => ids.has(String(it.id)));
      }
      if (theme && MOCK_BY_THEME[theme]) {
        const ids = new Set(MOCK_BY_THEME[theme]);
        items = items.filter((it) => ids.has(String(it.id)));
      }
      if (goal && MOCK_BY_GOAL[goal]) {
        const ids = new Set(MOCK_BY_GOAL[goal]);
        items = items.filter((it) => ids.has(String(it.id)));
      }
      if (search?.trim()) {
        const q = search.trim().toLowerCase();
        items = items.filter((it) => 
          (it.indicator_name as string).toLowerCase().includes(q)
        );
      }
      resolve(items);
    }, 150);
  });
}

import type {
  FooterSectionConfig,
  HeaderSectionConfig,
  LogoSlotConfig,
  TextBlockConfig,
} from "@/lib/headerFooter/configTypes";

const DEFAULT_BRAND = "#8B1538";
const DEFAULT_TEXT = "#ffffff";

export function createDefaultTextBlock(
  overrides: Partial<TextBlockConfig> = {},
): TextBlockConfig {
  return {
    text: "",
    fontFamily: "",
    color: DEFAULT_TEXT,
    fontSize: 18,
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    ...overrides,
  };
}

export function createDefaultLogoSlot(
  overrides: Partial<LogoSlotConfig> = {},
): LogoSlotConfig {
  return {
    logoId: "",
    width: 48,
    height: 48,
    ...overrides,
  };
}

export const DEFAULT_HEADER_CONFIG: HeaderSectionConfig = {
  backgroundColor: DEFAULT_BRAND,
  height: 70,
  borderBottom: 2,
  borderBottomColor: DEFAULT_BRAND,
  gapBottom: null,
  logo1: createDefaultLogoSlot(),
  logo2: createDefaultLogoSlot(),
  title1Part1: createDefaultTextBlock({
    fontSize: 18,
    underline: true,
  }),
  title1Part2: createDefaultTextBlock({ fontSize: 18 }),
  title2: createDefaultTextBlock({ fontSize: 11 }),
  languageSelectorEnabled: true,
  browserIconId: "",
};

export const DEFAULT_FOOTER_CONFIG: FooterSectionConfig = {
  backgroundColor: DEFAULT_BRAND,
  height: 30,
  borderTop: 2,
  borderTopColor: DEFAULT_BRAND,
  logo1: createDefaultLogoSlot({ width: 25, height: 25 }),
  logo2: createDefaultLogoSlot({ width: 25, height: 25 }),
  caption1: createDefaultTextBlock({fontSize:14}),
  caption2: createDefaultTextBlock({fontSize:14}),
  captionsInline: false,
  fixedAtBottom: false,
};

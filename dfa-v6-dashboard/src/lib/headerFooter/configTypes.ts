export type TextAlign = "left" | "center" | "right";

export type TextBlockConfig = {
  text: string;
  fontFamily: string;
  color: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
};

export type LogoSlotConfig = {
  logoId: string;
  width: number;
  height: number;
};

export type HeaderSectionConfig = {
  backgroundColor: string;
  height: number;
  borderBottom: number;
  borderBottomColor: string;
  gapBottom: number | null;
  logo1: LogoSlotConfig;
  logo2: LogoSlotConfig;
  title1Part1: TextBlockConfig;
  title1Part2: TextBlockConfig;
  title2: TextBlockConfig;
  languageSelectorEnabled: boolean;
  browserIconId: string;
};

export type FooterSectionConfig = {
  backgroundColor: string;
  height: number;
  borderTop: number;
  borderTopColor: string;
  logo1: LogoSlotConfig;
  logo2: LogoSlotConfig;
  caption1: TextBlockConfig;
  caption2: TextBlockConfig;
  captionsInline: boolean;
  fixedAtBottom: boolean;
};

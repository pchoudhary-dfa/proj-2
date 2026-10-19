import { logoSrcForId } from "@/lib/headerFooter/constants";
import type {
  FooterSectionConfig,
  HeaderSectionConfig,
  LogoSlotConfig,
  TextBlockConfig,
} from "@/lib/headerFooter/configTypes";

export type GenerateHtmlOptions = {
  /** Omits runtime-only styles (e.g. position:fixed) for in-drawer preview. */
  forPreview?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textBlockStyle(block: TextBlockConfig): string {
  const styles = [
    `color:${block.color}`,
    `font-size:${block.fontSize}px`,
    `font-family:${block.fontFamily || "inherit"}`,
    `text-align:${block.align}`,
    block.bold ? "font-weight:700" : "font-weight:400",
    block.italic ? "font-style:italic" : "font-style:normal",
    block.underline ? "text-decoration:underline" : "text-decoration:none",
    "margin:0",
    "line-height:1.2",
  ];
  return styles.join(";");
}

function renderTextBlock(block: TextBlockConfig, tag: string): string {
  if (!block.text.trim()) return "";
  const style = textBlockStyle(block);
  return `<${tag} style="${style}">${escapeHtml(block.text)}</${tag}>`;
}

function renderLogo(slot: LogoSlotConfig): string {
  const src = logoSrcForId(slot.logoId);
  if (!src) return "";
  return `<img src="${escapeHtml(src)}" alt="" width="${slot.width}" height="${slot.height}" style="display:block;object-fit:contain;" />`;
}

export function generateHeaderHtml(config: HeaderSectionConfig): string {
  const gap =
    config.gapBottom != null && config.gapBottom > 0
      ? `margin-bottom:${config.gapBottom}px;`
      : "";

  const headerStyle = [
    `background-color:${config.backgroundColor}`,
    `min-height:${config.height}px`,
    `height:${config.height}px`,
    `border-bottom:${config.borderBottom}px solid ${config.borderBottomColor}`,
    gap,
    "display:flex",
    "align-items:center",
    "box-sizing:border-box",
    "padding:0 16px",
    "gap:12px",
    "width:100%",
  ].join(";");

  const logo1 = renderLogo(config.logo1);
  const logo2 = renderLogo(config.logo2);

  const titles = [
    renderTextBlock(config.title1Part1, "span"),
    renderTextBlock(config.title1Part2, "span"),
  ]
  .filter(Boolean)
  .join("");
  
  const subTitles = [
    renderTextBlock(config.title2, "p"),
  ]
  .filter(Boolean)
  .join("");

  const titleGroup = titles
    ? `<div style="display:flex;flex-direction:row;gap:2px;flex:1;min-width:0;">${titles}</div>`
    : "";

  const subTitle = subTitles
    ? `<div style="display:flex;flex-direction:row;gap:2px;flex:1;min-width:0;">${subTitles}</div>`:"";

  const languageSelector = config.languageSelectorEnabled
    ? `<div data-hf-language-selector="true" style="margin-left:auto;min-width:80px;"></div>`
    : "";

  const favicon = config.browserIconId
    ? `<link rel="icon" href="${escapeHtml(logoSrcForId(config.browserIconId))}" data-hf-browser-icon="true" />`
    : "";

  return `${favicon}<header id="dashboard-header" style="${headerStyle}"><div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">${logo1}</div><div style="display:flex;flex-direction:column;flex:1;">${titleGroup}${subTitle}${languageSelector}</div><div">${logo2}</div></header>`;
}

export function generateFooterHtml(
  config: FooterSectionConfig,
  options?: GenerateHtmlOptions,
): string {
  const position =
    !options?.forPreview && config.fixedAtBottom
      ? "position:fixed;left:0;right:0;bottom:0;z-index:100;"
      : "";

  const layout = config.captionsInline ? "flex-direction:row;" : "flex-direction:column;";

  const footerStyle = [
    `background-color:${config.backgroundColor}`,
    `min-height:${config.height}px`,
    `height:${config.height}px`,
    `border-top:${config.borderTop}px solid ${config.borderTopColor}`,
    "display:flex",
    "align-items:center",
    "box-sizing:border-box",
    "padding:0 16px",
    "gap:12px",
    "width:100%",
    "flex-direction:row",
    position,
  ].join(";");

  const logo1 = renderLogo(config.logo1)
  const logo2 = renderLogo(config.logo2)

  const caption1 = renderTextBlock(config.caption1,'span');
  const caption2 = renderTextBlock(config.caption2,'span');


  const dataAttrs = [
    config.captionsInline ? 'data-hf-captions-inline="true"' : "",
    config.fixedAtBottom ? 'data-hf-fixed-bottom="true"' : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<footer id="dashboard-footer" ${dataAttrs} style="${footerStyle}"><div style="display:flex;align-items:center;">${logo1}</div><div style="display:flex;${layout}flex:1;"><div style="flex:1;">${caption1}</div><div style="flex:1;">${caption2}</div></div><div">${logo2}</div></footer>`;
}

export function generateHeaderFooterHtml(
  header: HeaderSectionConfig,
  footer: FooterSectionConfig,
): { headerHTML: string; footerHTML: string } {
  return {
    headerHTML: generateHeaderHtml(header),
    footerHTML: generateFooterHtml(footer),
  };
}

import type {
  FooterSectionConfig,
  HeaderSectionConfig,
} from "@/lib/headerFooter/configTypes";
import {
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_HEADER_CONFIG,
} from "@/lib/headerFooter/defaults";
import { generateHeaderFooterHtml } from "@/lib/headerFooter/generateHtml";

export type { FooterSectionConfig, HeaderSectionConfig } from "@/lib/headerFooter/configTypes";

export type HeaderFooterFormValues = {
  theme: string;
  header: HeaderSectionConfig;
  footer: FooterSectionConfig;
};

export type HeaderFooterListRow = {
  id: string;
  theme: string;
  createdOn: string;
  modifiedOn: string;
  header: HeaderSectionConfig;
  footer: FooterSectionConfig;
  headerHTML: string;
  footerHTML: string;
};

export const EMPTY_HEADER_FOOTER_FORM: HeaderFooterFormValues = {
  theme: "",
  header: { ...DEFAULT_HEADER_CONFIG },
  footer: { ...DEFAULT_FOOTER_CONFIG },
};

export function rowToFormValues(row: HeaderFooterListRow): HeaderFooterFormValues {
  return {
    theme: row.theme,
    header: structuredClone(row.header),
    footer: structuredClone(row.footer),
  };
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formValuesToRow(
  values: HeaderFooterFormValues,
  existing: HeaderFooterListRow | null,
): HeaderFooterListRow {
  const now = new Date();
  const stamp = formatTimestamp(now);
  const id = existing?.id ?? String(Date.now());
  const { headerHTML, footerHTML } = generateHeaderFooterHtml(
    values.header,
    values.footer,
  );

  return {
    id,
    theme: values.theme.trim(),
    createdOn: existing?.createdOn ?? stamp,
    modifiedOn: stamp,
    header: { ...values.header },
    footer: { ...values.footer },
    headerHTML,
    footerHTML,
  };
}

export function duplicateRow(row: HeaderFooterListRow): HeaderFooterListRow {
  const now = new Date();
  const stamp = formatTimestamp(now);
  const { headerHTML, footerHTML } = generateHeaderFooterHtml(row.header, row.footer);

  return {
    id: String(Date.now()),
    theme: `${row.theme} (Copy)`,
    createdOn: stamp,
    modifiedOn: stamp,
    header: { ...row.header },
    footer: { ...row.footer },
    headerHTML,
    footerHTML,
  };
}

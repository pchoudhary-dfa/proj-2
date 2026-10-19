"use client";

import {
  generateFooterHtml,
  generateHeaderHtml,
} from "@/lib/headerFooter/generateHtml";
import type {
  FooterSectionConfig,
  HeaderSectionConfig,
} from "@/lib/headerFooter/configTypes";

type HeaderFooterPreviewProps = {
  header: HeaderSectionConfig;
  footer: FooterSectionConfig;
};

export default function HeaderFooterPreview({
  header,
  footer,
}: HeaderFooterPreviewProps) {
  const headerHtml = generateHeaderHtml(header);
  const footerHtml = generateFooterHtml(footer, { forPreview: true });

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Preview
      </h3>
      <div className="overflow-hidden rounded-md border border-border bg-surface-muted">
        <div
          className="min-w-0 [&_header]:w-full [&_footer]:w-full"
          dangerouslySetInnerHTML={{ __html: headerHtml }}
        />
        <div
          className="flex min-h-[120px] items-center justify-center border-y border-dashed border-border bg-surface px-4 py-8 text-center text-xs text-text-muted"
          aria-hidden
        >
          Dashboard content area
        </div>
        <div
          className="min-w-0 [&_footer]:w-full"
          dangerouslySetInnerHTML={{ __html: footerHtml }}
        />
      </div>
    </section>
  );
}

import { redirect } from "next/navigation";

/**
 * Public share/embed URL: /[locale]/visualize?indicator=...&filters=...
 * Redirects to the canonical visualizer route so one page handles both.
 */
export default async function VisualizePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, v));
    } else {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  redirect(`/${locale}/visualizer${qs ? `?${qs}` : ""}`);
}

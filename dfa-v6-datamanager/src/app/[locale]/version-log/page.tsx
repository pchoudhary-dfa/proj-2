import { getTranslationsFallback } from "@/lib/i18n/translations";
import { parseChangelogFile } from "./changelog";
import Breadcrumb from "@/components/Breadcrumb";
import { AppShellUtilityPageToolbar } from "@/components/AppShellUtilityPageToolbar";

export default async function VersionLogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = getTranslationsFallback(locale);
  const { versions } = await parseChangelogFile();

  const title = t["CHANGELOG"] ?? "Changelog";
  const description = t["CHANGELOG_DESCRIPTION"] ?? "";

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      <Breadcrumb />
      <AppShellUtilityPageToolbar />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto overflow-x-hidden px-5 py-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          {title}
        </p>
        {description ? (
          <p className="mb-6 text-xs leading-relaxed text-text">{description}</p>
        ) : null}
        <div className="flex flex-col gap-4">
          {versions.map((v) => (
            <article
              key={v.version}
              className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-4 shadow-sm"
            >
              <h2 className="mb-3 border-b border-border pb-2 text-xs font-bold tracking-tight text-text">
                {v.version}
              </h2>
              {v.bullets.length > 0 ? (
                <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-text">
                  {v.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-muted">No entries for this version.</p>
              )}
            </article>
          ))}
        </div>
        {versions.length === 0 ? (
          <p className="text-xs text-text-muted">No changelog entries yet.</p>
        ) : null}
      </div>
    </main>
  );
}

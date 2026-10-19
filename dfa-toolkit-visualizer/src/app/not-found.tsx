import { cookies } from "next/headers";
import { defaultLocale, isLocale } from "@/lib/i18n/config";
import { getTranslationsFallback } from "@/lib/i18n/translations";

export default async function NotFound() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const lang =
    cookieLocale && isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const tr = getTranslationsFallback(lang);

  return (
    <div className="not-found-content">
      <h1>{tr.NOT_FOUND_TITLE ?? "Not found"}</h1>
      <p>{tr.NOT_FOUND_DESCRIPTION ?? "The page you're looking for doesn't exist."}</p>
    </div>
  );
}

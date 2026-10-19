import { resolveDefaultAppLocale } from "@/lib/api/core";
import { getAuthCookieName, getRefreshCookieName } from "@/lib/auth/cookie";
import { buildLocaleAppPath } from "@/lib/constants";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * `/` — redirect to `/{defaultLocale}` from app-config (LANGUAGE_DEFAULT),
 * or `/{defaultLocale}/datawarehouse` when already authenticated.
 */
export default async function RootPage() {
  const locale = await resolveDefaultAppLocale();
  const cookieStore = await cookies();
  const token =
    cookieStore.get(getAuthCookieName())?.value ||
    cookieStore.get(getRefreshCookieName())?.value;
  if (token) {
    redirect(buildLocaleAppPath(locale, "datawarehouse"));
  }
  redirect(`/${locale}`);
}

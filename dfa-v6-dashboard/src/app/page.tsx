import { getAuthCookieName, getRefreshCookieName } from "@/lib/auth/cookie";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveDefaultAppLocale } from "@/lib/api/core";
import { buildLocaleAppPath } from "@/lib/constants";

export default async function Home() {
  const locale = await resolveDefaultAppLocale();
  const cookieStore = await cookies();
  const token =
    cookieStore.get(getAuthCookieName())?.value ||
    cookieStore.get(getRefreshCookieName())?.value;

  if (token) {
    redirect(buildLocaleAppPath(locale,"dashboard"));
  }
  redirect(`/${locale}`)

}

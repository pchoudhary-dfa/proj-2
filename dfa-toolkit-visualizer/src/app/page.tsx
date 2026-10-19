import { redirect } from "next/navigation";
import { defaultLocale } from "@/lib/i18n/config";

/**
 * Root path has no locale segment; redirect to default locale so we never 404 at /.
 * This runs when middleware does not redirect (e.g. src-based projects).
 */
export default function RootPage() {
  redirect(`/${defaultLocale}/`);
}

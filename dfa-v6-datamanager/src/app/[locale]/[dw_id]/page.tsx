import { buildLocaleAppPath } from "@/lib/constants";
import { redirect } from "next/navigation";

type DwLandingPageProps = {
  params: Promise<{ locale: string; dw_id: string }>;
};

export default async function DwLandingPage({ params }: DwLandingPageProps) {
  const { locale, dw_id: dwId } = await params;
  redirect(buildLocaleAppPath(locale, "overview", dwId));
}

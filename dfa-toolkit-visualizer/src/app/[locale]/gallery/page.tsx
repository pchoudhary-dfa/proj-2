import { GalleryPage } from "@/components/gallery/GalleryPage";

export default async function GalleryRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <GalleryPage locale={locale} />;
}

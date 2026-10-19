import type { GalleryItem } from "@/lib/gallery/types";

/**
 * Build the visualizer URL for a gallery item.
 * Uses only ?gid={id} -- the visualizer fetches the full item by ID and hydrates from it.
 */
export function buildVisualizerUrl(item: GalleryItem, locale: string): string {
  return `/${locale}/visualizer?gid=${encodeURIComponent(item.id)}`;
}

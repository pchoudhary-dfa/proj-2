import type { DwSourceListItem } from "@/lib/api/sources";
import {
  normalizeSourcePublisher,
  rowPublisher,
  rowTitle,
} from "@/lib/api/sources";

export { normalizeSourcePublisher } from "@/lib/api/sources";

export type SourcePublisherTitleIndex = {
  /** Distinct publisher labels (normalized), sorted. */
  publishers: string[];
  /** Titles known for each normalized publisher (from sources + optional process pairs). */
  titlesByPublisher: Map<string, string[]>;
  /** Distinct titles across all rows (for empty-publisher picker). */
  allTitles: string[];
};

/**
 * Build publisher → title lists from API source rows plus optional (publisher,title) pairs
 * from compute processes (so legacy filter strings still appear until a source exists).
 */
export function buildSourcePublisherTitleIndex(
  sourceRows: DwSourceListItem[],
  extraPairs: Array<{ publisher: string; title: string }>
): SourcePublisherTitleIndex {
  const map = new Map<string, Set<string>>();

  function add(pubRaw: string, titleRaw: string) {
    const tit = titleRaw.trim();
    if (!tit) return;
    const pub = normalizeSourcePublisher(pubRaw);
    if (!map.has(pub)) map.set(pub, new Set());
    map.get(pub)!.add(tit);
  }

  for (const r of sourceRows) {
    add(rowPublisher(r), rowTitle(r));
  }
  for (const p of extraPairs) {
    add(p.publisher, p.title);
  }

  const publishers = [...map.keys()].sort((a, b) => a.localeCompare(b));
  const titlesByPublisher = new Map<string, string[]>();
  const allTitleSet = new Set<string>();
  for (const pub of publishers) {
    const list = [...(map.get(pub) ?? [])].sort((a, b) => a.localeCompare(b));
    titlesByPublisher.set(pub, list);
    for (const t of list) allTitleSet.add(t);
  }

  return {
    publishers,
    titlesByPublisher,
    allTitles: [...allTitleSet].sort((a, b) => a.localeCompare(b)),
  };
}

export function titlesForPublisherPick(
  index: SourcePublisherTitleIndex,
  selectedPublisherRaw: string
): string[] {
  const pub = normalizeSourcePublisher(selectedPublisherRaw);
  const direct = index.titlesByPublisher.get(pub);
  if (direct?.length) return direct;
  if (!selectedPublisherRaw.trim()) {
    return index.allTitles;
  }
  return [];
}

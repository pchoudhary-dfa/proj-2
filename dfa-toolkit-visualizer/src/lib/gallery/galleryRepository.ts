/**
 * Gallery repository: list, add, remove, findMatching.
 * Uses backend API (ApiGalleryRepository) by default. LocalGalleryRepository remains available for testing or fallback.
 */

import {
  listGalleryItems,
  getGalleryItem,
  addGalleryItem,
  updateGalleryItem,
  removeGalleryItem,
} from "./galleryApiClient";
import { GALLERY_STORAGE_KEY, type GalleryItem, type GalleryItemAddPayload } from "./types";

export interface GalleryRepository {
  list(): Promise<GalleryItem[]>;
  getById(id: string): Promise<GalleryItem | null>;
  add(payload: GalleryItemAddPayload): Promise<GalleryItem>;
  update(id: string, partial: Partial<GalleryItem>): Promise<void>;
  remove(id: string): Promise<void>;
  findMatching(match: {
    indicatorId: string;
    type: GalleryItem["type"];
  }): Promise<GalleryItem | null>;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export class LocalGalleryRepository implements GalleryRepository {
  private key = GALLERY_STORAGE_KEY;

  async list(): Promise<GalleryItem[]> {
    const raw = getStorage()?.getItem(this.key) ?? "[]";
    try {
      const arr = JSON.parse(raw) as unknown[];
      return Array.isArray(arr) ? (arr as GalleryItem[]) : [];
    } catch {
      return [];
    }
  }

  async add(payload: GalleryItemAddPayload): Promise<GalleryItem> {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const timestamp = Date.now();
    const item: GalleryItem = { ...payload, id, timestamp };
    const items = await this.list();
    items.push(item);
    getStorage()?.setItem(this.key, JSON.stringify(items));
    return item;
  }

  async update(id: string, partial: Partial<GalleryItem>): Promise<void> {
    const items = await this.list();
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) return;
    items[index] = { ...items[index], ...partial };
    getStorage()?.setItem(this.key, JSON.stringify(items));
  }

  async remove(id: string): Promise<void> {
    const items = await this.list();
    const next = items.filter((i) => i.id !== id);
    getStorage()?.setItem(this.key, JSON.stringify(next));
  }

  async getById(id: string): Promise<GalleryItem | null> {
    const items = await this.list();
    return items.find((i) => i.id === id) ?? null;
  }

  async findMatching(match: {
    indicatorId: string;
    type: GalleryItem["type"];
  }): Promise<GalleryItem | null> {
    const items = await this.list();
    return (
      items.find(
        (i) =>
          i.indicator?.id === match.indicatorId && i.type === match.type
      ) ?? null
    );
  }
}

/** Default page size for list() when using the API (no pagination in repository interface). */
const GALLERY_LIST_PAGE_SIZE = 100;

/**
 * ApiGalleryRepository only fetches the full list when list() is called (e.g. on the My Gallery page).
 * findMatching() uses an in-memory cache when available, so the visualizer does not trigger GET /gallery
 * just to show "is bookmarked". Cache is filled by list() and updated by add/update/remove.
 */
export class ApiGalleryRepository implements GalleryRepository {
  private cache: GalleryItem[] | null = null;

  async list(): Promise<GalleryItem[]> {
    const { items } = await listGalleryItems({ page_size: GALLERY_LIST_PAGE_SIZE });
    this.cache = items;
    return items;
  }

  async add(payload: GalleryItemAddPayload): Promise<GalleryItem> {
    const item = await addGalleryItem(payload);
    if (this.cache !== null) {
      this.cache.push(item);
    } else {
      this.cache = [item];
    }
    return item;
  }

  async update(id: string, partial: Partial<GalleryItem>): Promise<void> {
    await updateGalleryItem(id, partial);
    if (this.cache !== null) {
      const idx = this.cache.findIndex((i) => i.id === id);
      if (idx !== -1) this.cache[idx] = { ...this.cache[idx], ...partial };
    }
  }

  async remove(id: string): Promise<void> {
    await removeGalleryItem(id);
    if (this.cache !== null) {
      this.cache = this.cache.filter((i) => i.id !== id);
    }
  }

  async getById(id: string): Promise<GalleryItem | null> {
    try {
      const item = await getGalleryItem(id);
      if (this.cache !== null) {
        const idx = this.cache.findIndex((i) => i.id === id);
        if (idx >= 0) this.cache[idx] = item;
        else this.cache.push(item);
      }
      return item;
    } catch {
      return null;
    }
  }

  async findMatching(match: {
    indicatorId: string;
    type: GalleryItem["type"];
  }): Promise<GalleryItem | null> {
    if (this.cache === null) {
      return null;
    }
    return (
      this.cache.find(
        (i) =>
          i.indicator?.id === match.indicatorId && i.type === match.type
      ) ?? null
    );
  }
}

let defaultRepository: GalleryRepository | null = null;

/** Returns the gallery repository. Uses backend API by default. */
export function getGalleryRepository(): GalleryRepository {
  if (!defaultRepository) {
    defaultRepository = new ApiGalleryRepository();
  }
  return defaultRepository;
}

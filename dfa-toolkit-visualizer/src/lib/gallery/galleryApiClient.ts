/**
 * Client for the Gallery API (GET/POST /gallery, GET/PATCH/DELETE /gallery/{id}).
 * Uses the envelope shape from GALLERY_API.md: success, data, meta (list only), err_message.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { GALLERY_API_URL } from "@/lib/constants";
import type { GalleryItem, GalleryItemAddPayload } from "./types";

/** Success envelope from backend. */
interface GallerySuccessEnvelope<T> {
  success: true;
  message?: string;
  data: T;
  meta?: GalleryListMeta;
}

/** Error envelope from backend. */
interface GalleryErrorEnvelope {
  success: false;
  err_message: string;
  data: null;
  errors?: { code?: string };
}

export interface GalleryListMeta {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface GalleryListParams {
  q?: string;
  type?: "visualization" | "table";
  page?: number;
  page_size?: number;
}

function isSuccessEnvelope<T>(v: unknown): v is GallerySuccessEnvelope<T> {
  return typeof v === "object" && v !== null && (v as { success?: boolean }).success === true;
}

function assertSuccess<T>(raw: unknown): GallerySuccessEnvelope<T> {
  if (isSuccessEnvelope<T>(raw)) return raw;
  const err = raw as GalleryErrorEnvelope;
  const message =
    err && typeof err.err_message === "string" ? err.err_message : "Gallery API error";
  throw new Error(message);
}

/** Map backend response (dw_id: int|null) to frontend shape (dataWarehouseId: string|undefined). */
function mapResponseItem(raw: Record<string, unknown>): GalleryItem {
  const { dw_id, ...rest } = raw;
  return {
    ...rest,
    dataWarehouseId: dw_id != null ? String(dw_id) : undefined,
  } as GalleryItem;
}

/** Map frontend add/update payload (dataWarehouseId: string) to backend shape (dw_id: int). */
function mapOutgoingPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { dataWarehouseId, ...rest } = payload;
  if (dataWarehouseId != null && dataWarehouseId !== "") {
    rest.dw_id = Number(dataWarehouseId);
  }
  return rest;
}

function buildUrl(path = "", params?: Record<string, string | number | undefined>): string {
  const base = GALLERY_API_URL;
  const pathPart = path ? `/${path.replace(/^\//, "")}` : "";
  let url = `${base.replace(/\/$/, "")}${pathPart}`;
  if (params && Object.keys(params).length > 0) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") search.set(k, String(v));
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

/** List gallery items with optional search and pagination. */
export async function listGalleryItems(
  params?: GalleryListParams
): Promise<{ items: GalleryItem[]; meta?: GalleryListMeta }> {
  const searchParams: Record<string, string | number | undefined> = {};
  if (params?.q !== undefined) searchParams.q = params.q;
  if (params?.type !== undefined) searchParams.type = params.type;
  if (params?.page !== undefined) searchParams.page = params.page;
  if (params?.page_size !== undefined) searchParams.page_size = params.page_size;

  const url = buildUrl("", searchParams);
  const result = await apiGet<GallerySuccessEnvelope<GalleryItem[]> | GalleryErrorEnvelope>(url);

  if (!result.ok) {
    throw new Error(result.error ?? result.statusText ?? "Failed to list gallery items");
  }

  const envelope = assertSuccess<Record<string, unknown>[]>(result.data);
  const rawItems = Array.isArray(envelope.data) ? envelope.data : [];
  const items = rawItems.map(mapResponseItem);
  return { items, meta: envelope.meta };
}

/** Get a single gallery item by id. */
export async function getGalleryItem(id: string): Promise<GalleryItem> {
  const url = buildUrl(id);
  const result = await apiGet<GallerySuccessEnvelope<Record<string, unknown>> | GalleryErrorEnvelope>(url);

  if (!result.ok) {
    throw new Error(
      result.error ?? (result.status === 404 ? "Gallery item not found" : result.statusText) ?? "Failed to get gallery item"
    );
  }

  const envelope = assertSuccess<Record<string, unknown>>(result.data);
  return mapResponseItem(envelope.data);
}

/** Create a new gallery item. */
export async function addGalleryItem(payload: GalleryItemAddPayload): Promise<GalleryItem> {
  const url = GALLERY_API_URL.replace(/\/$/, "");
  const body = mapOutgoingPayload(payload as unknown as Record<string, unknown>);
  const result = await apiPost<GallerySuccessEnvelope<Record<string, unknown>> | GalleryErrorEnvelope>(
    url,
    body
  );

  if (!result.ok) {
    throw new Error(result.error ?? result.statusText ?? "Failed to add gallery item");
  }

  const envelope = assertSuccess<Record<string, unknown>>(result.data);
  return mapResponseItem(envelope.data);
}

/** Partially update a gallery item. */
export async function updateGalleryItem(
  id: string,
  partial: Partial<GalleryItem>
): Promise<GalleryItem> {
  const url = buildUrl(id);
  const body = mapOutgoingPayload(partial as unknown as Record<string, unknown>);
  const result = await apiPatch<GallerySuccessEnvelope<Record<string, unknown>> | GalleryErrorEnvelope>(
    url,
    body
  );

  if (!result.ok) {
    throw new Error(
      result.error ?? (result.status === 404 ? "Gallery item not found" : result.statusText) ?? "Failed to update gallery item"
    );
  }

  const envelope = assertSuccess<Record<string, unknown>>(result.data);
  return mapResponseItem(envelope.data);
}

/** Delete a gallery item. */
export async function removeGalleryItem(id: string): Promise<void> {
  const url = buildUrl(id);
  const result = await apiDelete<GallerySuccessEnvelope<{ id: number }> | GalleryErrorEnvelope>(
    url
  );

  if (!result.ok) {
    throw new Error(
      result.error ?? (result.status === 404 ? "Gallery item not found" : result.statusText) ?? "Failed to delete gallery item"
    );
  }
}

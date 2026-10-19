import { getNotificationsApiUrl } from "@/lib/constants";
import { getRequest } from "@/lib/api/http";

export type NotificationItem = {
  id: number;
  event_code: string;
  locale: string;
  title: string;
  body: string;
  ref_entity_type: string | null;
  ref_entity_id: number | null;
  action_url: string | null;
  dw_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created: string;
};

type ApiSuccess<T> = {
  success: true;
  message?: string;
  data: T;
};

type UnreadCountData = {
  count: number;
};

function buildNotificationsUrl(
  path: "" | "/unread-count",
  dwId?: number
): string {
  const base = `${getNotificationsApiUrl()}${path}`;
  if (dwId == null || Number.isNaN(dwId)) return base;
  const params = new URLSearchParams({ dw_id: String(dwId) });
  return `${base}?${params.toString()}`;
}

function parseNotificationItems(raw: unknown): NotificationItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is NotificationItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as NotificationItem).id === "number" &&
      typeof (item as NotificationItem).title === "string"
  );
}

export async function fetchUnreadCount(
  dwId?: number
): Promise<ApiSuccess<UnreadCountData> | null> {
  try {
    const response = (await getRequest(
      buildNotificationsUrl("/unread-count", dwId),
      undefined,
      { suppressErrorMessage: true }
    )) as ApiSuccess<UnreadCountData> & { success?: boolean };

    if (!response?.success || typeof response.data?.count !== "number") {
      return null;
    }

    return {
      success: true,
      message: response.message,
      data: { count: response.data.count },
    };
  } catch {
    return null;
  }
}

export async function fetchNotifications(
  dwId?: number
): Promise<ApiSuccess<NotificationItem[]> | null> {
  try {
    const response = (await getRequest(
      buildNotificationsUrl("", dwId),
      undefined,
      { suppressErrorMessage: true }
    )) as ApiSuccess<unknown> & { success?: boolean };

    if (!response?.success) return null;

    return {
      success: true,
      message: response.message,
      data: parseNotificationItems(response.data),
    };
  } catch {
    return null;
  }
}

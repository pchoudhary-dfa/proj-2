"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Drawer from "@/components/Drawer";
import { Loader } from "@/components/Loader";
import { useCoreOptional } from "@/contexts/CoreContext";
import {
  fetchNotifications,
  fetchUnreadCount,
  type NotificationItem,
} from "@/lib/api/notifications";
import { getTranslationsFallback } from "@/lib/i18n/translations";

const _fb = getTranslationsFallback("en");
const fallbackT = (code: string, fb?: string) => _fb[code] ?? fb ?? code;

type NotificationDrawerProps = {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  loading: boolean;
  onRefresh: () => void;
};

function formatNotificationTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationCard({
  item,
  openLabel,
}: {
  item: NotificationItem;
  openLabel: string;
}) {
  return (
    <article className="card">
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-text">{item.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{item.body}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <time className="text-[11px] text-text-muted" dateTime={item.created}>
            {formatNotificationTime(item.created)}
          </time>
          {item.action_url ? (
            <Link
              href={item.action_url}
              className="btn-comp-ghost--grid-labeled shrink-0 no-underline"
              target={item.action_url.startsWith("http") ? "_blank" : undefined}
              rel={
                item.action_url.startsWith("http")
                  ? "noopener noreferrer"
                  : undefined
              }
            >
              <span className="material-icons !text-sm leading-none" aria-hidden>
                open_in_new
              </span>
              {openLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function NotificationDrawer({
  open,
  onClose,
  notifications,
  loading,
  onRefresh,
}: NotificationDrawerProps) {
  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;
  const refreshLabel = t("REFRESH", "Refresh");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("NOTIFICATIONS", "Notifications")}
      headerActions={
        <button
          type="button"
          className="btn-comp-ghost h-8 w-8 rounded-full text-text-muted hover:text-primary"
          onClick={() => void onRefresh()}
          disabled={loading}
          aria-label={refreshLabel}
          title={refreshLabel}
        >
          <span className="material-icons !text-lg leading-none" aria-hidden>
            refresh
          </span>
        </button>
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4"
    >
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Loader loadingLabel={t("LOADING", "Loading...")} />
        </div>
      ) : notifications.length === 0 ? (
        <p className="py-6 text-sm text-text-muted">
          {t("NOTIFICATION_EMPTY", "No notifications yet.")}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {notifications.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              openLabel={t("OPEN", "Open")}
            />
          ))}
        </div>
      )}
    </Drawer>
  );
}

export type NotificationBellProps = {
  /** Warehouse id when scoped to a data warehouse; omit for app-level (global) inbox. */
  dwId?: string;
  /** Header brand bar vs warehouse toolbar chrome. */
  variant?: "header" | "toolbar";
  className?: string;
};

function parseScopeDwId(dwId?: string): number | undefined {
  if (!dwId?.trim()) return undefined;
  const parsed = Number.parseInt(dwId.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function NotificationBell({
  dwId,
  variant = "toolbar",
  className = "",
}: NotificationBellProps) {
  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;
  const scopeDwId = parseScopeDwId(dwId);

  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    const result = await fetchUnreadCount(scopeDwId);
    if (result?.success) {
      setUnreadCount(result.data.count);
    }
  }, [scopeDwId]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchNotifications(scopeDwId);
      if (result?.success) {
        setNotifications(result.data);
        setUnreadCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [scopeDwId]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  const handleOpen = () => {
    setDrawerOpen(true);
    void loadNotifications();
  };

  const notificationsLabel = t("NOTIFICATIONS", "Notifications");

  const buttonClassName =
    variant === "header"
      ? `app-header__menu-trigger relative shrink-0 ${className}`.trim()
      : `btn-comp-icon-md relative shrink-0 rounded-full ${className}`.trim();

  const iconClassName =
    variant === "header"
      ? "material-icons mui-icon app-header__icon"
      : "material-icons !text-base leading-none text-text-muted";

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={handleOpen}
        aria-label={notificationsLabel}
        title={notificationsLabel}
      >
        <span className={iconClassName} aria-hidden>
          notifications_none
        </span>
        {unreadCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-0.5 text-[10px] font-semibold leading-none text-on-primary"
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={notifications}
        loading={loading}
        onRefresh={loadNotifications}
      />
    </>
  );
}

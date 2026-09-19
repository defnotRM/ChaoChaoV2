"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

interface NotificationItem {
  notification_id: string;
  type: string;
  title: string;
  message: string;
  related_order_id: string | null;
  is_read: boolean;
  created_at: string;
}

function timeAgo(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

export default function NotificationBell({
  userId,
}: {
  userId: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createBrowserClient();
    const uniqueSuffix = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`notif-realtime-${userId}-${uniqueSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchNotifications(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleItemClick(item: NotificationItem) {
    if (!item.is_read) {
      setItems((prev) =>
        prev.map((n) =>
          n.notification_id === item.notification_id
            ? { ...n, is_read: true }
            : n,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch(`/api/notifications/${item.notification_id}/read`, {
        method: "POST",
      }).catch(() => {});
    }
    setOpen(false);
    if (item.related_order_id) {
      router.push(`/orders/${item.related_order_id}`);
    }
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  if (!userId) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex cursor-pointer flex-col items-center gap-0.5 text-slate-600 hover:text-[#1b3554]"
      >
        <Bell aria-hidden="true" className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-bold text-slate-900">
              การแจ้งเตือน
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                ยังไม่มีการแจ้งเตือน
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.notification_id}
                  onClick={() => handleItemClick(n)}
                  className={`flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition hover:bg-slate-50 ${
                    !n.is_read ? "bg-sky-50/60" : ""
                  }`}
                >
                  <span className="flex w-full items-center gap-1.5 text-xs font-bold text-slate-900">
                    {!n.is_read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                    )}
                    {n.title}
                  </span>
                  <span className="text-xs text-slate-500">{n.message}</span>
                  <span className="text-[10px] text-slate-400">
                    {timeAgo(n.created_at)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

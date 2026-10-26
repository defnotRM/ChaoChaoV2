"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  Search,
  Send,
  ArrowLeft,
  X,
  User,
  CheckCheck,
  Check,
  Loader2,
  Lock,
  Package,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useToast, ToastProvider } from "@/components/ui/Toast";
import { ORDER_STATUS_CONFIG } from "@/lib/chat-statuses";

interface Partner {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  status: string;
}

interface ChatOrder {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  itemId: string;
  itemName: string;
  itemImageUrl: string | null;
}

interface ChatRoom {
  id: string;
  orderId: string | null;
  isClosed: boolean;
  myRole: "renter" | "lender";
  lastMessage: string;
  updatedAt: string;
  createdAt: string;
  unreadCount: number;
  partner: Partner;
  order: ChatOrder | null;
}

interface MessageItem {
  id: string;
  roomId: string;
  senderId: string;
  isMe: boolean;
  type: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

function formatChatTime(dateString: string) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (diffInDays === 0) {
    return timeStr;
  } else if (diffInDays === 1) {
    return "เมื่อวาน";
  } else if (diffInDays < 7) {
    const days = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
    return days[date.getDay()];
  }
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
}

function formatMessageGroupDate(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "วันนี้";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "เมื่อวานนี้";
  }
  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatOrderDate(dateString?: string) {
  if (!dateString) return "";
  const d = new Date(dateString);
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/**
 * ผสานรายการข้อความฝั่ง Client แบบไม่ทำข้อความที่เพิ่งส่งหาย (Monotonic Merge)
 */
function mergeClientMessages(
  prevMessages: MessageItem[],
  incomingMessages: MessageItem[],
  roomId: string,
  removedTempIds: Set<string>,
): MessageItem[] {
  const prevForRoom = prevMessages.filter((m) => m.roomId === roomId);
  const confirmedMap = new Map<string, MessageItem>();

  // 1. นำข้อความที่ยืนยันแล้วจาก prevForRoom ตั้งต้นไว้ก่อน (กันกรณี GET ที่เริ่มก่อน POST จะทับข้อความใหม่หาย)
  for (const m of prevForRoom) {
    if (!m.id.startsWith("temp-")) {
      confirmedMap.set(m.id, m);
    }
  }

  // 2. ผสานข้อความที่มาจาก Server (อัปเดตสถานะ isRead และเพิ่มข้อความใหม่)
  for (const m of incomingMessages) {
    const existing = confirmedMap.get(m.id);
    if (existing) {
      confirmedMap.set(m.id, {
        ...existing,
        ...m,
        isRead: Boolean(existing.isRead || m.isRead),
      });
    } else {
      confirmedMap.set(m.id, m);
    }
  }

  const confirmedList = Array.from(confirmedMap.values());

  // 3. เก็บข้อความ Optimistic (temp-*) ที่กำลังส่งอยู่และยังไม่ได้ถูกแทนที่
  const activeOptimistic = prevForRoom.filter((p) => {
    if (!p.id.startsWith("temp-")) return false;
    if (removedTempIds.has(p.id)) return false;

    const alreadyInConfirmed = confirmedList.some(
      (c) =>
        c.isMe &&
        c.content === p.content &&
        Math.abs(
          new Date(c.createdAt).getTime() - new Date(p.createdAt).getTime(),
        ) < 15000,
    );
    return !alreadyInConfirmed;
  });

  return [...confirmedList, ...activeOptimistic].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function ChatContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const targetRoomIdParam = searchParams.get("roomId");
  const targetOrderIdParam = searchParams.get("orderId");

  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
    targetRoomIdParam,
  );
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [sendingCount, setSendingCount] = useState(0);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const roomChannelRef = useRef<any>(null);
  const globalChannelRef = useRef<any>(null);
  const removedTempIdsRef = useRef<Set<string>>(new Set());

  const activeRoom = rooms.find((r) => r.id === selectedRoomId);
  const isSending = sendingCount > 0;

  // โหลด user ปัจจุบัน
  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      if (smooth) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/rooms?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setRooms([]);
        return [];
      }
      if (res.ok) {
        const data = await res.json();
        const incomingRooms: ChatRoom[] = data.rooms || [];
        setRooms((prev) => {
          if (
            prev.length === incomingRooms.length &&
            JSON.stringify(prev) === JSON.stringify(incomingRooms)
          ) {
            return prev;
          }
          return incomingRooms;
        });
        return incomingRooms;
      }
      return [];
    } catch (err) {
      console.error("Error fetching chat rooms:", err);
      return [];
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  // เปิดห้องตาม targetOrderIdParam หรือ targetRoomIdParam
  useEffect(() => {
    let cancelled = false;

    async function initSelection() {
      const loadedRooms = await fetchRooms();
      if (cancelled) return;

      if (targetOrderIdParam) {
        // หาห้องของ orderId นี้
        const match = loadedRooms.find(
          (r: ChatRoom) => r.orderId === targetOrderIdParam,
        );
        if (match) {
          setSelectedRoomId(match.id);
        } else {
          // หากยังไม่มีห้อง ให้สร้างห้องใหม่สำหรับ orderId นี้
          try {
            const res = await fetch("/api/chat/rooms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: targetOrderIdParam }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.roomId) {
                await fetchRooms();
                if (!cancelled) {
                  setSelectedRoomId(data.roomId);
                }
              }
            }
          } catch (createErr) {
            console.error("Error opening chat by orderId:", createErr);
          }
        }
      } else if (targetRoomIdParam) {
        setSelectedRoomId(targetRoomIdParam);
      }
    }

    void initSelection();

    return () => {
      cancelled = true;
    };
  }, [targetRoomIdParam, targetOrderIdParam, fetchRooms]);

  const fetchMessages = useCallback(
    async (roomId: string, silent = false, autoScroll = false) => {
      if (!silent) setIsLoadingMessages(true);
      try {
        const res = await fetch(
          `/api/chat/messages?roomId=${roomId}&t=${Date.now()}`,
          {
            cache: "no-store",
          },
        );
        if (res.ok) {
          const data = await res.json();
          const incomingMessages: MessageItem[] = data.messages || [];

          setMessages((prev) => {
            const merged = mergeClientMessages(
              prev,
              incomingMessages,
              roomId,
              removedTempIdsRef.current,
            );
            if (
              prev.length === merged.length &&
              JSON.stringify(prev) === JSON.stringify(merged)
            ) {
              return prev;
            }
            return merged;
          });

          setRooms((prev) => {
            const target = prev.find((r) => r.id === roomId);
            if (!target || target.unreadCount === 0) return prev;
            return prev.map((r) =>
              r.id === roomId ? { ...r, unreadCount: 0 } : r,
            );
          });

          if (autoScroll) {
            setTimeout(() => scrollToBottom(false), 50);
          }
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      } finally {
        if (!silent) setIsLoadingMessages(false);
      }
    },
    [scrollToBottom],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (selectedRoomId) {
        if (!cancelled) {
          await fetchMessages(selectedRoomId, false, true);
        }
        inputRef.current?.focus();
      } else {
        setMessages([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedRoomId, fetchMessages]);

  useEffect(() => {
    const supabase = createBrowserClient();

    // 1. Channel สำหรับห้องแชทที่กำลังเปิดอยู่ (Broadcast แบบเรียลไทม์ทันที < 50ms)
    let roomChannel: any = null;
    if (selectedRoomId) {
      roomChannel = supabase
        .channel(`chat-room-${selectedRoomId}`)
        .on(
          "broadcast",
          { event: "new_message" },
          (event: { payload?: Record<string, unknown> }) => {
            const incomingMsg = event.payload as unknown as MessageItem;
            if (incomingMsg && incomingMsg.roomId === selectedRoomId) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === incomingMsg.id)) return prev;

                // หากเป็นข้อความจากตัวเราเองที่ broadcast กลับมา และมี optimistic temp ค้างอยู่ ให้แทนที่
                if (incomingMsg.senderId === currentUserId) {
                  const matchingTemp = prev.find(
                    (m) =>
                      m.id.startsWith("temp-") &&
                      m.content === incomingMsg.content,
                  );
                  if (matchingTemp) {
                    removedTempIdsRef.current.add(matchingTemp.id);
                    return prev.map((m) =>
                      m.id === matchingTemp.id
                        ? { ...incomingMsg, isMe: true }
                        : m,
                    );
                  }
                }

                return [
                  ...prev,
                  {
                    ...incomingMsg,
                    isMe: incomingMsg.senderId === currentUserId,
                  },
                ];
              });
              setTimeout(() => scrollToBottom(true), 20);
            }
            void fetchRooms();
          },
        )
        .subscribe();

      roomChannelRef.current = roomChannel;
    }

    // 2. Global Channel สำหรับรับ event เรียลไทม์ทั้งแบบ Broadcast และ Database Changes
    const globalChannel = supabase
      .channel("realtime-chat-global-sync")
      .on("broadcast", { event: "room_updated" }, () => {
        void fetchRooms();
        if (selectedRoomId) {
          void fetchMessages(selectedRoomId, true, false);
        }
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatroom" },
        () => {
          void fetchRooms();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rentalorder" },
        () => {
          void fetchRooms();
        },
      )
      .subscribe();

    globalChannelRef.current = globalChannel;

    // 3. Silent Polling ทุก 2.5 วินาที — สแตนด์บายสำรองตลอดเวลาเพื่อให้แชทอัปเดตต่อเนื่องไม่มีสะดุด
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        if (selectedRoomId) {
          void fetchMessages(selectedRoomId, true, false);
        }
        void fetchRooms();
      }
    }, 2500);

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        if (selectedRoomId) {
          void fetchMessages(selectedRoomId, true, false);
        }
        void fetchRooms();
      }
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      if (roomChannel) supabase.removeChannel(roomChannel);
      supabase.removeChannel(globalChannel);
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      roomChannelRef.current = null;
      globalChannelRef.current = null;
    };
  }, [
    selectedRoomId,
    currentUserId,
    fetchRooms,
    fetchMessages,
    scrollToBottom,
  ]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRoomId || !inputText.trim() || activeRoom?.isClosed) return;

    const targetRoomId = selectedRoomId;
    const content = inputText.trim();
    const nowIso = new Date().toISOString();

    setInputText("");
    setSendingCount((c) => c + 1);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: MessageItem = {
      id: tempId,
      roomId: targetRoomId,
      senderId: currentUserId || "me",
      isMe: true,
      type: "text",
      content,
      isRead: false,
      createdAt: nowIso,
    };

    // แสดงข้อความขึ้นหน้าจอทันที (Optimistic UI)
    setMessages((prev) => [...prev, optimisticMsg]);
    setRooms((prev) =>
      prev.map((r) =>
        r.id === targetRoomId
          ? { ...r, lastMessage: content, updatedAt: nowIso }
          : r,
      ),
    );
    setTimeout(() => scrollToBottom(true), 20);
    inputRef.current?.focus();

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: targetRoomId,
          content,
          type: "text",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverMsg: MessageItem = {
          ...data.message,
          isMe: true,
        };

        removedTempIdsRef.current.add(tempId);

        setMessages((prev) => {
          const replaced = prev.some((m) => m.id === tempId)
            ? prev.map((m) => (m.id === tempId ? serverMsg : m))
            : [...prev, serverMsg];

          // Deduplicate by id
          const uniqueMap = new Map<string, MessageItem>();
          for (const m of replaced) {
            uniqueMap.set(m.id, m);
          }
          return Array.from(uniqueMap.values()).sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });

        void fetchRooms();
        setTimeout(() => scrollToBottom(true), 20);

        // Broadcast เรียลไทม์ทันทีไปยังคู่สนทนาในห้องแชท (< 50ms)
        if (roomChannelRef.current) {
          roomChannelRef.current.send({
            type: "broadcast",
            event: "new_message",
            payload: serverMsg,
          });
        }
        // Broadcast แจ้งเตือนห้องแชทโดยรวม
        if (globalChannelRef.current) {
          globalChannelRef.current.send({
            type: "broadcast",
            event: "room_updated",
            payload: { roomId: targetRoomId },
          });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        removedTempIdsRef.current.add(tempId);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInputText((curr) => curr || content);
        toast.error(
          errData.message || "ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง",
        );
      }
    } catch (err) {
      console.error("Error sending message:", err);
      removedTempIdsRef.current.add(tempId);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText((curr) => curr || content);
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSendingCount((c) => Math.max(0, c - 1));
      inputRef.current?.focus();
    }
  };

  const filteredRooms = rooms.filter((r) => {
    const term = searchTerm.toLowerCase();
    const matchPartner = r.partner?.username?.toLowerCase().includes(term);
    const matchItem = r.order?.itemName?.toLowerCase().includes(term);
    return matchPartner || matchItem;
  });

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] max-w-7xl overflow-hidden bg-slate-50 p-2 sm:p-4 lg:p-6">
      <div className="flex h-full w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl">
        {/* LEFT COLUMN: รายการห้องแชทตามออเดอร์ */}
        <div
          className={`flex h-full w-full flex-col border-r border-slate-200 bg-white transition-all duration-300 md:w-80 lg:w-96 ${
            selectedRoomId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1b3554] text-white shadow-sm">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#000f22]">กล่องข้อความ</h1>
                <p className="text-[11px] text-slate-400">แชทประสานงานตามรายการเช่า</p>
              </div>
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาสินค้า หรือชื่อผู้ใช้..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#3f6593] focus:bg-white focus:ring-2 focus:ring-[#c0e6fd]/50"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoadingRooms ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-[#3f6593]" />
                <span className="text-xs">กำลังโหลดการสนทนา...</span>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Package className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  {searchTerm
                    ? "ไม่พบการสนทนาที่ค้นหา"
                    : "ยังไม่มีประวัติการพูดคุยในออเดอร์"}
                </p>
                <p className="mt-1 text-xs text-slate-400 max-w-xs">
                  ระบบแชทจะเปิดใช้งานโดยอัตโนมัติเมื่อมีการส่งคำขอเช่าสินค้าเกิดขึ้น
                </p>
              </div>
            ) : (
              filteredRooms.map((room) => {
                const isSelected = room.id === selectedRoomId;
                const statusMeta = ORDER_STATUS_CONFIG[room.order?.status || ""] || {
                  label: room.order?.status || "การสนทนา",
                  badgeCls: "bg-slate-100 text-slate-700 border-slate-200",
                };

                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`flex w-full items-start gap-3 p-3.5 text-left transition ${
                      isSelected
                        ? "bg-[#c0e6fd]/20 border-l-4 border-[#1b3554]"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Item Thumbnail with Partner Avatar Overlay */}
                    <div className="relative shrink-0">
                      <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
                        {room.order?.itemImageUrl ? (
                          <Image
                            src={room.order.itemImageUrl}
                            alt={room.order.itemName || "รูปสินค้า"}
                            fill
                            sizes="56px"
                            className="object-cover"
                            unoptimized={true}
                          />
                        ) : (
                          <Package className="h-6 w-6 text-slate-400" />
                        )}
                      </div>

                      {/* Partner Avatar Badge */}
                      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-200 shadow-sm">
                        {room.partner?.avatarUrl ? (
                          <Image
                            src={room.partner.avatarUrl}
                            alt={room.partner.username || "อวตาร"}
                            fill
                            sizes="24px"
                            className="object-cover"
                            unoptimized={true}
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-slate-600">
                            {room.partner?.username?.[0]?.toUpperCase() || "U"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Product Name & Status */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-bold text-slate-900">
                          {room.order?.itemName || room.partner?.username || "การสนทนา"}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatChatTime(room.updatedAt)}
                        </span>
                      </div>

                      {/* Partner & Contextual Role */}
                      <div className="mt-0.5 flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-medium text-slate-600">
                          {room.partner?.role}: {room.partner?.username}
                        </span>
                        {room.order?.status && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.badgeCls}`}
                          >
                            {room.isClosed && <Lock className="h-2.5 w-2.5" />}
                            {statusMeta.label}
                          </span>
                        )}
                      </div>

                      {/* Last Message Preview & Unread Badge */}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-slate-500">
                          {room.lastMessage || (
                            <span className="italic text-slate-400">
                              เริ่มการสนทนา
                            </span>
                          )}
                        </p>

                        {room.unreadCount > 0 && (
                          <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white shadow-sm">
                            {room.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: หน้าต่างสนทนาของออเดอร์ */}
        <div
          className={`flex h-full flex-1 flex-col bg-slate-50/50 ${!selectedRoomId ? "hidden md:flex" : "flex"}`}
        >
          {activeRoom ? (
            <>
              {/* Header */}
              <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:px-6">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setSelectedRoomId(null)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>

                  {/* Thumbnail */}
                  {activeRoom.order ? (
                    <Link
                      href={`/products/${activeRoom.order.itemId}`}
                      className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm transition hover:ring-2 hover:ring-[#3f6593]"
                      title="ดูหน้าสินค้า"
                    >
                      {activeRoom.order.itemImageUrl ? (
                        <Image
                          src={activeRoom.order.itemImageUrl}
                          alt={activeRoom.order.itemName}
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized={true}
                        />
                      ) : (
                        <Package className="h-6 w-6 text-slate-400" />
                      )}
                    </Link>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
                      <User className="h-6 w-6 text-slate-400" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {activeRoom.order ? (
                        <Link
                          href={`/products/${activeRoom.order.itemId}`}
                          className="truncate text-sm sm:text-base font-bold text-slate-900 transition hover:text-[#1b3554] hover:underline"
                        >
                          {activeRoom.order.itemName}
                        </Link>
                      ) : (
                        <span className="truncate text-sm sm:text-base font-bold text-slate-900">
                          {activeRoom.partner?.username || "การสนทนา"}
                        </span>
                      )}

                      {activeRoom.order?.status && (() => {
                        const statusMeta =
                          ORDER_STATUS_CONFIG[activeRoom.order.status] || {
                            label: activeRoom.order.status,
                            badgeCls:
                              "bg-slate-100 text-slate-700 border-slate-200",
                          };
                        return (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusMeta.badgeCls}`}
                          >
                            {activeRoom.isClosed && (
                              <Lock className="h-2.5 w-2.5" />
                            )}
                            {statusMeta.label}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                      <span className="font-medium text-slate-700 flex items-center gap-1">
                        <span>{activeRoom.partner?.role}:</span>
                        <span className="text-[#1b3554] font-semibold">
                          {activeRoom.partner?.username}
                        </span>
                      </span>

                      {activeRoom.order?.startDate && activeRoom.order?.endDate && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Calendar className="h-3 w-3" />
                            {formatOrderDate(activeRoom.order.startDate)} -{" "}
                            {formatOrderDate(activeRoom.order.endDate)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {activeRoom.orderId && (
                    <Link
                      href={`/dashboard/${currentUserId || activeRoom.partner?.id}/${
                        activeRoom.myRole === "renter" ? "rent" : "lend"
                      }/${activeRoom.orderId}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 hover:text-[#1b3554] active:scale-95"
                      title="ดูรายละเอียดออเดอร์"
                    >
                      <Package className="h-3.5 w-3.5 text-[#3f6593]" />
                      <span className="hidden sm:inline">ดูรายละเอียดออเดอร์</span>
                      <ExternalLink className="h-3 w-3 text-slate-400 sm:hidden" />
                    </Link>
                  )}
                </div>
              </div>

              {/* Messages Body */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 lg:p-6"
              >
                {/* Order Summary Card Banner */}
                {activeRoom.order && activeRoom.orderId && (
                  <div className="mx-auto max-w-lg rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {activeRoom.order.itemImageUrl ? (
                          <Image
                            src={activeRoom.order.itemImageUrl}
                            alt={activeRoom.order.itemName}
                            fill
                            sizes="48px"
                            className="object-cover"
                            unoptimized={true}
                          />
                        ) : (
                          <Package className="h-5 w-5 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 text-xs">
                        <p className="font-bold text-slate-900 truncate">
                          {activeRoom.order.itemName}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          รหัสคำสั่งเช่า: #{activeRoom.orderId.slice(0, 8)}
                        </p>
                        {activeRoom.order.startDate && activeRoom.order.endDate && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-slate-500">
                              ช่วงเวลา: {formatOrderDate(activeRoom.order.startDate)} -{" "}
                              {formatOrderDate(activeRoom.order.endDate)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {isLoadingMessages ? (
                  <div className="flex h-40 items-center justify-center text-slate-400">
                    <Loader2 className="h-7 w-7 animate-spin text-[#3f6593]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-56 flex-col items-center justify-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#3f6593] shadow-sm ring-1 ring-slate-200/70">
                      <MessageCircle className="h-7 w-7" />
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-slate-800">
                      เริ่มการสนทนา
                    </h3>
                    <p className="mt-1 max-w-sm text-xs text-slate-500">
                      ประสานงานเรื่องการนัดรับ-ส่งมอบ วันเวลา และสถานที่กับ {activeRoom.partner?.username}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const prevMsg = messages[index - 1];
                    const isNewDate =
                      !prevMsg ||
                      new Date(msg.createdAt).toDateString() !==
                        new Date(prevMsg.createdAt).toDateString();

                    return (
                      <div key={msg.id} className="space-y-3">
                        {isNewDate && (
                          <div className="flex justify-center">
                            <span className="rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-medium text-slate-600">
                              {formatMessageGroupDate(msg.createdAt)}
                            </span>
                          </div>
                        )}

                        <div
                          className={`flex items-end gap-2 ${
                            msg.isMe ? "justify-end" : "justify-start"
                          }`}
                        >
                          {!msg.isMe && (
                            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-300 text-[10px] font-bold text-slate-700">
                              {activeRoom.partner?.avatarUrl ? (
                                <Image
                                  src={activeRoom.partner.avatarUrl}
                                  alt={activeRoom.partner.username || "อวตารผู้สนทนา"}
                                  fill
                                  sizes="28px"
                                  className="object-cover"
                                  unoptimized={true}
                                />
                              ) : (
                                <span>
                                  {activeRoom.partner?.username?.[0]?.toUpperCase() ||
                                    "U"}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="max-w-[75%] space-y-1">
                            <div
                              className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm break-words ${
                                msg.isMe
                                  ? "bg-gradient-to-r from-[#1b3554] to-[#3f6593] text-white rounded-br-none"
                                  : "bg-white border border-slate-200/80 text-slate-800 rounded-bl-none"
                              }`}
                            >
                              <p className="whitespace-pre-wrap leading-relaxed">
                                {msg.content}
                              </p>
                            </div>

                            <div
                              className={`flex items-center gap-1 text-[10px] text-slate-400 ${
                                msg.isMe ? "justify-end" : "justify-start"
                              }`}
                            >
                              <span>{formatChatTime(msg.createdAt)}</span>
                              {msg.isMe &&
                                (msg.isRead ? (
                                  <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
                                ) : (
                                  <Check className="h-3 w-3 text-slate-400" />
                                ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Input Footer / Locked Notice */}
              <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
                {activeRoom.isClosed ? (
                  <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-100/90 py-3.5 px-4 text-xs font-medium text-slate-500 shadow-sm">
                    <Lock className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>
                      การเช่านี้สิ้นสุดแล้ว ไม่สามารถส่งข้อความใหม่ได้
                      (สามารถดูประวัติการสนทนาย้อนหลังได้)
                    </span>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSendMessage}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="พิมพ์ข้อความที่นี่..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="h-11 flex-1 rounded-full border border-slate-200 bg-slate-50/70 px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3f6593] focus:bg-white focus:ring-4 focus:ring-[#c0e6fd]/40"
                    />

                    <button
                      type="submit"
                      disabled={!inputText.trim()}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#1b3554] to-[#3f6593] text-white shadow-md shadow-[#1b3554]/20 transition hover:from-[#000f22] hover:to-[#1b3554] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 -translate-x-0.5" />
                      )}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-sm ring-1 border border-slate-200">
                <MessageCircle className="h-10 w-10 text-[#3f6593]" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-800">
                ระบบแชท ChaoChao
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-slate-500">
                เลือกรายการสนทนาจากแถบด้านซ้าย เพื่อเริ่มการพูดคุยและประสานงาน
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs text-slate-600">
                <span>⚡ ประวัติแชทเก็บเป็นไฟล์ JSON บน Supabase Storage พร้อม Realtime ทันที</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <ToastProvider>
      <Suspense
        fallback={
          <div className="flex h-[calc(100vh-80px)] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#3f6593]" />
          </div>
        }
      >
        <ChatContent />
      </Suspense>
    </ToastProvider>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

interface Partner {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  status: string;
}

interface ChatRoom {
  id: string;
  orderId: string | null;
  isClosed: boolean;
  lastMessage: string;
  updatedAt: string;
  createdAt: string;
  unreadCount: number;
  partner: Partner;
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

function ChatContent() {
  const searchParams = useSearchParams();
  const targetRoomIdParam = searchParams.get("roomId");

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeRoom = rooms.find((r) => r.id === selectedRoomId);

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
      const res = await fetch("/api/chat/rooms", { cache: "no-store" });
      if (res.status === 401) {
        setRooms([]);
        return;
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
      }
    } catch (err) {
      console.error("Error fetching chat rooms:", err);
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  const fetchMessages = useCallback(
    async (roomId: string, silent = false, autoScroll = false) => {
      if (!silent) setIsLoadingMessages(true);
      try {
        const res = await fetch(`/api/chat/messages?roomId=${roomId}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const incomingMessages: MessageItem[] = data.messages || [];

          setMessages((prev) => {
            if (
              prev.length === incomingMessages.length &&
              JSON.stringify(prev) === JSON.stringify(incomingMessages)
            ) {
              return prev;
            }
            return incomingMessages;
          });

          setRooms((prev) =>
            prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
          );

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

  // เปิดห้องแชทตรงจาก URL (?roomId=...) — ห้องถูกสร้างไว้แล้วตั้งแต่ตอนกดจากหน้า order
  useEffect(() => {
    if (targetRoomIdParam) {
      setSelectedRoomId(targetRoomIdParam);
    }
  }, [targetRoomIdParam]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    if (selectedRoomId) {
      fetchMessages(selectedRoomId, false, true);
      inputRef.current?.focus();
    } else {
      setMessages([]);
    }
  }, [selectedRoomId, fetchMessages]);

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel("realtime-chat-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message" },
        (payload: any) => {
          const newMsg = payload.new;
          if (selectedRoomId && newMsg.chat_room_id === selectedRoomId) {
            fetchMessages(selectedRoomId, true, true);
          }
          fetchRooms();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chatroom" },
        () => {
          fetchRooms();
        },
      )
      .subscribe();

    const handleVisibilityCheck = () => {
      if (document.visibilityState === "visible") {
        fetchRooms();
        if (selectedRoomId) {
          fetchMessages(selectedRoomId, true, false);
        }
      }
    };

    const interval = setInterval(handleVisibilityCheck, 15000);
    window.addEventListener("focus", handleVisibilityCheck);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityCheck);
    };
  }, [selectedRoomId, fetchRooms, fetchMessages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (
      !selectedRoomId ||
      !inputText.trim() ||
      isSending ||
      activeRoom?.isClosed
    )
      return;

    const content = inputText.trim();
    setInputText("");
    setIsSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: MessageItem = {
      id: tempId,
      roomId: selectedRoomId,
      senderId: "me",
      isMe: true,
      type: "text",
      content,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 20);

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedRoomId,
          content,
          type: "text",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data.message : m)),
        );
        fetchRooms();
        setTimeout(() => scrollToBottom(true), 20);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        alert("ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง");
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const filteredRooms = rooms.filter((r) =>
    r.partner.username.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-80px)] max-w-7xl overflow-hidden bg-slate-50 p-2 sm:p-4 lg:p-6">
      <div className="flex h-full w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl">
        {/* LEFT COLUMN */}
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
              <h1 className="text-lg font-bold text-[#000f22]">กล่องข้อความ</h1>
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อผู้ใช้..."
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
                  <MessageCircle className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  {searchTerm
                    ? "ไม่พบการสนทนาที่ค้นหา"
                    : "ยังไม่มีประวัติการพูดคุย"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  เริ่มแชทได้จากหน้ารายละเอียดการเช่าของแต่ละออเดอร์
                </p>
              </div>
            ) : (
              filteredRooms.map((room) => {
                const isSelected = room.id === selectedRoomId;
                const partnerInitial = room.partner.username
                  ? room.partner.username[0].toUpperCase()
                  : "U";

                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`flex w-full items-center gap-3.5 p-3.5 text-left transition ${
                      isSelected
                        ? "bg-[#c0e6fd]/25 border-l-4 border-[#1b3554]"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-sm font-bold text-white shadow-sm ring-2 ring-white">
                        {room.partner.avatarUrl ? (
                          <img
                            src={room.partner.avatarUrl}
                            alt={room.partner.username}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{partnerInitial}</span>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-semibold text-slate-900 flex items-center gap-1.5">
                          {room.partner.username}
                          {room.isClosed && (
                            <Lock className="h-3 w-3 text-slate-400" />
                          )}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatChatTime(room.updatedAt)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center justify-between gap-2">
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

        {/* RIGHT COLUMN */}
        <div
          className={`flex h-full flex-1 flex-col bg-slate-50/50 ${!selectedRoomId ? "hidden md:flex" : "flex"}`}
        >
          {activeRoom ? (
            <>
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:px-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedRoomId(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>

                  <Link
                    href={`/user/${activeRoom.partner.id}?from=chat`}
                    title="ดูโปรไฟล์ผู้ใช้งาน"
                    className="group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-[#1b3554] to-[#3f6593] text-sm font-bold text-white shadow-sm ring-2 ring-transparent transition hover:ring-[#3f6593]"
                  >
                    {activeRoom.partner.avatarUrl ? (
                      <img
                        src={activeRoom.partner.avatarUrl}
                        alt={activeRoom.partner.username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>
                        {activeRoom.partner.username
                          ? activeRoom.partner.username[0].toUpperCase()
                          : "U"}
                      </span>
                    )}
                  </Link>

                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/user/${activeRoom.partner.id}?from=chat`}
                        className="font-bold text-slate-900 transition hover:text-[#1b3554] hover:underline"
                      >
                        {activeRoom.partner.username}
                      </Link>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {activeRoom.partner.role}
                      </span>
                    </div>
                    {activeRoom.isClosed ? (
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Lock className="h-3 w-3" /> ปิดการสนทนาแล้ว
                        (อ่านได้อย่างเดียว)
                      </span>
                    ) : (
                      <span className="text-[11px] text-emerald-600">
                        ● บัญชีใช้งาน
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  href={`/user/${activeRoom.partner.id}?from=chat`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 hover:text-[#1b3554] active:scale-95"
                >
                  <User className="h-3.5 w-3.5 text-[#3f6593]" />
                  <span>ดูโปรไฟล์</span>
                </Link>
              </div>

              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 lg:p-6"
              >
                {isLoadingMessages ? (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    <Loader2 className="h-7 w-7 animate-spin text-[#3f6593]" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#3f6593] shadow-sm ring-1 ring-slate-200/70">
                      <MessageCircle className="h-7 w-7" />
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-slate-800">
                      เริ่มการสนทนากับ {activeRoom.partner.username}
                    </h3>
                    <p className="mt-1 max-w-sm text-xs text-slate-500">
                      พิมพ์ข้อความด้านล่างเพื่อสอบถามรายละเอียด การนัดรับ
                      หรือข้อมูลอุปกรณ์ก่อนการเช่า
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
                          className={`flex items-end gap-2 ${msg.isMe ? "justify-end" : "justify-start"}`}
                        >
                          {!msg.isMe && (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-300 text-[10px] font-bold text-slate-700">
                              {activeRoom.partner.avatarUrl ? (
                                <img
                                  src={activeRoom.partner.avatarUrl}
                                  alt={activeRoom.partner.username}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span>
                                  {activeRoom.partner.username[0]?.toUpperCase() ||
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
                              className={`flex items-center gap-1 text-[10px] text-slate-400 ${msg.isMe ? "justify-end" : "justify-start"}`}
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

              <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
                {activeRoom.isClosed ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-xs font-medium text-slate-500">
                    <Lock className="h-3.5 w-3.5" />
                    <span>
                      ออเดอร์นี้เสร็จสิ้นแล้ว ไม่สามารถส่งข้อความใหม่ได้
                      (ดูประวัติได้ตามปกติ)
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
                      placeholder="พิมพ์ข้อความที่ต้องการสอบถาม..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="h-11 flex-1 rounded-full border border-slate-200 bg-slate-50/70 px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3f6593] focus:bg-white focus:ring-4 focus:ring-[#c0e6fd]/40"
                    />

                    <button
                      type="submit"
                      disabled={!inputText.trim() || isSending}
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
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
                <MessageCircle className="h-10 w-10 text-[#3f6593]" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-800">
                ยินดีต้อนรับสู่ระบบแชท ChaoChao
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-slate-500">
                เลือกคู่สนทนาจากรายการทางซ้าย —
                แชทของแต่ละออเดอร์จะเริ่มต้นได้จากหน้ารายละเอียดการเช่านั้นๆ
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-80px)] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#3f6593]" />
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}

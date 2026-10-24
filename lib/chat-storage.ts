import { createAdminClient } from "@/lib/supabase/admin";

export interface StoredMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface RoomChatLog {
  roomId: string;
  updatedAt: string;
  messages: StoredMessage[];
}

const BUCKET_NAME = "chat-logs";

// Global in-memory cache & mutex locks (persists across hot-reloads in dev and warm instances in prod)
const globalForChat = globalThis as unknown as {
  __chatRoomLocks?: Map<string, Promise<unknown>>;
  __chatMemoryCache?: Map<string, RoomChatLog>;
};

const roomLocks =
  globalForChat.__chatRoomLocks ??
  (globalForChat.__chatRoomLocks = new Map<string, Promise<unknown>>());

const memoryLogCache =
  globalForChat.__chatMemoryCache ??
  (globalForChat.__chatMemoryCache = new Map<string, RoomChatLog>());

async function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = roomLocks.get(roomId) || Promise.resolve();
  let release!: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = currentLock.then(() => nextLock);
  roomLocks.set(roomId, chained);

  try {
    await currentLock;
    return await fn();
  } finally {
    release();
    if (roomLocks.get(roomId) === chained) {
      roomLocks.delete(roomId);
    }
  }
}

/**
 * ผสานรายการข้อความแบบ G-Set (Grow-Only Set) โดยยึดตาม id
 * ป้องกันข้อความสูญหายแม้ Storage CDN คืนไฟล์แคชที่ล่าช้ากว่าหน่วยความจำ
 */
function mergeMessages(
  listA: StoredMessage[],
  listB: StoredMessage[],
): StoredMessage[] {
  const map = new Map<string, StoredMessage>();

  for (const m of listA) {
    if (m && m.id) {
      map.set(m.id, { ...m });
    }
  }

  for (const m of listB) {
    if (m && m.id) {
      const existing = map.get(m.id);
      if (existing) {
        map.set(m.id, {
          ...existing,
          ...m,
          isRead: Boolean(existing.isRead || m.isRead),
        });
      } else {
        map.set(m.id, { ...m });
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/**
 * ดึงประวัติข้อความทั้งหมดของห้องแชทจากไฟล์ JSON ใน Supabase Storage Bucket
 * พร้อมผสานกับ In-Memory Cache เพื่อความถูกต้องแบบ Real-time 100%
 */
export async function getRoomMessages(roomId: string): Promise<RoomChatLog> {
  const admin = createAdminClient();
  const filePath = `${roomId}.json`;
  const cached = memoryLogCache.get(roomId);

  try {
    // ใช้ cacheNonce และ cache: 'no-store' เพื่อข้าม Cloudflare CDN cache และ Next.js fetch cache
    const { data, error } = await admin.storage
      .from(BUCKET_NAME)
      .download(
        filePath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { cacheNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}` } as any,
        { cache: "no-store" },
      );

    if (error || !data) {
      if (cached) {
        return {
          roomId,
          updatedAt: cached.updatedAt,
          messages: [...cached.messages],
        };
      }
      return {
        roomId,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
    }

    const text = await data.text();
    const parsed = JSON.parse(text);
    const storageMessages: StoredMessage[] = Array.isArray(parsed.messages)
      ? parsed.messages
      : [];

    const mergedMessages = cached
      ? mergeMessages(storageMessages, cached.messages)
      : storageMessages;

    const latestUpdatedAt =
      mergedMessages.length > 0
        ? mergedMessages[mergedMessages.length - 1].createdAt
        : parsed.updatedAt || cached?.updatedAt || new Date().toISOString();

    const result: RoomChatLog = {
      roomId,
      updatedAt: latestUpdatedAt,
      messages: mergedMessages,
    };

    memoryLogCache.set(roomId, result);
    return {
      roomId,
      updatedAt: result.updatedAt,
      messages: [...result.messages],
    };
  } catch (err) {
    console.warn(`[chat-storage] Error reading ${filePath}:`, err);
    if (cached) {
      return {
        roomId,
        updatedAt: cached.updatedAt,
        messages: [...cached.messages],
      };
    }
    return {
      roomId,
      updatedAt: new Date().toISOString(),
      messages: [],
    };
  }
}

/**
 * บันทึกข้อความใหม่ลงในไฟล์ JSON ของห้องแชทใน Supabase Storage Bucket
 */
export async function appendRoomMessage(
  roomId: string,
  newMsg: StoredMessage,
): Promise<StoredMessage> {
  // อัปเดตลง In-Memory Cache ทันที เพื่อให้ GET ที่เข้ามาพร้อมกันเห็นข้อความใหม่ทันที
  const existingCache = memoryLogCache.get(roomId);
  if (existingCache) {
    memoryLogCache.set(roomId, {
      roomId,
      updatedAt: newMsg.createdAt,
      messages: mergeMessages(existingCache.messages, [newMsg]),
    });
  } else {
    memoryLogCache.set(roomId, {
      roomId,
      updatedAt: newMsg.createdAt,
      messages: [newMsg],
    });
  }

  return withRoomLock(roomId, async () => {
    const admin = createAdminClient();
    const filePath = `${roomId}.json`;

    const chatLog = await getRoomMessages(roomId);
    const merged = mergeMessages(chatLog.messages, [newMsg]);

    const updatedLog: RoomChatLog = {
      roomId,
      updatedAt: newMsg.createdAt,
      messages: merged,
    };

    memoryLogCache.set(roomId, updatedLog);

    const jsonContent = JSON.stringify(updatedLog, null, 2);

    const { error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(filePath, jsonContent, {
        contentType: "application/json",
        upsert: true,
        cacheControl: "0",
      });

    if (uploadError) {
      console.error(`[chat-storage] Upload failed for ${filePath}:`, uploadError);
      throw new Error("Failed to save chat message to storage");
    }

    return newMsg;
  });
}

/**
 * อัปเดตสถานะการอ่านข้อความทั้งหมดในห้องที่ส่งโดยคู่สนทนา ให้เป็น isRead: true
 */
export async function markRoomMessagesAsRead(
  roomId: string,
  readerUserId: string,
): Promise<void> {
  return withRoomLock(roomId, async () => {
    const admin = createAdminClient();
    const filePath = `${roomId}.json`;

    const chatLog = await getRoomMessages(roomId);
    let hasChange = false;

    const updatedMessages = chatLog.messages.map((msg) => {
      if (msg.senderId !== readerUserId && !msg.isRead) {
        hasChange = true;
        return { ...msg, isRead: true };
      }
      return msg;
    });

    if (hasChange) {
      const latestCache = memoryLogCache.get(roomId);
      const finalMessages = latestCache
        ? mergeMessages(updatedMessages, latestCache.messages)
        : updatedMessages;

      const updatedLog: RoomChatLog = {
        roomId,
        updatedAt: chatLog.updatedAt,
        messages: finalMessages,
      };

      memoryLogCache.set(roomId, updatedLog);

      const jsonContent = JSON.stringify(updatedLog, null, 2);
      await admin.storage
        .from(BUCKET_NAME)
        .upload(filePath, jsonContent, {
          contentType: "application/json",
          upsert: true,
          cacheControl: "0",
        });
    }
  });
}

/**
 * ดึงข้อมูลข้อความล่าสุด และจำนวนข้อความที่ยังไม่ได้อ่านของหลายๆ ห้องพร้อมกัน
 */
export async function getRoomsSummary(
  roomIds: string[],
  currentUserId: string,
): Promise<
  Map<string, { lastMessage: string; lastCreatedAt: string; unreadCount: number }>
> {
  const summaryMap = new Map<
    string,
    { lastMessage: string; lastCreatedAt: string; unreadCount: number }
  >();

  await Promise.all(
    roomIds.map(async (roomId) => {
      const log = await getRoomMessages(roomId);
      const msgs = log.messages;
      const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;

      let unread = 0;
      for (const m of msgs) {
        if (m.senderId !== currentUserId && !m.isRead) {
          unread++;
        }
      }

      summaryMap.set(roomId, {
        lastMessage: last?.content || "",
        lastCreatedAt: last?.createdAt || log.updatedAt,
        unreadCount: unread,
      });
    }),
  );

  return summaryMap;
}

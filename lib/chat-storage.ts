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

/**
 * ดึงประวัติข้อความทั้งหมดของห้องแชทจากไฟล์ JSON ใน Supabase Storage Bucket
 */
export async function getRoomMessages(roomId: string): Promise<RoomChatLog> {
  const admin = createAdminClient();
  const filePath = `${roomId}.json`;

  try {
    const { data, error } = await admin.storage
      .from(BUCKET_NAME)
      .download(filePath);

    if (error || !data) {
      // หากยังไม่มีไฟล์ (ห้องใหม่ที่ยังไม่มีข้อความ)
      return {
        roomId,
        updatedAt: new Date().toISOString(),
        messages: [],
      };
    }

    const text = await data.text();
    const parsed = JSON.parse(text);
    return {
      roomId,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch (err) {
    console.warn(`[chat-storage] Error reading ${filePath}:`, err);
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
  newMsg: StoredMessage
): Promise<StoredMessage> {
  const admin = createAdminClient();
  const filePath = `${roomId}.json`;

  const chatLog = await getRoomMessages(roomId);
  chatLog.messages.push(newMsg);
  chatLog.updatedAt = newMsg.createdAt;

  const jsonContent = JSON.stringify(chatLog, null, 2);

  const { error: uploadError } = await admin.storage
    .from(BUCKET_NAME)
    .upload(filePath, jsonContent, {
      contentType: "application/json",
      upsert: true,
    });

  if (uploadError) {
    console.error(`[chat-storage] Upload failed for ${filePath}:`, uploadError);
    throw new Error("Failed to save chat message to storage");
  }

  return newMsg;
}

/**
 * อัปเดตสถานะการอ่านข้อความทั้งหมดในห้องที่ส่งโดยคู่สนทนา ให้เป็น isRead: true
 */
export async function markRoomMessagesAsRead(
  roomId: string,
  readerUserId: string
): Promise<void> {
  const admin = createAdminClient();
  const filePath = `${roomId}.json`;

  const chatLog = await getRoomMessages(roomId);
  let hasChange = false;

  for (const msg of chatLog.messages) {
    if (msg.senderId !== readerUserId && !msg.isRead) {
      msg.isRead = true;
      hasChange = true;
    }
  }

  if (hasChange) {
    const jsonContent = JSON.stringify(chatLog, null, 2);
    await admin.storage
      .from(BUCKET_NAME)
      .upload(filePath, jsonContent, {
        contentType: "application/json",
        upsert: true,
      });
  }
}

/**
 * ดึงข้อมูลข้อความล่าสุด และจำนวนข้อความที่ยังไม่ได้อ่านของหลายๆ ห้องพร้อมกัน
 */
export async function getRoomsSummary(
  roomIds: string[],
  currentUserId: string
): Promise<Map<string, { lastMessage: string; lastCreatedAt: string; unreadCount: number }>> {
  const summaryMap = new Map<
    string,
    { lastMessage: string; lastCreatedAt: string; unreadCount: number }
  >();

  // ดึงข้อมูลแบบ parallel
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
    })
  );

  return summaryMap;
}

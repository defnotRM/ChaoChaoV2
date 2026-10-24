import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRoomMessages,
  appendRoomMessage,
  markRoomMessagesAsRead,
  StoredMessage,
} from "@/lib/chat-storage";
import { isOrderChatClosed } from "@/lib/chat-statuses";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json(
        { message: "กรุณาระบุรหัสห้องสนทนา (roomId)" },
        { status: 400 },
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 },
      );
    }

    const admin = createAdminClient();

    const { data: room, error: roomError } = await admin
      .from("chatroom")
      .select("chat_room_id, user_a, user_b, order_id")
      .eq("chat_room_id", roomId)
      .maybeSingle();

    if (roomError || !room) {
      return NextResponse.json(
        { message: "ไม่พบห้องสนทนานี้" },
        { status: 404 },
      );
    }

    if (room.user_a !== user.id && room.user_b !== user.id) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์เข้าถึงห้องสนทนานี้" },
        { status: 403 },
      );
    }

    // 1. ดึงประวัติข้อความจาก Storage Bucket (chat-logs/{roomId}.json)
    const chatLog = await getRoomMessages(roomId);

    // 2. อัปเดตสถานะอ่านแล้วลงไฟล์ใน Storage แบบ Asynchronous (ควบคุม concurrency ด้วย room lock)
    void markRoomMessagesAsRead(roomId, user.id);

    // 3. จัดรูปแบบข้อความส่งกลับไปยัง Client
    const formattedMessages = chatLog.messages.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      senderId: m.senderId,
      isMe: m.senderId === user.id,
      type: m.type,
      content: m.content,
      isRead: m.senderId === user.id ? m.isRead : true,
      createdAt: m.createdAt,
    }));

    return NextResponse.json(
      { messages: formattedMessages },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("Chat messages GET error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { roomId, content, type = "text" } = body;

    if (!roomId || !content || !content.trim()) {
      return NextResponse.json(
        { message: "กรุณาระบุข้อความที่ต้องการส่ง" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: room, error: roomError } = await admin
      .from("chatroom")
      .select("chat_room_id, user_a, user_b, order_id, rentalorder(status)")
      .eq("chat_room_id", roomId)
      .maybeSingle();

    if (roomError || !room) {
      return NextResponse.json(
        { message: "ไม่พบห้องสนทนานี้" },
        { status: 404 },
      );
    }

    if (room.user_a !== user.id && room.user_b !== user.id) {
      return NextResponse.json(
        { message: "คุณไม่มีสิทธิ์ส่งข้อความในห้องนี้" },
        { status: 403 },
      );
    }

    // ตรวจสอบสถานะออเดอร์ (เฉพาะกรณีที่แชทผูกกับออเดอร์)
    if (room.order_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderData = Array.isArray(room.rentalorder)
        ? room.rentalorder[0]
        : (room as any).rentalorder;
      const orderStatus = orderData?.status;

      // หากออเดอร์สิ้นสุดการเช่าแล้ว ปิดไมค์ไม่ให้ส่งข้อความใหม่
      if (orderStatus && isOrderChatClosed(orderStatus)) {
        return NextResponse.json(
          { message: "การเช่านี้สิ้นสุดแล้ว ไม่สามารถส่งข้อความใหม่ได้" },
          { status: 403 },
        );
      }
    }

    const cleanContent = content.trim();

    const newMsg: StoredMessage = {
      id: crypto.randomUUID(),
      roomId,
      senderId: user.id,
      type: type === "image" ? "image" : "text",
      content: cleanContent,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    // บันทึกข้อความลงใน Supabase Storage Bucket (chat-logs/{roomId}.json)
    await appendRoomMessage(roomId, newMsg);

    return NextResponse.json(
      {
        message: {
          ...newMsg,
          isMe: true,
        },
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("Chat messages POST error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      .select("chat_room_id, user_a, user_b")
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

    await admin
      .from("message")
      .update({ is_read: true })
      .eq("chat_room_id", roomId)
      .neq("sender_id", user.id)
      .eq("is_read", false);

    const { data: messages, error: messagesError } = await admin
      .from("message")
      .select(
        "message_id, chat_room_id, sender_id, type, content, is_read, created_at",
      )
      .eq("chat_room_id", roomId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการโหลดข้อความ" },
        { status: 500 },
      );
    }

    const formattedMessages = (messages || []).map((m) => ({
      id: m.message_id,
      roomId: m.chat_room_id,
      senderId: m.sender_id,
      isMe: m.sender_id === user.id,
      type: m.type,
      content: m.content,
      isRead: m.is_read,
      createdAt: m.created_at,
    }));

    return NextResponse.json({ messages: formattedMessages });
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

    // ปิดไมค์แล้ว (order คืนของอัปรูปเสร็จเป็นต้นไป) — เช็คซ้ำที่ชั้น API ให้ error อ่านง่าย
    // (RLS ก็บล็อกไว้อีกชั้นอยู่แล้ว)
    const CLOSED_STATUSES = [
      "item_returned",
      "completed",
      "awaiting_additional_payment",
      "refunded_dispute",
      "item_not_returned",
    ];
    const orderStatus = (room as any).rentalorder?.status as string | undefined;
    if (orderStatus && CLOSED_STATUSES.includes(orderStatus)) {
      return NextResponse.json(
        { message: "ออเดอร์นี้เสร็จสิ้นแล้ว ไม่สามารถส่งข้อความใหม่ได้" },
        { status: 403 },
      );
    }

    const cleanContent = content.trim();

    const { data: newMsg, error: insertError } = await admin
      .from("message")
      .insert({
        chat_room_id: roomId,
        sender_id: user.id,
        type: type === "image" ? "image" : "text",
        content: cleanContent,
        is_read: false,
      })
      .select(
        "message_id, chat_room_id, sender_id, type, content, is_read, created_at",
      )
      .single();

    if (insertError || !newMsg) {
      console.error("Error sending message:", insertError);
      return NextResponse.json(
        { message: "ไม่สามารถส่งข้อความได้" },
        { status: 500 },
      );
    }

    // ไม่ต้องอัปเดต chatroom.last_message/updated_at อีกต่อไป (คอลัมน์นี้ไม่มีอยู่จริง
    // อยู่แล้ว — หน้า /chat คำนวณ "ข้อความล่าสุด" จากตาราง message โดยตรงตอนนี้)

    return NextResponse.json(
      {
        message: {
          id: newMsg.message_id,
          roomId: newMsg.chat_room_id,
          senderId: newMsg.sender_id,
          isMe: true,
          type: newMsg.type,
          content: newMsg.content,
          isRead: newMsg.is_read,
          createdAt: newMsg.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Chat messages POST error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// สถานะ order ที่ถือว่า "คืนของอัปรูปเสร็จแล้ว" เป็นต้นไป — แชทอ่านได้ ส่งไม่ได้
const CLOSED_STATUSES = [
  "item_returned",
  "completed",
  "awaiting_additional_payment",
  "refunded_dispute",
  "item_not_returned",
];

export async function GET() {
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

    const admin = createAdminClient();

    // 1. ดึงห้องแชททั้งหมดที่ user เป็นคู่สนทนา พร้อม join สถานะ order ที่ผูกอยู่
    const { data: rooms, error: roomsError } = await admin
      .from("chatroom")
      .select(
        "chat_room_id, user_a, user_b, order_id, created_at, rentalorder(status)",
      )
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    if (roomsError) {
      console.error("Error fetching rooms:", roomsError);
      return NextResponse.json(
        { message: "เกิดข้อผิดพลาดในการโหลดรายการแชท" },
        { status: 500 },
      );
    }

    if (!rooms || rooms.length === 0) {
      return NextResponse.json(
        { rooms: [] },
        {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        },
      );
    }

    const partnerIds = Array.from(
      new Set(rooms.map((r) => (r.user_a === user.id ? r.user_b : r.user_a))),
    );

    // 2. โปรไฟล์คู่สนทนา
    const { data: profiles } = await admin
      .from("useraccount")
      .select("user_id, username, avatar_url, updated_at, status")
      .in("user_id", partnerIds);
    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    // 3. role ของคู่สนทนา
    const { data: roleAssignments } = await admin
      .from("user_role_assignment")
      .select("user_id, role ( role_type )")
      .in("user_id", partnerIds);
    const rolesMap = new Map<string, string[]>();
    (roleAssignments || []).forEach((ra: any) => {
      const current = rolesMap.get(ra.user_id) || [];
      if (ra.role?.role_type) current.push(ra.role.role_type);
      rolesMap.set(ra.user_id, current);
    });

    // 4. ข้อความทั้งหมดของทุกห้อง (เรียงใหม่สุดก่อน) — เอาไปคำนวณ "ข้อความล่าสุด" +
    // "จำนวนที่ยังไม่อ่าน" เอง เพราะ chatroom ไม่มีคอลัมน์ last_message/updated_at จริง
    const roomIds = rooms.map((r) => r.chat_room_id);
    const { data: allMessages } = await admin
      .from("message")
      .select("chat_room_id, content, created_at, sender_id, is_read")
      .in("chat_room_id", roomIds)
      .order("created_at", { ascending: false });

    const lastMsgMap = new Map<
      string,
      { content: string; created_at: string }
    >();
    const unreadCountMap = new Map<string, number>();
    for (const m of allMessages || []) {
      if (!lastMsgMap.has(m.chat_room_id)) {
        lastMsgMap.set(m.chat_room_id, {
          content: m.content,
          created_at: m.created_at,
        });
      }
      if (m.sender_id !== user.id && !m.is_read) {
        unreadCountMap.set(
          m.chat_room_id,
          (unreadCountMap.get(m.chat_room_id) || 0) + 1,
        );
      }
    }

    const formattedRooms = rooms.map((r) => {
      const partnerId = r.user_a === user.id ? r.user_b : r.user_a;
      const partnerProfile = profileMap.get(partnerId);
      const partnerRoles = rolesMap.get(partnerId) || [];
      const last = lastMsgMap.get(r.chat_room_id);
      const orderStatus = (r as any).rentalorder?.status as string | undefined;

      const roleLabel = partnerRoles.includes("admin")
        ? "ผู้ดูแลระบบ"
        : partnerRoles.includes("lender")
          ? "ผู้ให้เช่า"
          : "ผู้เช่า";

      const v = partnerProfile?.updated_at
        ? new Date(partnerProfile.updated_at).getTime()
        : Date.now();

      return {
        id: r.chat_room_id,
        orderId: r.order_id,
        isClosed: orderStatus ? CLOSED_STATUSES.includes(orderStatus) : false,
        lastMessage: last?.content || "",
        updatedAt: last?.created_at || r.created_at,
        createdAt: r.created_at,
        unreadCount: unreadCountMap.get(r.chat_room_id) || 0,
        partner: {
          id: partnerId,
          username: partnerProfile?.username || "ผู้ใช้งาน",
          avatarUrl: partnerProfile?.avatar_url
            ? `/api/avatar?id=${partnerId}&v=${v}`
            : null,
          role: roleLabel,
          status: partnerProfile?.status || "Active",
        },
      };
    });

    // เรียงห้องที่มีข้อความล่าสุดก่อน
    formattedRooms.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return NextResponse.json(
      { rooms: formattedRooms },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error("Chat rooms GET error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}

// สร้าง/เปิดห้องแชทของ order หนึ่งๆ — ตอนนี้ผูกกับ orderId แทน partnerId แบบเดิม
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

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json(
        { message: "กรุณาระบุออเดอร์ที่จะเปิดแชท" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .select("order_id, user_id, item_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ message: "ไม่พบออเดอร์นี้" }, { status: 404 });
    }

    const { data: item } = await admin
      .from("item")
      .select("user_id")
      .eq("item_id", order.item_id)
      .maybeSingle();
    const lenderId = item?.user_id;

    if (user.id !== order.user_id && user.id !== lenderId) {
      return NextResponse.json(
        { message: "คุณไม่ใช่คู่กรณีของออเดอร์นี้" },
        { status: 403 },
      );
    }

    // มีห้องแชทของ order นี้อยู่แล้วหรือยัง
    const { data: existingRoom } = await admin
      .from("chatroom")
      .select("chat_room_id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existingRoom) {
      return NextResponse.json({
        roomId: existingRoom.chat_room_id,
        isNew: false,
      });
    }

    const { data: newRoom, error: createError } = await admin
      .from("chatroom")
      .insert({
        user_a: order.user_id, // ผู้เช่า
        user_b: lenderId, // ผู้ให้เช่า
        order_id: orderId,
      })
      .select("chat_room_id")
      .single();

    if (createError || !newRoom) {
      console.error("Error creating chat room:", createError);
      return NextResponse.json(
        { message: "ไม่สามารถสร้างห้องสนทนาได้" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { roomId: newRoom.chat_room_id, isNew: true },
      { status: 201 },
    );
  } catch (error) {
    console.error("Chat rooms POST error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}

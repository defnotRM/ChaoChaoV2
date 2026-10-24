import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOrderChatClosed } from "@/lib/chat-statuses";
import { getRoomsSummary } from "@/lib/chat-storage";

export const dynamic = "force-dynamic";

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

    // 1. ดึงห้องแชททั้งหมดที่ผูกกับออเดอร์และ user เป็นคู่สนทนา พร้อม join รายละเอียดสินค้า
    const { data: rooms, error: roomsError } = await admin
      .from("chatroom")
      .select(`
        chat_room_id,
        user_a,
        user_b,
        order_id,
        created_at,
        rentalorder (
          order_id,
          user_id,
          status,
          start_date,
          end_date,
          item:item_id (
            item_id,
            item_name,
            itemimage (
              image_url,
              is_primary
            )
          )
        )
      `)
      .not("order_id", "is", null)
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

    // 3. ดึงข้อมูลข้อความล่าสุดและจำนวนที่ยังไม่อ่านจาก Storage Bucket (chat-logs/{roomId}.json)
    const roomIds = rooms.map((r) => r.chat_room_id);
    const roomsSummary = await getRoomsSummary(roomIds, user.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedRooms = rooms.map((r: any) => {
      const isRenter = r.user_a === user.id;
      const partnerId = isRenter ? r.user_b : r.user_a;
      const partnerProfile = profileMap.get(partnerId);
      const summary = roomsSummary.get(r.chat_room_id);

      const orderData = Array.isArray(r.rentalorder)
        ? r.rentalorder[0]
        : r.rentalorder;
      const orderStatus = orderData?.status || "";
      const isClosed = orderStatus ? isOrderChatClosed(orderStatus) : false;

      // Contextual role in this rental
      const contextualRole = isRenter ? "ผู้ให้เช่า" : "ผู้เช่า";

      // ใช้ค่าคงที่ 1 แทน Date.now() หากไม่มี updated_at เพื่อไม่ให้ URL รูปอวตารเปลี่ยนทุกครั้งที่ Poll
      const v = partnerProfile?.updated_at
        ? new Date(partnerProfile.updated_at).getTime()
        : 1;

      const itemData = Array.isArray(orderData?.item)
        ? orderData.item[0]
        : orderData?.item;
      const itemImages = itemData?.itemimage || [];
      const primaryImage =
        itemImages.find((img: { is_primary?: boolean }) => img.is_primary)?.image_url ||
        itemImages[0]?.image_url ||
        null;

      return {
        id: r.chat_room_id,
        orderId: r.order_id || null,
        isClosed,
        myRole: (isRenter ? "renter" : "lender") as "renter" | "lender",
        lastMessage: summary?.lastMessage || "",
        updatedAt: summary?.lastCreatedAt || r.created_at,
        createdAt: r.created_at,
        unreadCount: summary?.unreadCount || 0,
        partner: {
          id: partnerId,
          username: partnerProfile?.username || "ผู้ใช้งาน",
          avatarUrl: partnerProfile?.avatar_url
            ? (partnerProfile.avatar_url.startsWith("http")
                ? partnerProfile.avatar_url
                : `/api/avatar?id=${partnerId}&v=${v}`)
            : null,
          role: contextualRole,
          status: partnerProfile?.status || "Active",
        },
        order:
          r.order_id && orderData
            ? {
                id: orderData.order_id || r.order_id,
                status: orderStatus,
                startDate: orderData.start_date || "",
                endDate: orderData.end_date || "",
                itemId: itemData?.item_id || "",
                itemName: itemData?.item_name || "สินค้าให้เช่า",
                itemImageUrl: primaryImage,
              }
            : null,
      };
    });

    // เรียงห้องที่มีข้อความล่าสุดก่อน (พร้อม tie-breaker ด้วย id เพื่อไม่ให้ลำดับสลับไปมา)
    formattedRooms.sort((a, b) => {
      const timeDiff =
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

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

// สร้าง/เปิดห้องแชทของ order หนึ่งๆ
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

    if (createError) {
      // จัดการกรณีเกิด concurrent insert
      if (createError.code === "23505") {
        const { data: fallbackRoom } = await admin
          .from("chatroom")
          .select("chat_room_id")
          .eq("order_id", orderId)
          .maybeSingle();
        if (fallbackRoom) {
          return NextResponse.json({
            roomId: fallbackRoom.chat_room_id,
            isNew: false,
          });
        }
      }
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

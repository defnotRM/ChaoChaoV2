import { NextResponse } from "next/server";
import { BOOKING_BLOCKING_STATUSES } from "@/lib/booking-statuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getSimulatedTimeInfo, parseBangkokWindow } from "@/lib/simulated-time";

export const dynamic = "force-dynamic";

const NATIONAL_ID_RE = /^\d{13}$/;

type RentalBody = {
  itemId?: string;
  startDate?: string;
  endDate?: string;
  meetupTime?: string | null;
  returnTime?: string | null;
  meetupLocation?: string | null;
  returnLocation?: string | null;
  rentalFee?: number | null;
  deposit?: number | null;
  totalPaid?: number | null;
  renter?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    nationalId?: string;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RentalBody;
    const {
      itemId,
      startDate,
      endDate,
      meetupTime,
      returnTime,
      meetupLocation,
      returnLocation,
      rentalFee,
      deposit,
      totalPaid,
      renter,
    } = body;

    // 1) validate
    if (!itemId || !startDate || !endDate) {
      return NextResponse.json(
        { message: "ข้อมูลคำขอไม่ครบ (สินค้า/ช่วงวันที่)" },
        { status: 400 },
      );
    }
    if (endDate < startDate) {
      return NextResponse.json(
        { message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" },
        { status: 400 },
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();

    if (user) {
      const { data: userRoles } = await admin
        .from("user_role_assignment")
        .select("role ( role_type )")
        .eq("user_id", user.id);

      const roles = (userRoles || [])
        .map((r: { role?: { role_type?: string } | { role_type?: string }[] | null }) => {
          const item = Array.isArray(r.role) ? r.role[0] : r.role;
          return item?.role_type;
        })
        .filter((r): r is string => Boolean(r));

      const isLenderOnly =
        roles.includes("lender") &&
        !roles.includes("renter") &&
        !roles.includes("admin");

      if (isLenderOnly) {
        return NextResponse.json(
          {
            message:
              "บัญชีของคุณเป็นผู้ให้เช่าเท่านั้น ไม่สามารถส่งคำขอเช่าได้",
          },
          { status: 403 },
        );
      }
    }

    if (!user?.id) {
      return NextResponse.json(
        { message: "กรุณาเข้าสู่ระบบก่อนทำการเช่าสินค้า" },
        { status: 401 }
      );
    }
    const renterUserId = user.id;

    // 1.1) ตรวจสอบการลงทะเบียนข้อมูลเพิ่มเติมของผู้เช่า (FR-04: รูปบัตรประชาชน + รูปคู่บัตร + บัญชีธนาคาร และผ่านการตรวจสอบจากแอดมิน)
    const [{ data: renterProfile }, { data: renterBank }] = await Promise.all([
      admin
        .from("useraccount")
        .select(
          "id_card_url, id_card_selfie_url, identity_verification_status"
        )
        .eq("user_id", renterUserId)
        .maybeSingle(),
      admin
        .from("bankaccount")
        .select(
          "bank_account_id, bank_name, account_number, account_name, verification_status"
        )
        .eq("user_id", renterUserId)
        .maybeSingle(),
    ]);

    const missingRenterKyc =
      !renterProfile?.id_card_url ||
      !renterProfile?.id_card_selfie_url ||
      !renterBank?.bank_name ||
      !renterBank?.account_number ||
      !renterBank?.account_name;

    const isRenterKycRejected =
      renterProfile?.identity_verification_status === "rejected" ||
      renterBank?.verification_status === "rejected";

    if (missingRenterKyc || isRenterKycRejected) {
      return NextResponse.json(
        {
          code: "KYC_REQUIRED",
          message:
            "สำหรับการส่งคำขอเช่า กรุณาลงทะเบียนข้อมูลเพิ่มเติม ได้แก่ รูปถ่ายบัตรประชาชน รูปถ่ายบุคคลคู่กับบัตรประชาชน และบัญชีธนาคาร เพื่อให้แอดมินตรวจสอบตัวตนก่อน",
        },
        { status: 403 }
      );
    }

    if (
      renterProfile.identity_verification_status !== "verified" ||
      renterBank.verification_status !== "verified"
    ) {
      return NextResponse.json(
        {
          code: "KYC_PENDING",
          message:
            "ข้อมูลยืนยันตัวตนและบัญชีธนาคารของคุณอยู่ระหว่างรอแอดมินตรวจสอบ กรุณารอแอดมินอนุมัติก่อนส่งคำขอเช่า",
        },
        { status: 403 }
      );
    }

    // 2) ตรวจสินค้ามีจริงและพร้อมให้เช่า
    const { data: item, error: itemError } = await admin
      .from("item")
      .select("item_id, user_id, item_name, status, rental_fee_per_day, deposit")
      .eq("item_id", itemId)
      .maybeSingle();

    if (itemError || !item) {
      return NextResponse.json({ message: "ไม่พบสินค้านี้" }, { status: 404 });
    }
    if (item.status !== "available") {
      return NextResponse.json(
        { message: "สินค้านี้ไม่พร้อมให้เช่าในขณะนี้" },
        { status: 409 },
      );
    }

    // 2.1) ตรวจสอบขอบเขตวันที่เปิดให้เช่า (Availability)
    const { data: availList } = await admin
      .from("availability")
      .select("start_date, end_date")
      .eq("item_id", itemId);

    if (availList && availList.length > 0) {
      const isWithinAvailability = availList.some((a) => {
        const s = a.start_date ? String(a.start_date).split("T")[0] : "";
        const e = a.end_date ? String(a.end_date).split("T")[0] : "";
        return startDate >= s && endDate <= e;
      });

      if (!isWithinAvailability) {
        return NextResponse.json(
          {
            message:
              "ช่วงเวลาที่คุณเลือกไม่อยู่ในขอบเขตวันที่ผู้ให้เช่าเปิดให้เช่า",
          },
          { status: 400 },
        );
      }
    }

    // 2.2) ตรวจสอบการจองซ้ำซ้อนกับ Order อื่นที่ได้รับการอนุมัติแล้ว
    const { data: overlappingOrders } = await admin
      .from("rentalorder")
      .select("order_id, start_date, end_date")
      .eq("item_id", itemId)
      .in("status", [...BOOKING_BLOCKING_STATUSES])
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    if (overlappingOrders && overlappingOrders.length > 0) {
      return NextResponse.json(
        {
          message:
            "ช่วงเวลาดังกล่าวมีรายการเช่าอื่นของสินค้านี้ที่ยังไม่เสร็จสิ้น (เช่น อนุมัติแล้ว กำลังเช่า หรือรอตัดสินข้อพิพาท) กรุณาเลือกช่วงเวลาอื่น",
        },
        { status: 409 },
      );
    }

    // 3) ถ้ามี renter details ส่งมา อัปเดตข้อมูลผู้เช่า
    const warnings: string[] = [];
    if (renter) {
      const firstName = renter?.firstName?.trim() ?? "";
      const lastName = renter?.lastName?.trim() ?? "";
      const email = renter?.email?.trim() ?? "";
      const phone = renter?.phone?.trim() ?? "";
      const nationalId = renter?.nationalId?.trim() ?? "";

      const updatePayload: Record<string, string> = {};
      if (firstName) updatePayload.firstname = firstName;
      if (lastName) updatePayload.lastname = lastName;
      if (nationalId && NATIONAL_ID_RE.test(nationalId))
        updatePayload.national_id = nationalId;
      if (email) updatePayload.email = email;

      if (Object.keys(updatePayload).length > 0) {
        await admin
          .from("useraccount")
          .update(updatePayload)
          .eq("user_id", renterUserId);
      }

      if (phone) {
        await admin
          .from("useraccount")
          .update({ phone })
          .eq("user_id", renterUserId);
      }
    }

    // คำนวณราคากรณีไม่ได้ส่งมา
    const finalFee = rentalFee ?? item.rental_fee_per_day;
    const finalDeposit = deposit ?? item.deposit;
    const finalTotal = totalPaid ?? Number(finalFee) + Number(finalDeposit);

    const normalizedMeetupTime = (meetupTime || "12:00").trim().slice(0, 5);
    const normalizedReturnTime = (returnTime || "12:00").trim().slice(0, 5);

    const timeInfo = await getSimulatedTimeInfo(admin);
    const nowIso = timeInfo.simulatedNowIso;

    // ตรวจสอบวันและเวลานัดรับสินค้า ต้องไม่เป็นเวลาในอดีต (TC09)
    const pickupWindow = parseBangkokWindow(startDate, normalizedMeetupTime, 0);
    if (pickupWindow.startMs < timeInfo.nowMs) {
      return NextResponse.json(
        {
          message:
            "ช่วงเวลาที่เลือกไม่ถูกต้อง ไม่สามารถเลือกวันหรือเวลานัดรับในอดีตได้",
        },
        { status: 400 },
      );
    }

    const returnWindow = parseBangkokWindow(endDate, normalizedReturnTime, 0);
    if (returnWindow.startMs <= pickupWindow.startMs) {
      return NextResponse.json(
        {
          message:
            "ช่วงเวลาที่เลือกไม่ถูกต้อง เวลานัดคืนสินค้าต้องอยู่หลังเวลานัดรับสินค้า",
        },
        { status: 400 },
      );
    }

    // 4) INSERT rentalorder
    const { data: order, error: orderError } = await admin
      .from("rentalorder")
      .insert({
        user_id: renterUserId,
        item_id: itemId,
        start_date: startDate,
        end_date: endDate,
        meetup_time: normalizedMeetupTime,
        return_time: normalizedReturnTime,
        meetup_location: meetupLocation ?? "จุดนัดรับที่ตกลงกัน",
        return_location: returnLocation ?? "จุดนัดคืนที่ตกลงกัน",
        rental_fee: finalFee,
        deposit: finalDeposit,
        total_paid: finalTotal,
        status: "requested",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("order_id")
      .single();

    if (orderError) {
      if (orderError.code === "23P01") {
        return NextResponse.json(
          { message: "ช่วงวันที่นี้ถูกจองแล้ว กรุณาเลือกช่วงอื่น" },
          { status: 409 },
        );
      }
      console.error("Insert rentalorder error:", orderError);
      return NextResponse.json(
        { message: "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
        { status: 500 },
      );
    }

    // 5) สร้างห้องแชทผูกกับออเดอร์ทันที (order-bound chat)
    if (item.user_id) {
      try {
        await admin.from("chatroom").insert({
          user_a: renterUserId,
          user_b: item.user_id,
          order_id: order.order_id,
        });
      } catch (chatErr) {
        console.error("Auto create chatroom error on rental:", chatErr);
      }

      // 6) ส่งการแจ้งเตือนถึงผู้ให้เช่าเมื่อมีคำขอเช่าใหม่ (FR-46)
      try {
        await admin.from("notification").insert({
          user_id: item.user_id,
          type: "order_requested",
          title: "มีคำขอเช่าอุปกรณ์ใหม่ 📦",
          message: `มีผู้ส่งคำขอเช่า "${item.item_name || "อุปกรณ์ของคุณ"}" วันที่ ${startDate} ถึง ${endDate}`,
          related_order_id: order.order_id,
          is_read: false,
        });
      } catch (notifErr) {
        console.warn("Failed to create new rental request notification:", notifErr);
      }
    }

    return NextResponse.json(
      { orderId: order.order_id, userId: renterUserId, warnings },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/rentals error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" },
      { status: 500 },
    );
  }
}

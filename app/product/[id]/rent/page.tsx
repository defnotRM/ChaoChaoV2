import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import BookingClient from "./BookingClient";
import type { BookingLocation, BookingPageData, DateRange } from "./types";

// ข้อมูลมาจาก DB ตอน request จริง (มีออเดอร์/คิวว่างที่เปลี่ยนได้) → ไม่ prerender
export const dynamic = "force-dynamic";
export const revalidate = 0;

// สถานะออเดอร์ที่ "กันคิว" (ล็อควันเฉพาะหลังจากผู้ให้เช่ากดอนุมัติแล้ว/กำลังชำระเงิน/ชำระเงินแล้ว)
const ACTIVE_ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "item_sent",
  "item_received",
  "item_returned",
  "awaiting_additional_payment",
];

function formatFullAddress(location: {
  no: string | null;
  alley: string | null;
  road: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
}) {
  return [
    location.no === "-" ? null : location.no,
    location.alley,
    location.road,
    location.subdistrict,
    location.district,
    location.province,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
}

export default async function ProductRentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const admin = createAdminClient();

  // 1) สินค้า — ไม่พบ → 404
  const { data: item, error: itemError } = await admin
    .from("item")
    .select("item_id, user_id, item_name, rental_fee_per_day, deposit, status")
    .eq("item_id", id)
    .maybeSingle();

  if (itemError || !item) {
    notFound();
  }

  // 2) เจ้าของ / จุดนัด / คิวว่าง / รูป / ออเดอร์ที่กันคิว — ดึงขนานกัน
  const [ownerRes, locationsRes, availabilityRes, imageRes, ordersRes, reviewRes, ownerItemsRes] =
    await Promise.all([
      admin
        .from("useraccount")
        .select("user_id, username, firstname, lastname, avatar_url, updated_at, status, created_at")
        .eq("user_id", item.user_id)
        .maybeSingle(),
      admin
        .from("itemlocation")
        .select("location_id, description, no, alley, road, subdistrict, district, province")
        .eq("item_id", id),
      admin
        .from("availability")
        .select("start_date, end_date")
        .eq("item_id", id)
        .order("start_date", { ascending: true }),
      admin
        .from("itemimage")
        .select("image_url, is_primary, sequence")
        .eq("item_id", id)
        .order("sequence", { ascending: true }),
      // อ่านช่วงที่ถูกจองด้วย admin (RLS ปกติเห็นเฉพาะออเดอร์ของตัวเอง)
      admin
        .from("rentalorder")
        .select("start_date, end_date, status, order_id")
        .eq("item_id", id)
        .in("status", ACTIVE_ORDER_STATUSES),
      // เรตติ้งสินค้า: review join ผ่าน rentalorder.order_id ของชิ้นนี้
      admin
        .from("review")
        .select("rating, order:order_id!inner ( item_id )")
        .eq("order.item_id", id),
      // สินค้าทั้งหมดของผู้ให้เช่าสำหรับ aggregate เรตติ้ง
      admin.from("item").select("item_id").eq("user_id", item.user_id),
    ]);

  let owner = ownerRes.data;
  if (!owner || !owner.username) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(item.user_id);
      if (authUser?.user) {
        const u = authUser.user;
        const uName = u.user_metadata?.username || u.email?.split("@")[0] || "ผู้ให้เช่า";
        const uEmail = u.email || `${uName.toLowerCase()}@chaochao.local`;
        const uNatId = u.user_metadata?.national_id || null;

        await admin.from("useraccount").upsert(
          {
            user_id: u.id,
            username: uName,
            email: uEmail,
            national_id: uNatId,
            status: "Active",
          },
          { onConflict: "user_id" }
        );

        owner = {
          user_id: u.id,
          username: uName,
          firstname: null,
          lastname: null,
          avatar_url: u.user_metadata?.avatar_url || null,
          updated_at: new Date().toISOString(),
          status: "Active",
          created_at: u.created_at,
        };
      }
    } catch {
      // ignore
    }
  }

  const ownerName =
    owner?.username ||
    [owner?.firstname, owner?.lastname].filter(Boolean).join(" ").trim() ||
    "ผู้ให้เช่า";

  const avatarUrl = owner?.avatar_url || null;

  const locations: BookingLocation[] = (locationsRes.data || []).map((loc) => ({
    id: loc.location_id,
    description: loc.description || "จุดนัดรับ",
    fullAddress: formatFullAddress(loc),
  }));

  const availability: DateRange[] = (availabilityRes.data || []).map((a) => ({
    start: a.start_date,
    end: a.end_date,
  }));

  const bookedRanges: DateRange[] = (ordersRes.data || []).map((o) => ({
    start: o.start_date,
    end: o.end_date,
  }));

  const primaryImage =
    (imageRes.data || []).find((img) => img.is_primary)?.image_url ||
    imageRes.data?.[0]?.image_url ||
    null;

  // เรตติ้งของผู้ให้เช่าจากทุกสินค้า
  const ownerItemIds = (ownerItemsRes.data || []).map((r) => r.item_id);
  let ownerRatingData: { average: number; count: number } | null = null;
  if (ownerItemIds.length > 0) {
    const { data: ownerReviews } = await admin
      .from("review")
      .select("rating, order:order_id!inner ( item_id )")
      .in("order.item_id", ownerItemIds);
    const rows = (ownerReviews || []) as Array<{ rating: number }>;
    if (rows.length > 0) {
      const sum = rows.reduce((s, r) => s + (Number(r.rating) || 0), 0);
      ownerRatingData = {
        average: sum / rows.length,
        count: rows.length,
      };
    }
  }

  const reviews = reviewRes.data || [];
  const itemRating =
    reviews.length > 0
      ? {
          average:
            reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) /
            reviews.length,
          count: reviews.length,
        }
      : null;

  const rating = ownerRatingData || itemRating;

  const data: BookingPageData = {
    item: {
      id: item.item_id,
      name: item.item_name,
      rentalFeePerDay: Number(item.rental_fee_per_day) || 0,
      deposit: Number(item.deposit) || 0,
      status: item.status,
      imageUrl: primaryImage,
    },
    owner: {
      displayName: ownerName,
      avatarUrl,
      isVerified: owner?.status === "Active",
      joinedAt: owner?.created_at ?? new Date().toISOString(),
    },
    locations,
    availability,
    bookedRanges,
    rating,
  };

  return <BookingClient key={item.item_id} data={data} />;
}

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { processSimulatedExpiredOrders } from "@/lib/simulated-time";
import LendOrderDetailClient, { type LendOrderData } from "./LendOrderDetailClient";

export const dynamic = "force-dynamic";

export default async function LenderOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>;
}) {
  const { id: userId, orderId } = await params;
  const admin = createAdminClient();

  await processSimulatedExpiredOrders(admin, orderId);

  // 1. ดึงข้อมูลคำสั่งเช่า
  const { data: order, error } = await admin
    .from("rentalorder")
    .select(
      "order_id, item_id, user_id, meetup_location, return_location, start_date, end_date, meetup_time, return_time, rental_fee, deposit, total_paid, fee, net_income, status, created_at, updated_at"
    )
    .eq("order_id", orderId)
    .maybeSingle();

  if (error || !order) {
    notFound();
  }

  // 2. ดึงข้อมูลสินค้า, รูปสินค้า, ผู้เช่า, เบอร์โทรผู้เช่า, การชำระเงิน, รูปหลักฐาน, และรีวิว
  const [itemRes, imageRes, renterRes, phoneRes, paymentsRes, evidenceRes, reviewRes] = await Promise.all([
    admin
      .from("item")
      .select("item_id, item_name, rental_fee_per_day, deposit, user_id")
      .eq("item_id", order.item_id)
      .maybeSingle(),
    admin
      .from("itemimage")
      .select("image_url, is_primary, sequence")
      .eq("item_id", order.item_id)
      .order("sequence", { ascending: true }),
    admin
      .from("useraccount")
      .select("user_id, username, firstname, lastname, email, avatar_url, updated_at")
      .eq("user_id", order.user_id)
      .maybeSingle(),
    admin
      .from("userphones")
      .select("phone")
      .eq("user_id", order.user_id),
    admin
      .from("payment")
      .select("payment_id, amount, status, slip_image_url, date")
      .eq("order_id", orderId),
    admin
      .from("rentalevidenceimage")
      .select("evidence_id, evidence_type, image_url, created_at, uploaded_by")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    admin
      .from("review")
      .select("review_id, order_id, rating, comment, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle(),
  ]);

  const item = itemRes.data;
  if (!item) {
    notFound();
  }

  const { data: lender } = item.user_id
    ? await admin
        .from("useraccount")
        .select("user_id, username, firstname, lastname, avatar_url")
        .eq("user_id", item.user_id)
        .maybeSingle()
    : { data: null };

  const lenderFullName =
    lender?.username ||
    `${lender?.firstname || ""} ${lender?.lastname || ""}`.trim() ||
    "ผู้ให้เช่า";

  const primaryImage =
    imageRes.data?.find((i) => i.is_primary)?.image_url ??
    imageRes.data?.[0]?.image_url ??
    null;

  let renter = renterRes.data;
  if (!renter || !renter.username) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(order.user_id);
      if (authUser?.user) {
        const u = authUser.user;
        const uName = u.user_metadata?.username || u.email?.split("@")[0] || "ผู้เช่า";
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

        renter = {
          user_id: u.id,
          username: uName,
          firstname: null,
          lastname: null,
          email: uEmail,
          avatar_url: u.user_metadata?.avatar_url || null,
          updated_at: new Date().toISOString(),
        };
      }
    } catch {
      // ignore
    }
  }

  const renterFullName = renter?.username || `${renter?.firstname || ""} ${renter?.lastname || ""}`.trim() || "ผู้เช่า";

  const renterPhones = (phoneRes.data || [])
    .map((p: any) => p.phone)
    .filter(Boolean);

  const avatarUrl = renter?.avatar_url || null;

  const revData = reviewRes.data as any;
  let reviewImages: string[] = [];
  if (revData?.review_id) {
    const { data: revImgs } = await admin
      .from("reviewimage")
      .select("image_url, created_at")
      .eq("review_id", revData.review_id)
      .order("created_at", { ascending: true });
    reviewImages = (revImgs || []).map((img: any) => img.image_url);
  }
  const orderReview = revData
    ? {
        review_id: revData.review_id,
        order_id: revData.order_id,
        rating: Number(revData.rating) || 5,
        comment: revData.comment || "",
        created_at: revData.created_at,
        updated_at: revData.updated_at,
        imageUrls: reviewImages,
      }
    : null;

  const data: LendOrderData = {
    order: {
      order_id: order.order_id,
      item_id: order.item_id,
      user_id: order.user_id,
      meetup_location: order.meetup_location,
      return_location: order.return_location,
      start_date: order.start_date,
      end_date: order.end_date,
      meetup_time: order.meetup_time || "12:00",
      return_time: order.return_time || "12:00",
      rental_fee: Number(order.rental_fee) || 0,
      deposit: Number(order.deposit) || 0,
      total_paid: Number(order.total_paid) || 0,
      fee: Number(order.fee) || 0,
      net_income: Number(order.net_income) || 0,
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at,
    },
    item: {
      id: item.item_id,
      name: item.item_name,
      rentalFeePerDay: Number(item.rental_fee_per_day) || 0,
      deposit: Number(item.deposit) || 0,
      imageUrl: primaryImage,
    },
    renter: {
      id: order.user_id,
      username: renter?.username || "renter",
      fullName: renterFullName,
      email: renter?.email || null,
      phone: renterPhones[0] || null,
      phones: renterPhones,
      avatarUrl,
    },
    lender: {
      id: item.user_id || userId,
      username: lender?.username || "ผู้ให้เช่า",
      fullName: lenderFullName,
      avatarUrl: lender?.avatar_url || null,
    },
    payments: (paymentsRes.data || []).map((p) => ({
      payment_id: p.payment_id,
      amount: Number(p.amount) || 0,
      status: p.status,
      slip_image_url: p.slip_image_url || null,
      date: p.date,
    })),
    evidence: (evidenceRes.data || []).map((e) => ({
      evidence_id: e.evidence_id,
      evidence_type: e.evidence_type,
      image_url: e.image_url,
      created_at: e.created_at,
      uploaded_by: e.uploaded_by,
    })),
    review: orderReview,
  };

  return <LendOrderDetailClient data={data} userId={userId} />;
}

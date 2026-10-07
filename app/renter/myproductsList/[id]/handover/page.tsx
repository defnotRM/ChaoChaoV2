import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import HandoverClient, { type HandoverPageData } from "./HandoverClient";

export const dynamic = "force-dynamic";

// เข้าหน้ารับของได้เมื่อชำระเงินแล้วเป็นต้นไป
const ALLOWED = [
  "paid",
  "item_sent",
  "item_returned",
  "awaiting_additional_payment",
  "completed",
];

export default async function HandoverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // ต้องล็อกอินและเป็นผู้เช่าของ order นี้จริง — เดิมเช็คด้วย UUID hardcode
  // (ใช้ได้แค่ user ทดสอบคนเดียว) แก้ให้เช็คจาก session จริงแทน
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("rentalorder")
    .select(
      "order_id, item_id, user_id, meetup_location, return_location, start_date, end_date, deposit, status",
    )
    .eq("order_id", id)
    .maybeSingle();

  if (error || !order || !ALLOWED.includes(order.status)) {
    notFound();
  }

  const [itemRes, imageRes, evidenceRes, renterRes] = await Promise.all([
    admin
      .from("item")
      .select("item_name, user_id")
      .eq("item_id", order.item_id)
      .maybeSingle(),
    admin
      .from("itemimage")
      .select("image_url, is_primary, sequence")
      .eq("item_id", order.item_id)
      .order("sequence", { ascending: true }),
    admin
      .from("rentalevidenceimage")
      .select("evidence_type, image_url, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("useraccount")
      .select("firstname, lastname, username")
      .eq("user_id", order.user_id)
      .maybeSingle(),
  ]);

  const ownerId = itemRes.data?.user_id ?? "";

  // หน้าเดียวกันใช้ได้ทั้งผู้เช่าและผู้ให้เช่าของออเดอร์นี้ (เห็นหลักฐานของกันและกัน)
  const viewerRole =
    user.id === order.user_id
      ? "renter"
      : ownerId && user.id === ownerId
        ? "lender"
        : null;
  if (!viewerRole) {
    notFound();
  }
  const ownerAccount = ownerId
    ? (
        await admin
          .from("useraccount")
          .select("firstname, lastname, username, status")
          .eq("user_id", ownerId)
          .maybeSingle()
      ).data
    : null;
  const ownerName =
    [ownerAccount?.firstname, ownerAccount?.lastname]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    ownerAccount?.username ||
    "ผู้ปล่อยเช่า";

  const renterAccount = renterRes.data;
  const renterName =
    [renterAccount?.firstname, renterAccount?.lastname]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    renterAccount?.username ||
    "ผู้เช่า";

  const evidence = evidenceRes.data || [];
  const renterRows = evidence.filter(
    (e) => e.evidence_type === "renter_before",
  );
  const lenderRows = evidence.filter(
    (e) => e.evidence_type === "lender_before",
  );

  const primaryImage =
    imageRes.data?.find((i) => i.is_primary)?.image_url ??
    imageRes.data?.[0]?.image_url ??
    null;

  const data: HandoverPageData = {
    orderId: order.order_id,
    itemName: itemRes.data?.item_name ?? "อุปกรณ์เช่า",
    imageUrl: primaryImage,
    meetupLocation: order.meetup_location,
    returnLocation: order.return_location,
    startDate: order.start_date,
    endDate: order.end_date,
    deposit: Number(order.deposit) || 0,
    status: order.status,
    ownerName,
    ownerId,
    renterName,
    viewerRole,
    renterEvidence:
      renterRows.length > 0
        ? {
            count: renterRows.length,
            uploadedAt: renterRows[renterRows.length - 1].created_at,
            imageUrls: renterRows.map((r) => r.image_url).filter(Boolean),
          }
        : null,
    lenderEvidence:
      lenderRows.length > 0
        ? {
            count: lenderRows.length,
            uploadedAt: lenderRows[lenderRows.length - 1].created_at,
            imageUrls: lenderRows.map((r) => r.image_url).filter(Boolean),
          }
        : null,
  };

  return <HandoverClient data={data} />;
}

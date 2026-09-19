import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import ReviewReplyClient, { type ReviewReplyData } from "./ReviewReplyClient";

export const dynamic = "force-dynamic";

export default async function ReviewHiredProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("rentalorder")
    .select("order_id, user_id, item_id")
    .eq("order_id", id)
    .maybeSingle();

  if (orderError || !order) {
    notFound();
  }

  const { data: item } = await admin
    .from("item")
    .select("item_id, item_name, user_id")
    .eq("item_id", order.item_id)
    .maybeSingle();

  if (!item || item.user_id !== user.id) {
    notFound();
  }

  const { data: review } = await admin
    .from("review")
    .select(
      "review_id, rating, comment, lender_reply, lender_reply_at, created_at",
    )
    .eq("order_id", id)
    .maybeSingle();

  const { data: renterAccount } = await admin
    .from("useraccount")
    .select("firstname, lastname, username")
    .eq("user_id", order.user_id)
    .maybeSingle();

  const renterName =
    [renterAccount?.firstname, renterAccount?.lastname]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    renterAccount?.username ||
    "ผู้เช่า";

  const data: ReviewReplyData = {
    orderId: order.order_id,
    itemName: item.item_name || "อุปกรณ์เช่า",
    renterName,
    review: review
      ? {
          reviewId: review.review_id,
          rating: review.rating,
          comment: review.comment,
          lenderReply: review.lender_reply,
          lenderReplyAt: review.lender_reply_at,
          createdAt: review.created_at,
        }
      : null,
  };

  return <ReviewReplyClient data={data} />;
}

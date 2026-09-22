import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import ReviewClient from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
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
  const { data: order, error } = await admin
    .from("rentalorder")
    .select("order_id, user_id, status, item_id")
    .eq("order_id", id)
    .maybeSingle();

  if (
    error ||
    !order ||
    order.user_id !== user.id ||
    order.status !== "completed"
  ) {
    notFound();
  }

  const { data: item } = await admin
    .from("item")
    .select("item_name")
    .eq("item_id", order.item_id)
    .maybeSingle();

  const { data: existingReview } = await admin
    .from("review")
    .select("review_id, rating, comment")
    .eq("order_id", order.order_id)
    .maybeSingle();

  let existingImages: string[] = [];
  if (existingReview) {
    const { data: images } = await admin
      .from("reviewimage")
      .select("image_url")
      .eq("review_id", existingReview.review_id);
    existingImages = (images || []).map((img) => img.image_url);
  }

  return (
    <ReviewClient
      orderId={order.order_id}
      itemName={item?.item_name ?? "อุปกรณ์เช่า"}
      existingReview={
        existingReview
          ? {
              rating: existingReview.rating,
              comment: existingReview.comment || "",
              images: existingImages,
            }
          : null
      }
    />
  );
}

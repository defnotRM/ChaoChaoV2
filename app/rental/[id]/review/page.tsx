import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import ReviewClient from "./ReviewClient";

export const dynamic = "force-dynamic";

// ครอบหน้ารีวิวให้มีระยะห่าง ไม่ติดแถบเมนูด้านบน (ใช้กับทุกสถานะของ ReviewClient)
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-16 pt-6 sm:pb-20 sm:pt-8">
      {children}
    </div>
  );
}

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
    <PageShell>
      <div className="mx-auto mb-4 max-w-xl">
        <Link
          href={`/dashboard/${user.id}/rent/${order.order_id}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#3f6593] hover:bg-sky-50 hover:text-[#1b3554] active:scale-95"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>กลับไปหน้ารายละเอียดการเช่า</span>
        </Link>
      </div>
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
    </PageShell>
  );
}

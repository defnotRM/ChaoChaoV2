import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OrderRedirectPage({
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
    .select("order_id, user_id, item_id")
    .eq("order_id", id)
    .maybeSingle();

  if (error || !order) {
    notFound();
  }

  if (user.id === order.user_id) {
    redirect(`/dashboard/${user.id}/rent/${order.order_id}`);
  }

  let lenderId: string | null = null;
  if (order.item_id) {
    const { data: item } = await admin
      .from("item")
      .select("user_id")
      .eq("item_id", order.item_id)
      .maybeSingle();
    lenderId = item?.user_id ?? null;
  }

  if (user.id === lenderId) {
    redirect(`/dashboard/${user.id}/lend/${order.order_id}`);
  }

  notFound();
}

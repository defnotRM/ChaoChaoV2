import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function OrderRedirectPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id: orderId } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/orders/${orderId}`);
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("rentalorder")
    .select("order_id, user_id, item(user_id)")
    .eq("order_id", orderId)
    .maybeSingle();

  if (!order) {
    redirect("/dashboard");
  }

  const lenderId = (order.item as any)?.user_id;

  if (order.user_id === user.id) {
    redirect(`/dashboard/${user.id}/rent/${orderId}`);
  } else if (lenderId === user.id) {
    redirect(`/dashboard/${user.id}/lend/${orderId}`);
  } else {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin) {
      redirect("/admin/disputes");
    }
    redirect("/dashboard");
  }
}

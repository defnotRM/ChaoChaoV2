import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import EditProductClient from "./EditProductClient";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: item, error: itemError }, { data: categories }] = await Promise.all([
    admin
      .from("item")
      .select(
        "item_id, user_id, category_id, item_name, description, original_price, rental_fee_per_day, deposit, status, created_at, updated_at"
      )
      .eq("item_id", id)
      .maybeSingle(),
    admin
      .from("itemcategory")
      .select("category_id, category_name")
      .order("category_name", { ascending: true }),
  ]);

  if (itemError || !item) {
    notFound();
  }

  const [imagesRes, locationsRes, conditionsRes, availRes] = await Promise.all([
    admin
      .from("itemimage")
      .select("image_id, image_url, is_primary, sequence")
      .eq("item_id", id)
      .order("sequence", { ascending: true }),
    admin
      .from("itemlocation")
      .select("location_id, description, no, alley, road, subdistrict, district, province")
      .eq("item_id", id),
    admin
      .from("itemcondition")
      .select("seq, condition")
      .eq("item_id", id)
      .order("seq", { ascending: true }),
    admin
      .from("availability")
      .select("availability_id, start_date, end_date")
      .eq("item_id", id),
  ]);

  const initialItem = {
    ...item,
    itemimage: imagesRes.data || [],
    itemlocation: locationsRes.data || [],
    itemcondition: conditionsRes.data || [],
    availability: availRes.data || [],
  };

  return (
    <div className="min-h-screen bg-slate-50/70 pb-20 pt-6 sm:pb-24 sm:pt-8">
      <EditProductClient
        initialItem={initialItem}
        categories={categories || []}
      />
    </div>
  );
}

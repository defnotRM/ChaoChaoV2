import type { createAdminClient } from "@/lib/supabase/admin";

export type RatingSummary = { rating: number; reviewCount: number };

type AdminClient = ReturnType<typeof createAdminClient>;

// API ของ Supabase คืนได้ไม่เกิน 1000 แถวต่อครั้ง (ค่าเริ่มต้น) จึงดึงทีละหน้าจนครบ ไม่ให้คะแนนคิดจากรีวิวแค่บางส่วน
const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Cannot load ratings:", error);
      break;
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows as T[];
}

function summarize(agg: Map<string, { sum: number; count: number }>) {
  return new Map<string, RatingSummary>(
    [...agg].map(([id, { sum, count }]) => [
      id,
      { rating: sum / count, reviewCount: count },
    ]),
  );
}

/**
 * คะแนนผู้ให้เช่า = ค่าเฉลี่ยรีวิวของสินค้าทุกชิ้นที่ผู้ให้เช่าเป็นเจ้าของ รวมชิ้นที่ซ่อน (inactive)
 * นับชิ้นที่ซ่อนด้วย เพื่อไม่ให้ผู้ให้เช่าซ่อนสินค้าที่โดนรีวิวแย่แล้วคะแนนตัวเองสูงขึ้น
 * ใช้ฟังก์ชันนี้ทุกหน้าที่แสดงคะแนนผู้ให้เช่า ตัวเลขจะได้ตรงกัน
 * byItem (คะแนนรายสินค้า) ได้จากรีวิวชุดเดียวกัน จึงคืนมาด้วยให้หน้าค้นหาไม่ต้องดึงรีวิวซ้ำ
 */
export async function getOwnerRatings(admin: AdminClient, ownerIds: string[]) {
  const ownerAgg = new Map<string, { sum: number; count: number }>();
  const itemAgg = new Map<string, { sum: number; count: number }>();

  if (ownerIds.length > 0) {
    const items = await fetchAllPages<{ item_id: string; user_id: string }>(
      (from, to) =>
        admin
          .from("item")
          .select("item_id, user_id")
          .in("user_id", ownerIds)
          .order("item_id")
          .range(from, to),
    );
    const ownerByItem = new Map(items.map((it) => [it.item_id, it.user_id]));

    const reviews =
      ownerByItem.size > 0
        ? await fetchAllPages<{
            rating: number;
            order: { item_id: string } | null;
          }>((from, to) =>
            admin
              .from("review")
              .select("rating, order:order_id!inner ( item_id )")
              .in("order.item_id", [...ownerByItem.keys()])
              .order("review_id")
              .range(from, to),
          )
        : [];

    for (const r of reviews) {
      const itemId = r.order?.item_id;
      const ownerId = itemId ? ownerByItem.get(itemId) : undefined;
      if (!itemId || !ownerId) continue;
      const rating = Number(r.rating) || 0;
      for (const [agg, key] of [
        [itemAgg, itemId],
        [ownerAgg, ownerId],
      ] as const) {
        const cur = agg.get(key) || { sum: 0, count: 0 };
        cur.sum += rating;
        cur.count += 1;
        agg.set(key, cur);
      }
    }
  }

  return { byOwner: summarize(ownerAgg), byItem: summarize(itemAgg) };
}

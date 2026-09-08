import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedUserId = searchParams.get("userId");

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();

    let userId = requestedUserId || user?.id;
    if (!userId) {
      userId = "8a88d60a-e2cf-43a6-b4ea-baa9347bfee1"; // Default to romanlnw68
    }

    // 1. ดึงรายการคำสั่งเช่าของผู้เช่าคนนี้
    const { data: rawOrders, error: ordersError } = await admin
      .from("rentalorder")
      .select("order_id, user_id, item_id, start_date, end_date, rental_fee, deposit, total_paid, status, meetup_location, return_location, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("Error fetching renter orders:", ordersError);
      return NextResponse.json({
        orders: [],
        metrics: { active: 0, pending: 0, completed: 0, totalSpent: 0 },
      });
    }

    const orderList = rawOrders || [];
    const itemIds = Array.from(new Set(orderList.map((o) => o.item_id).filter(Boolean)));
    const orderIds = orderList.map((o) => o.order_id);

    const [{ data: rawItems }, { data: rawPayments }] = await Promise.all([
      itemIds.length > 0
        ? admin.from("item").select("item_id, user_id, item_name, description, rental_fee_per_day, deposit, status").in("item_id", itemIds)
        : { data: [] },
      orderIds.length > 0
        ? admin.from("payment").select("order_id, status").in("order_id", orderIds)
        : { data: [] },
    ]);

    const itemMap = new Map<string, any>((rawItems || []).map((i) => [i.item_id, i]));
    const lenderUserIds = Array.from(new Set((rawItems || []).map((i) => i.user_id).filter(Boolean)));

    const { data: lenders } = lenderUserIds.length > 0
      ? await admin.from("useraccount").select("user_id, username, avatar_url").in("user_id", lenderUserIds)
      : { data: [] };

    const lenderMap = new Map<string, any>((lenders || []).map((l) => [l.user_id, l]));
    const pendingPaymentOrderIds = new Set(
      (rawPayments || []).filter((p) => p.status === "pending").map((p) => p.order_id)
    );

    const formattedOrders = orderList.map((o: any) => {
      const it = itemMap.get(o.item_id);
      const lender = it?.user_id ? lenderMap.get(it.user_id) : null;

      return {
        ...o,
        hasPendingPayment: pendingPaymentOrderIds.has(o.order_id),
        item: it
          ? {
              ...it,
              lender: lender
                ? {
                    username: lender.username || "เจ้าของสินค้า",
                    avatarUrl: lender.avatar_url ? `/api/avatar?id=${lender.user_id}` : null,
                  }
                : null,
            }
          : {
              item_id: o.item_id,
              item_name: "รายการอุปกรณ์",
              description: "",
              rental_fee_per_day: o.rental_fee || 0,
              deposit: o.deposit || 0,
              status: "available",
              lender: null,
            },
      };
    });

    // 2. คำนวณสรุปสถิติ
    const activeStatuses = [
      "requested",
      "awaiting_payment",
      "paid",
      "item_sent",
      "awaiting_additional_payment",
    ];
    const pendingStatuses = ["requested", "awaiting_payment"];
    const completedStatuses = ["completed", "item_returned"];

    const activeCount = formattedOrders.filter((o) =>
      activeStatuses.includes(o.status)
    ).length;
    const pendingCount = formattedOrders.filter((o) =>
      pendingStatuses.includes(o.status)
    ).length;
    const completedCount = formattedOrders.filter((o) =>
      completedStatuses.includes(o.status)
    ).length;
    const totalSpent = formattedOrders
      .filter(
        (o) =>
          o.status === "paid" ||
          o.status === "completed" ||
          o.status === "item_sent"
      )
      .reduce(
        (sum, o) =>
          sum + (Number(o.total_paid) || Number(o.rental_fee) || 0),
        0
      );

    return NextResponse.json({
      orders: formattedOrders,
      metrics: {
        active: activeCount,
        pending: pendingCount,
        completed: completedCount,
        totalSpent,
      },
    });
  } catch (err) {
    console.error("Error in /api/dashboard/renter:", err);
    return NextResponse.json(
      {
        orders: [],
        metrics: { active: 0, pending: 0, completed: 0, totalSpent: 0 },
      },
      { status: 500 }
    );
  }
}

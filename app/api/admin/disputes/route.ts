import { NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending_investigation";

    const admin = auth.admin;

    let query = admin
      .from("rentalreport")
      .select(
        `
        report_id,
        order_id,
        reporter_id,
        reported_user_id,
        report_type_id,
        description,
        status,
        verdict,
        damage_amount,
        created_at,
        updated_at,
        rentalreporttype (
          report_type_id,
          type_name
        ),
        rentalreportimage (
          report_image_id,
          image_url
        ),
        reporter:useraccount!rentalreport_reporter_id_fkey (
          user_id,
          username,
          email,
          firstname,
          lastname,
          avatar_url
        ),
        reported_user:useraccount!rentalreport_reported_user_id_fkey (
          user_id,
          username,
          email,
          firstname,
          lastname,
          avatar_url,
          status
        ),
        rentalorder (
          order_id,
          user_id,
          item_id,
          rental_fee,
          deposit,
          fee,
          status,
          start_date,
          end_date,
          meetup_location,
          return_location,
          renter:useraccount!rentalorder_user_id_fkey (
            user_id,
            username,
            email,
            firstname,
            lastname,
            avatar_url
          ),
          item (
            item_id,
            item_name,
            user_id,
            lender:useraccount!item_user_id_fkey (
              user_id,
              username,
              email,
              firstname,
              lastname,
              avatar_url
            ),
            itemimage (
              image_url,
              is_primary
            )
          )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: reports, error } = await query;

    if (error) {
      console.error("Error fetching disputes:", error);
      // Fallback query if joins fail due to relationship names
      const { data: rawReports, error: fallbackError } = await admin
        .from("rentalreport")
        .select("*")
        .order("created_at", { ascending: false });

      if (fallbackError) {
        return NextResponse.json(
          { message: "เกิดข้อผิดพลาดในการดึงข้อมูลข้อพิพาท", details: fallbackError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ reports: rawReports || [] });
    }

    return NextResponse.json({ reports: reports || [] });
  } catch (error) {
    console.error("GET /api/admin/disputes error:", error);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}

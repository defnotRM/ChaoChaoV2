// app/api/rentals/[id]/report/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const body = await request.json();
  // TODO: validate body.reportType (damaged_item / stolen_item / false_advertisement)
  // TODO: validate body.description, body.imageUrls

  const admin = createAdminClient();
  // TODO: เช็คว่า user เป็นคู่กรณีของ order นี้จริง (renter หรือ lender)
  // TODO: หา report_type_id จาก rentalreporttype ตาม body.reportType
  // TODO: insert rentalreport (order_id, reporter_id, report_type_id, description)
  // TODO: ถ้าเป็น false_advertisement → เปลี่ยน rentalorder.status = 'disputed_at_meetup'
  // TODO: insert rentalreportimage สำหรับแต่ละรูป

  return NextResponse.json({ ok: true });
}

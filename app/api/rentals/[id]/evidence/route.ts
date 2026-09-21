import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/api-response";
import { uploadEvidenceSchema } from "@/lib/validations/rental";
import { uploadMultipleImagesToStorage } from "@/lib/supabase/storage";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError("กรุณาเข้าสู่ระบบก่อน", 401);
  }

  const body = await request.json();
  const parsed = uploadEvidenceSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
    return apiError(firstError, 400, parsed.error.flatten());
  }

  const { evidenceType, imageUrls: rawImageUrls, newStatus } = parsed.data;

  let finalImageUrls = rawImageUrls;
  try {
    finalImageUrls = await uploadMultipleImagesToStorage(rawImageUrls, {
      bucket: "rental-evidence",
      folder: id,
      filenamePrefix: evidenceType,
    });
  } catch (storageErr) {
    console.warn("Storage upload failed for evidence, fallback to raw input:", storageErr);
    finalImageUrls = rawImageUrls;
  }

  const { error } = await supabase.rpc("upload_rental_evidence", {
    p_order_id: id,
    p_user_id: user.id,
    p_evidence_type: evidenceType,
    p_image_urls: finalImageUrls,
    p_new_status: newStatus ?? null,
  });

  if (error) {
    console.error("Error uploading rental evidence:", error);
    return apiError("ไม่สามารถอัปโหลดหลักฐานได้", 500, error.message);
  }

  // กรณีผู้เช่าเพิ่งอัปโหลดหลักฐานคืนของ (renter_after) และผู้ให้เช่าอัปโหลด
  // lender_after ไว้ก่อนแล้วรอผู้เช่าอยู่ — ต้องปิดยอดตรงนี้เลย ไม่งั้นจะค้าง
  if (evidenceType === "renter_after") {
    const admin = createAdminClient();
    const { data: lenderEvidence } = await admin
      .from("rentalevidenceimage")
      .select("evidence_type")
      .eq("order_id", id)
      .eq("evidence_type", "lender_after")
      .limit(1);

    if ((lenderEvidence?.length ?? 0) > 0) {
      const { error: settleError } = await supabase.rpc("settle_rental_order", {
        p_order_id: id,
        p_caller_id: user.id,
        p_outcome: "happy",
      });
      if (settleError) {
        console.error("settle_rental_order error:", settleError);
      }
    }
  }

  return apiSuccess({ message: "อัปโหลดหลักฐานสำเร็จ" }, 201);
}

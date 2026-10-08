import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/workflow/config
 * ดึงรายการการตั้งค่าระบบ (system_config) ทั้งหมด พร้อมโหมด workflow ปัจจุบัน
 */
export async function GET() {
  const auth = await verifyAdminApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { admin } = auth;

  try {
    const { data: configs, error } = await admin
      .from("system_config")
      .select("config_id, config_key, config_value, value_type, description, updated_at, updated_by")
      .order("config_key");

    if (error) {
      console.error("Fetch system_config error:", error);
      return NextResponse.json(
        { message: "ไม่สามารถดึงข้อมูลการตั้งค่าระบบได้", error: error.message },
        { status: 500 }
      );
    }

    // ดึงชื่อของผู้ที่อัปเดตล่าสุด (updated_by)
    const updaterIds = Array.from(
      new Set((configs || []).map((c) => c.updated_by).filter(Boolean))
    );

    let updatersMap: Record<string, string> = {};
    if (updaterIds.length > 0) {
      const { data: updaters } = await admin
        .from("useraccount")
        .select("user_id, username")
        .in("user_id", updaterIds);

      if (updaters) {
        updatersMap = updaters.reduce((acc, u) => {
          acc[u.user_id] = u.username;
          return acc;
        }, {} as Record<string, string>);
      }
    }

    const enrichedConfigs = (configs || []).map((cfg) => ({
      ...cfg,
      updated_by_username: cfg.updated_by ? updatersMap[cfg.updated_by] || "Admin" : null,
    }));

    const modeConfig = configs?.find((c) => c.config_key === "workflow_mode");
    const currentMode = modeConfig?.config_value || "static";

    return NextResponse.json({
      success: true,
      currentMode,
      configs: enrichedConfigs,
    });
  } catch (err: any) {
    console.error("GET /api/admin/workflow/config error:", err);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการดึงข้อมูล", error: err.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/workflow/config
 * อัปเดตค่าใน system_config หรือสลับ workflow_mode
 */
export async function PATCH(req: NextRequest) {
  const auth = await verifyAdminApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { admin, user } = auth;

  try {
    const body = await req.json();

    // 1. กรณีเปลี่ยนโหมด (workflow_mode)
    if (body.mode !== undefined) {
      const mode = String(body.mode).trim().toLowerCase();
      const validModes = ["static", "shadow", "dynamic"];
      if (!validModes.includes(mode)) {
        return NextResponse.json(
          { message: "โหมดไม่ถูกต้อง ต้องเป็น static, shadow หรือ dynamic เท่านั้น" },
          { status: 400 }
        );
      }

      const { error: updateError } = await admin
        .from("system_config")
        .update({
          config_value: mode,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("config_key", "workflow_mode");

      if (updateError) {
        console.error("Update workflow_mode error:", updateError);
        return NextResponse.json(
          { message: "ไม่สามารถสลับโหมด workflow ได้", error: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `เปลี่ยนโหมด Workflow เป็น "${mode}" สำเร็จ`,
        currentMode: mode,
      });
    }

    // 2. กรณีอัปเดตค่าการตั้งค่าทีละคีย์ ({ key, value })
    const { key, value } = body;
    if (!key || value === undefined) {
      return NextResponse.json(
        { message: "กรุณาระบุ key และ value ที่ต้องการอัปเดต" },
        { status: 400 }
      );
    }

    // ดึง type ปัจจุบันมาตรวจสอบ
    const { data: existing, error: findError } = await admin
      .from("system_config")
      .select("*")
      .eq("config_key", key)
      .single();

    if (findError || !existing) {
      return NextResponse.json(
        { message: `ไม่พบการตั้งค่า ${key} ในระบบ` },
        { status: 404 }
      );
    }

    const strVal = String(value).trim();

    // ตรวจสอบความถูกต้องตาม value_type
    switch (existing.value_type) {
      case "int": {
        const n = Number(strVal);
        if (isNaN(n) || !Number.isInteger(n)) {
          return NextResponse.json(
            { message: `ค่าของ "${key}" ต้องเป็นจำนวนเต็ม (Integer) เท่านั้น` },
            { status: 400 }
          );
        }
        if (n < 0) {
          return NextResponse.json(
            { message: `ค่าของ "${key}" ต้องไม่ติดลบ` },
            { status: 400 }
          );
        }
        break;
      }
      case "numeric": {
        const n = Number(strVal);
        if (isNaN(n)) {
          return NextResponse.json(
            { message: `ค่าของ "${key}" ต้องเป็นตัวเลข (Numeric) เท่านั้น` },
            { status: 400 }
          );
        }
        if (n < 0) {
          return NextResponse.json(
            { message: `ค่าของ "${key}" ต้องไม่ติดลบ` },
            { status: 400 }
          );
        }
        break;
      }
      case "bool": {
        if (strVal !== "true" && strVal !== "false") {
          return NextResponse.json(
            { message: `ค่าของ "${key}" ต้องเป็น true หรือ false เท่านั้น` },
            { status: 400 }
          );
        }
        break;
      }
      case "text":
      default:
        // text ทั่วไป ผ่าน
        break;
    }

    // อัปเดตลงตาราง
    const { error: updateError } = await admin
      .from("system_config")
      .update({
        config_value: strVal,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("config_key", key);

    if (updateError) {
      console.error("Update system_config error:", updateError);
      return NextResponse.json(
        { message: `ไม่สามารถอัปเดต ${key} ได้`, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `อัปเดตค่า "${key}" เป็น "${strVal}" สำเร็จ`,
      key,
      value: strVal,
      updated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("PATCH /api/admin/workflow/config error:", err);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการอัปเดตการตั้งค่า", error: err.message },
      { status: 500 }
    );
  }
}

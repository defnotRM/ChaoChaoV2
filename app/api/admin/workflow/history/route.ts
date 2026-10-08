import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/workflow/history
 * ดึงรายการประวัติการเปลี่ยนสถานะ (workflow_history) สูงสุด 100 แถว
 * รองรับตัวกรอง:
 * - filterViolations=true (เฉพาะที่ผิดกฎ: reason LIKE 'SHADOW_VIOLATION%')
 * - workflowCode=RENTAL_ORDER (เฉพาะวงจรที่กำหนด)
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { admin } = auth;
  const { searchParams } = new URL(req.url);

  const filterViolations = searchParams.get("filterViolations") === "true";
  const workflowCode = searchParams.get("workflowCode");
  const limit = Math.min(Number(searchParams.get("limit") || 100), 200);

  try {
    // 1. ดึงข้อมูล Workflows ทั้งหมดไว้เป็น cache map
    const { data: workflows } = await admin
      .from("workflow")
      .select("workflow_id, workflow_code, workflow_name");

    const workflowMap = (workflows || []).reduce((acc, w) => {
      acc[w.workflow_id] = w;
      return acc;
    }, {} as Record<string, { workflow_code: string; workflow_name: string }>);

    // 2. ดึงข้อมูล States ทั้งหมดไว้เป็น cache map
    const { data: states, error: statesError } = await admin
      .from("workflow_state")
      .select("state_id, state_code, state_name_th");

    if (statesError) {
      console.error("Query workflow_state error:", statesError);
      return NextResponse.json(
        { message: "ไม่สามารถดึงข้อมูลสถานะ workflow ได้", error: statesError.message },
        { status: 500 }
      );
    }

    const stateMap = (states || []).reduce((acc, s) => {
      acc[s.state_id] = s;
      return acc;
    }, {} as Record<string, { state_code: string; state_name_th: string }>);

    // 3. ดึงข้อมูล Transitions ทั้งหมดไว้เป็น cache map
    const { data: transitions } = await admin
      .from("workflow_transition")
      .select("transition_id, action_code, description");

    const transitionMap = (transitions || []).reduce((acc, t) => {
      acc[t.transition_id] = t;
      return acc;
    }, {} as Record<string, { action_code: string; description: string | null }>);

    // 4. Query ประวัติ workflow_history
    let query = admin
      .from("workflow_history")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (filterViolations) {
      query = query.ilike("reason", "SHADOW_VIOLATION%");
    }

    if (workflowCode && workflows) {
      const targetWf = workflows.find((w) => w.workflow_code === workflowCode);
      if (targetWf) {
        query = query.eq("workflow_id", targetWf.workflow_id);
      }
    }

    const { data: historyRows, error: histError } = await query;

    if (histError) {
      console.error("Query workflow_history error:", histError);
      return NextResponse.json(
        { message: "ไม่สามารถดึงข้อมูลประวัติ workflow ได้", error: histError.message },
        { status: 500 }
      );
    }

    // 5. ดึงข้อมูลผู้ใช้ (changed_by)
    const userIds = Array.from(
      new Set((historyRows || []).map((h) => h.changed_by).filter(Boolean))
    );

    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await admin
        .from("useraccount")
        .select("user_id, username")
        .in("user_id", userIds);

      if (users) {
        userMap = users.reduce((acc, u) => {
          acc[u.user_id] = u.username;
          return acc;
        }, {} as Record<string, string>);
      }
    }

    // 6. นับจำนวนการละเมิดกฎทั้งหมด (violation count)
    const { count: violationCount } = await admin
      .from("workflow_history")
      .select("*", { count: "exact", head: true })
      .ilike("reason", "SHADOW_VIOLATION%");

    // 7. จัดโครงสร้างข้อมูลส่งกลับ
    const enrichedHistory = (historyRows || []).map((h) => {
      const wf = workflowMap[h.workflow_id];
      const fromSt = h.from_state_id ? stateMap[h.from_state_id] : null;
      const toSt = stateMap[h.to_state_id];
      const trans = h.transition_id ? transitionMap[h.transition_id] : null;

      const isViolation = (h.reason || "").startsWith("SHADOW_VIOLATION");

      return {
        history_id: h.history_id,
        workflow_code: wf?.workflow_code || "UNKNOWN",
        workflow_name: wf?.workflow_name || "ไม่ระบุวงจร",
        entity_id: h.entity_id,
        from_state_code: fromSt?.state_code || "(เริ่มต้น)",
        from_state_name: fromSt?.state_name_th || "(เริ่มต้น)",
        to_state_code: toSt?.state_code || "unknown",
        to_state_name: toSt?.state_name_th || "ไม่ระบุ",
        action_code: trans?.action_code || null,
        action_description: trans?.description || null,
        changed_by_username: h.changed_by ? userMap[h.changed_by] || "ผู้ใช้" : "ระบบ (System / Cron)",
        reason: h.reason,
        is_violation: isViolation,
        changed_at: h.changed_at,
      };
    });

    return NextResponse.json({
      success: true,
      history: enrichedHistory,
      totalReturned: enrichedHistory.length,
      violationCount: violationCount || 0,
      workflows: (workflows || []).map((w) => ({
        code: w.workflow_code,
        name: w.workflow_name,
      })),
    });
  } catch (err: any) {
    console.error("GET /api/admin/workflow/history error:", err);
    return NextResponse.json(
      { message: "เกิดข้อผิดพลาดในการดึงข้อมูลประวัติ", error: err.message },
      { status: 500 }
    );
  }
}

import { createAdminClient } from "@/lib/supabase/admin";

// ตัวอ่านกฎ workflow จากฐานข้อมูล
// (ตาราง workflow / workflow_state / workflow_transition / workflow_transition_role)
//
// โหมดอ่านจาก system_config (workflow_mode):
//   static  = ไม่ใช้กฎจากฐานข้อมูล ใช้กฎเดิมในโค้ดทั้งหมด (ทำงานเหมือนก่อนมี workflow)
//   shadow  = ใช้กฎเดิมในโค้ด แต่เทียบกับฐานข้อมูลและ console.warn เมื่อไม่ตรงกัน
//   dynamic = ใช้กฎจากฐานข้อมูลเป็นตัวตัดสิน
// ถ้าอ่านฐานข้อมูลไม่ได้ (ตารางยังไม่มี / เครือข่ายขัดข้อง) จะคืน "static" หรือ null
// เพื่อให้ผู้เรียกใช้กฎเดิมในโค้ดแทน (fail-safe ไม่ทำให้ระบบหยุดทำงาน)

export type WorkflowMode = "static" | "shadow" | "dynamic";
export type WorkflowActor = "renter" | "lender" | "admin";

export interface TransitionCheck {
  ok: boolean;
  reason: "ok" | "unknown_state" | "no_transition" | "no_permission";
  actions: string[];
}

interface StateRow {
  state_id: string;
  state_code: string;
}
interface TransitionRow {
  transition_id: string;
  action_code: string;
}
interface RoleLinkRow {
  transition_id: string;
  role: { role_type: string } | { role_type: string }[] | null;
}

const MODE_TTL_MS = 5_000;
let modeCache: { value: WorkflowMode; at: number } | null = null;

export async function getWorkflowMode(): Promise<WorkflowMode> {
  const now = Date.now();
  if (modeCache && now - modeCache.at < MODE_TTL_MS) return modeCache.value;

  let value: WorkflowMode = "static";
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_config")
      .select("config_value")
      .eq("config_key", "workflow_mode")
      .maybeSingle();
    const raw = (data as { config_value?: string } | null)?.config_value;
    if (!error && (raw === "shadow" || raw === "dynamic")) value = raw;
  } catch (err) {
    console.warn("[workflow] อ่านโหมดไม่ได้ ใช้ static แทน:", err);
  }
  modeCache = { value, at: now };
  return value;
}

// ตรวจว่า "จากสถานะ -> ไปสถานะ" มีเส้นทางไหม และ actors (ผู้เช่า/ผู้ให้เช่า/แอดมิน ของรายการนี้)
// มีบทบาทที่เส้นทางนั้นอนุญาตไหม คืน null ถ้าอ่านกฎจากฐานข้อมูลไม่ได้
export async function checkTransition(
  workflowCode: string,
  fromState: string,
  toState: string,
  actors: WorkflowActor[],
): Promise<TransitionCheck | null> {
  try {
    const admin = createAdminClient();

    const { data: wf, error: wfErr } = await admin
      .from("workflow")
      .select("workflow_id")
      .eq("workflow_code", workflowCode)
      .eq("is_active", true)
      .maybeSingle();
    if (wfErr || !wf) return null;
    const workflowId = (wf as { workflow_id: string }).workflow_id;

    const { data: stData, error: stErr } = await admin
      .from("workflow_state")
      .select("state_id, state_code")
      .eq("workflow_id", workflowId)
      .in("state_code", [fromState, toState]);
    if (stErr || !stData) return null;
    const states = stData as StateRow[];
    const from = states.find((s) => s.state_code === fromState);
    const to = states.find((s) => s.state_code === toState);
    if (!from || !to)
      return { ok: false, reason: "unknown_state", actions: [] };

    const { data: trData, error: trErr } = await admin
      .from("workflow_transition")
      .select("transition_id, action_code")
      .eq("from_state_id", from.state_id)
      .eq("to_state_id", to.state_id);
    if (trErr || !trData) return null;
    const transitions = trData as TransitionRow[];
    if (transitions.length === 0) {
      return { ok: false, reason: "no_transition", actions: [] };
    }

    const { data: roleData, error: roleErr } = await admin
      .from("workflow_transition_role")
      .select("transition_id, role(role_type)")
      .in(
        "transition_id",
        transitions.map((t) => t.transition_id),
      );
    if (roleErr || !roleData) return null;
    const roleLinks = roleData as unknown as RoleLinkRow[];

    const actions: string[] = [];
    for (const t of transitions) {
      const roleTypes = roleLinks
        .filter((r) => r.transition_id === t.transition_id)
        .flatMap((r) =>
          Array.isArray(r.role) ? r.role : r.role ? [r.role] : [],
        )
        .map((r) => r.role_type);
      if (roleTypes.some((rt) => (actors as string[]).includes(rt))) {
        actions.push(t.action_code);
      }
    }

    return actions.length > 0
      ? { ok: true, reason: "ok", actions }
      : { ok: false, reason: "no_permission", actions: [] };
  } catch (err) {
    console.warn("[workflow] อ่านกฎจากฐานข้อมูลไม่ได้:", err);
    return null;
  }
}

// ตัวตรวจกลางสำหรับ route ที่เขียนสถานะด้วย service role (ฐานข้อมูลตรวจ "ใครกด" ไม่ได้ แอปจึงต้องตรวจเอง)
//   static  = ใช้กฎในโค้ด (codeAllowedFrom)
//   shadow  = ใช้กฎในโค้ดเป็นตัวตัดสิน แต่เทียบกับฐานข้อมูลและ console.warn เมื่อไม่ตรงกัน
//   dynamic = ใช้กฎจากฐานข้อมูลเป็นตัวตัดสิน (อ่านฐานข้อมูลไม่ได้ = ใช้กฎในโค้ด)
export interface EnforceArgs {
  workflow: string;
  from: string;
  to: string;
  actors: WorkflowActor[];
  codeAllowedFrom: string[];
  label?: string;
}

export interface EnforceResult {
  allowed: boolean;
  mode: WorkflowMode;
  source: "code" | "db";
  reason: string;
}

export async function enforceTransition(
  a: EnforceArgs,
): Promise<EnforceResult> {
  const codeAllowed = a.codeAllowedFrom.includes(a.from);
  const mode = await getWorkflowMode();
  const byCode: EnforceResult = {
    allowed: codeAllowed,
    mode,
    source: "code",
    reason: codeAllowed ? "ok" : "code_rule",
  };
  if (mode === "static") return byCode;

  const db = await checkTransition(a.workflow, a.from, a.to, a.actors);
  if (!db) return byCode;

  if (db.ok !== codeAllowed) {
    console.warn(
      `[workflow] กฎในโค้ดกับฐานข้อมูลไม่ตรงกัน ${a.label ?? a.workflow} ${a.from}->${a.to} code=${codeAllowed} db=${db.ok} (${db.reason})`,
    );
  }
  if (mode === "dynamic") {
    return { allowed: db.ok, mode, source: "db", reason: db.reason };
  }
  return byCode;
}

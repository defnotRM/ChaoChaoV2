-- ============================================================================
-- 15_expiry_cron.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- ตั้ง pg_cron ให้รัน process_expired_orders() ทุก 10 นาที จัดการ deadline/no-show
-- อัตโนมัติที่ก่อนหน้านี้มีแค่ UI countdown เฉยๆ ไม่มีอะไรบังคับจริงฝั่ง backend เลย
--
-- *** ข้อจำกัดที่ต้องรู้: ส่วน FR-28 (เลยเวลาคืน ผู้เช่าคืนแล้วแต่ผู้ให้เช่าไม่มารับ)
-- เขียน logic ไว้ถูกต้องแต่ยังไม่มีทางถูกเรียกใช้จริง เพราะแอปยังไม่มีหน้า/endpoint
-- ให้ผู้เช่าอัปโหลดหลักฐาน renter_after (ตอนคืนของ) เลยสักจุด — ต้องสร้างเพิ่มเป็นงานแยก ***
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.process_expired_orders()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r              RECORD;
  v_lender_came  BOOLEAN;
  v_renter_came  BOOLEAN;
BEGIN
  UPDATE rentalorder
  SET status = 'rejected_by_lender', updated_at = NOW()
  WHERE status = 'requested' AND created_at < NOW() - INTERVAL '12 hours';

  UPDATE rentalorder
  SET status = 'cancelled', updated_at = NOW()
  WHERE status = 'awaiting_payment' AND updated_at < NOW() - INTERVAL '12 hours';

  FOR r IN
    SELECT ro.order_id, it.user_id AS lender_id
    FROM rentalorder ro
    JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status = 'paid'
      AND (ro.start_date + COALESCE(ro.meetup_time, '00:00'::time) + INTERVAL '1 hour') < NOW()
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM rentalevidenceimage WHERE order_id = r.order_id AND evidence_type = 'lender_before'
    ) INTO v_lender_came;

    SELECT EXISTS (
      SELECT 1 FROM rentalevidenceimage WHERE order_id = r.order_id AND evidence_type = 'renter_before'
    ) INTO v_renter_came;

    IF NOT v_lender_came THEN
      PERFORM settle_rental_order(r.order_id, r.lender_id, 'lender_noshow');
    ELSIF NOT v_renter_came THEN
      PERFORM settle_rental_order(r.order_id, r.lender_id, 'renter_noshow');
    END IF;
  END LOOP;

  FOR r IN
    SELECT ro.order_id, it.user_id AS lender_id
    FROM rentalorder ro
    JOIN item it ON it.item_id = ro.item_id
    WHERE ro.status IN ('item_sent', 'item_received')
      AND (ro.end_date + COALESCE(ro.return_time, '00:00'::time) + INTERVAL '1 hour') < NOW()
      AND EXISTS (
        SELECT 1 FROM rentalevidenceimage WHERE order_id = ro.order_id AND evidence_type = 'renter_after'
      )
      AND NOT EXISTS (
        SELECT 1 FROM rentalevidenceimage WHERE order_id = ro.order_id AND evidence_type = 'lender_after'
      )
  LOOP
    PERFORM settle_rental_order(r.order_id, r.lender_id, 'happy');
  END LOOP;

  UPDATE useraccount ua
  SET status = 'Suspended', updated_at = NOW()
  FROM payment p
  JOIN rentalorder ro ON ro.order_id = p.order_id
  WHERE p.user_id = ua.user_id
    AND p.status = 'pending'
    AND p.created_at < NOW() - INTERVAL '48 hours'
    AND ro.status = 'awaiting_additional_payment';
END;
$$;

SELECT cron.schedule(
  'process-expired-orders',
  '*/10 * * * *',
  $$ SELECT public.process_expired_orders(); $$
);

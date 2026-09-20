-- ============================================================================
-- 23_review_reply_account_reports.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
-- ============================================================================

-- FR-41: ผู้ให้เช่าตอบกลับรีวิวได้
ALTER TABLE review
  ADD COLUMN lender_reply TEXT,
  ADD COLUMN lender_reply_at TIMESTAMPTZ;

DROP POLICY IF EXISTS review_write ON review;

CREATE POLICY review_insert ON review FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM rentalorder ro WHERE ro.order_id = review.order_id AND ro.user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY review_update ON review FOR UPDATE
  USING (is_order_participant(order_id) OR is_admin())
  WITH CHECK (is_order_participant(order_id) OR is_admin());

CREATE POLICY review_delete ON review FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM rentalorder ro WHERE ro.order_id = review.order_id AND ro.user_id = auth.uid())
    OR is_admin()
  );

-- FR-39: รายงานบัญชีได้โดยไม่ต้องผูกกับ order
ALTER TABLE rentalreport ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE rentalreport ADD COLUMN reported_user_id UUID REFERENCES useraccount(user_id);

ALTER TABLE rentalreport ADD CONSTRAINT rentalreport_has_target
  CHECK (order_id IS NOT NULL OR reported_user_id IS NOT NULL);

INSERT INTO rentalreporttype (type_name) VALUES ('account_report')
  ON CONFLICT DO NOTHING;

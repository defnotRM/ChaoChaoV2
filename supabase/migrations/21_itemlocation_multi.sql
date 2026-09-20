-- ============================================================================
-- 21_itemlocation_multi.sql
-- Apply แล้วจริงบน Supabase Cloud (project: ChaoChao) — ไฟล์นี้บันทึกไว้ในโค้ด
--
-- requirement ใหม่: ผู้ให้เช่าเพิ่มสถานที่นัดรับ/นัดคืนได้มากกว่า 1 ที่ ผู้เช่า
-- เลือกจากตัวเลือกที่เปิดไว้ทีหลัง — ตาราง itemlocation รองรับหลายแถวต่อ item
-- อยู่แล้วโดยธรรมชาติ (ไม่มี UNIQUE บน item_id) แค่ขาดคอลัมน์บอกว่าแถวไหนใช้
-- ตอนนัดรับ ตอนนัดคืน หรือใช้ได้ทั้งคู่
-- ============================================================================

ALTER TABLE itemlocation
  ADD COLUMN location_type TEXT NOT NULL DEFAULT 'both'
    CHECK (location_type IN ('meetup', 'return', 'both'));

CREATE OR REPLACE FUNCTION public.create_item_listing(
  p_user_id uuid, p_category_id uuid, p_item_name text, p_description text,
  p_original_price numeric, p_rental_fee_per_day numeric, p_deposit numeric,
  p_images jsonb, p_locations jsonb, p_availability_start date,
  p_availability_end date, p_conditions text[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_item_id UUID;
  v_img     JSONB;
  v_loc     JSONB;
  v_cond    TEXT;
  v_seq     INTEGER := 1;
BEGIN
  IF p_user_id <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ลงประกาศสินค้าแทนผู้ใช้คนอื่น';
  END IF;

  INSERT INTO public.item (user_id, category_id, item_name, description,
                           original_price, rental_fee_per_day, deposit, status)
  VALUES (p_user_id, p_category_id, p_item_name, p_description,
          p_original_price, p_rental_fee_per_day, p_deposit, 'available')
  RETURNING item_id INTO v_item_id;

  FOR v_img IN SELECT * FROM jsonb_array_elements(p_images) LOOP
    INSERT INTO public.itemimage (item_id, image_url, is_primary, sequence)
    VALUES (v_item_id, v_img->>'image_url',
            COALESCE((v_img->>'is_primary')::boolean, false),
            (v_img->>'sequence')::integer);
  END LOOP;

  FOR v_loc IN SELECT * FROM jsonb_array_elements(p_locations) LOOP
    INSERT INTO public.itemlocation (item_id, description, no, alley, road, subdistrict, district, province, location_type)
    VALUES (v_item_id, v_loc->>'description', v_loc->>'no', v_loc->>'alley', v_loc->>'road',
            v_loc->>'subdistrict', v_loc->>'district', v_loc->>'province',
            COALESCE(v_loc->>'location_type', 'both'));
  END LOOP;

  INSERT INTO public.availability (item_id, start_date, end_date)
  VALUES (v_item_id, p_availability_start, p_availability_end);

  FOREACH v_cond IN ARRAY p_conditions LOOP
    INSERT INTO public.itemcondition (item_id, seq, condition) VALUES (v_item_id, v_seq, v_cond);
    v_seq := v_seq + 1;
  END LOOP;

  RETURN v_item_id;
END;
$function$;

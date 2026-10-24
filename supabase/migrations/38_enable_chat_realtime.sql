-- ============================================================================
-- 38_enable_chat_realtime.sql
-- เปิดการส่งข้อมูล Realtime ผ่าน PostgreSQL Replication สำหรับตารางแชท
-- ============================================================================

DO $$
BEGIN
  -- เพิ่มตาราง message เข้าสู่ publication supabase_realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'message'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message;
  END IF;

  -- เพิ่มตาราง chatroom เข้าสู่ publication supabase_realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'chatroom'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chatroom;
  END IF;
END $$;

ALTER TABLE public.message REPLICA IDENTITY FULL;
ALTER TABLE public.chatroom REPLICA IDENTITY FULL;
